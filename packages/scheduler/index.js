/**
 * Scheduler Package — One-shot and recurring reminders
 *
 * Uses SQLite for persistence + in-memory poll loop.
 * Pattern: OpenClaw cron + wakeups with isolated worker execution.
 * @module packages/scheduler
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { sharedConfig } from '../config/index.js';
import { MarkdownSync } from '../utils/markdownSync.js';

let db = null;
let pollTimer = null;
let sync = null;

/** @type {((reminder: ReminderRow) => Promise<void>) | null} */
let deliveryCallback = null;

/**
 * @typedef {Object} ReminderRow
 * @property {number} id
 * @property {string} user_id
 * @property {string} channel_id
 * @property {string} guild_id
 * @property {string} message
 * @property {string} fire_at — ISO datetime
 * @property {string} status — 'pending' | 'fired' | 'failed'
 * @property {string} created_at
 */

function getDb() {
    if (db) return db;

    const dbPath = sharedConfig.scheduler.dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      guild_id   TEXT DEFAULT '',
      message    TEXT NOT NULL,
      fire_at    TEXT NOT NULL,
      status     TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      fired_at   TEXT,
      error      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders(fire_at, status);
  `);

    sync = new MarkdownSync(db);
    // Sync from MD first
    sync.syncMdToTable('reminders', 'reminders.md', ['id']);
    // Sync to MD
    sync.syncTableToMd('reminders', 'reminders.md', 'Reminders');

    return db;
}

// ── Natural language time parsing ────────────────────────────────

/**
 * Parse a natural language time string into a Date.
 * Supports: "in 5 minutes", "in 2 hours", "in 1 day", "tomorrow at 9am",
 *           ISO dates, and relative times.
 * @param {string} input
 * @returns {Date|null}
 */
export function parseTime(input) {
    if (!input) return null;
    const trimmed = input.trim().toLowerCase();

    // ISO datetime
    const iso = Date.parse(input.trim());
    if (!isNaN(iso) && input.trim().match(/\d{4}-\d{2}/)) {
        return new Date(iso);
    }

    // Relative: "in X minutes/hours/days/seconds"
    const relMatch = trimmed.match(/^in\s+(\d+\.?\d*)\s+(second|minute|hour|day|week|month)s?$/);
    if (relMatch) {
        const amount = parseFloat(relMatch[1]);
        const unit = relMatch[2];
        const multipliers = {
            second: 1000,
            minute: 60 * 1000,
            hour: 3600 * 1000,
            day: 86400 * 1000,
            week: 7 * 86400 * 1000,
            month: 30 * 86400 * 1000,
        };
        return new Date(Date.now() + amount * multipliers[unit]);
    }

    // "tomorrow at HH:MM" or "tomorrow at Ham/Hpm"
    const tomorrowMatch = trimmed.match(/^tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (tomorrowMatch) {
        let hours = parseInt(tomorrowMatch[1]);
        const minutes = parseInt(tomorrowMatch[2] || '0');
        const ampm = tomorrowMatch[3];
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(hours, minutes, 0, 0);
        return d;
    }

    // "today at HH:MM" or just "at HH:MM"
    const todayMatch = trimmed.match(/^(?:today\s+)?at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (todayMatch) {
        let hours = parseInt(todayMatch[1]);
        const minutes = parseInt(todayMatch[2] || '0');
        const ampm = todayMatch[3];
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        const d = new Date();
        d.setHours(hours, minutes, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + 1); // next occurrence
        return d;
    }

    return null;
}

// ── CRUD ─────────────────────────────────────────────────────────

/**
 * Create a new reminder.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.channelId
 * @param {string} [params.guildId]
 * @param {string} params.message
 * @param {Date} params.fireAt
 * @returns {ReminderRow}
 */
export function createReminder({ userId, channelId, guildId = '', message, fireAt }) {
    const d = getDb();
    const stmt = d.prepare(`
    INSERT INTO reminders (user_id, channel_id, guild_id, message, fire_at)
    VALUES (?, ?, ?, ?, ?)
  `);
    const info = stmt.run(userId, channelId, guildId, message, fireAt.toISOString());
    const result = d.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid);
    if (sync) sync.syncTableToMd('reminders', 'reminders.md', 'Reminders');
    return result;
}

/**
 * Get pending reminders that are due.
 * @returns {ReminderRow[]}
 */
export function getDueReminders() {
    const d = getDb();
    return d.prepare(`
    SELECT * FROM reminders
    WHERE status = 'pending' AND fire_at <= datetime('now')
    ORDER BY fire_at ASC
  `).all();
}

/**
 * Mark a reminder as fired.
 * @param {number} id
 */
export function markFired(id) {
    const d = getDb();
    d.prepare(`UPDATE reminders SET status = 'fired', fired_at = datetime('now') WHERE id = ?`).run(id);
    if (sync) sync.syncTableToMd('reminders', 'reminders.md', 'Reminders');
}

/**
 * Mark a reminder as failed.
 * @param {number} id
 * @param {string} error
 */
export function markFailed(id, error) {
    const d = getDb();
    d.prepare(`UPDATE reminders SET status = 'failed', error = ? WHERE id = ?`).run(error, id);
    if (sync) sync.syncTableToMd('reminders', 'reminders.md', 'Reminders');
}

// ── Poll Loop ────────────────────────────────────────────────────

/**
 * Start the reminder poll loop.
 * @param {(reminder: ReminderRow) => Promise<void>} callback — called for each due reminder
 */
export function startScheduler(callback) {
    deliveryCallback = callback;
    // Initialize DB
    getDb();

    pollTimer = setInterval(async () => {
        try {
            const due = getDueReminders();
            for (const reminder of due) {
                try {
                    await deliveryCallback(reminder);
                    markFired(reminder.id);
                } catch (err) {
                    console.error(`[Scheduler] Failed to deliver reminder ${reminder.id}:`, err.message);
                    markFailed(reminder.id, err.message);
                }
            }
        } catch (err) {
            console.error('[Scheduler] Poll error:', err.message);
        }
    }, sharedConfig.scheduler.pollIntervalMs);

    console.log(`✅ [Scheduler] Started (polling every ${sharedConfig.scheduler.pollIntervalMs}ms)`);
}

/**
 * Stop the scheduler poll loop.
 */
export function stopScheduler() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}
