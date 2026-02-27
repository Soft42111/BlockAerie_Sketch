/**
 * Memory Package
 * - Short-term: per-channel/thread/DM conversation context (Map with TTL)
 * - Long-term: per-user preference storage (SQLite via better-sqlite3)
 *
 * Pattern: OpenClaw session model (main for direct, group isolation)
 * @module packages/memory
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { sharedConfig } from '../config/index.js';

// ── Short-Term Memory (conversation context) ────────────────────

/** @type {Map<string, {messages: Array<{role: string, content: string}>, expiresAt: number}>} */
const shortTermStore = new Map();

const TTL = sharedConfig.memory.shortTermTtlMs;
const MAX_CONTEXT_MESSAGES = 20;

/**
 * Get conversation context for a channel/thread/DM.
 * @param {string} contextId — channel.id or thread.id
 * @returns {Array<{role: string, content: string}>}
 */
export function getContext(contextId) {
    const entry = shortTermStore.get(contextId);
    if (!entry || Date.now() > entry.expiresAt) {
        shortTermStore.delete(contextId);
        return [];
    }
    return entry.messages;
}

/**
 * Add a message to conversation context.
 * @param {string} contextId
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
export function addToContext(contextId, role, content) {
    let entry = shortTermStore.get(contextId);
    if (!entry || Date.now() > entry.expiresAt) {
        entry = { messages: [], expiresAt: 0 };
    }
    entry.messages.push({ role, content });
    // Trim to max length
    if (entry.messages.length > MAX_CONTEXT_MESSAGES) {
        entry.messages = entry.messages.slice(-MAX_CONTEXT_MESSAGES);
    }
    entry.expiresAt = Date.now() + TTL;
    shortTermStore.set(contextId, entry);
}

/**
 * Clear conversation context for a channel.
 * @param {string} contextId
 */
export function clearContext(contextId) {
    shortTermStore.delete(contextId);
}

// Periodic cleanup of expired entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of shortTermStore) {
        if (now > entry.expiresAt) shortTermStore.delete(key);
    }
}, 60000);

// ── Long-Term Memory (Dual-Storage: SQLite + Markdown) ─────────────────

const MEMORY_DIR = path.join(process.cwd(), 'memory');

let db = null;
function getDb() {
    if (db) return db;
    const dbPath = sharedConfig.memory.dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
    CREATE TABLE IF NOT EXISTS user_memory (
      user_id TEXT NOT NULL,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    );
  `);
    return db;
}

/**
 * Get path to user's MD memory file
 */
function getUserMemoryPath(userId) {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
    return path.join(MEMORY_DIR, `user_${userId}.md`);
}

/**
 * Sync SQLite data TO Markdown file (Overwrite MD)
 * @param {string} userId 
 */
function syncSqliteToMd(userId) {
    const d = getDb();
    const rows = d.prepare('SELECT key, value, updated_at FROM user_memory WHERE user_id = ? ORDER BY key').all(userId);

    const filePath = getUserMemoryPath(userId);
    let content = `# User Memory: ${userId}\n\n`;
    content += `> [!NOTE]\n`;
    content += `> This file is a human-friendly mirror of the bot's database. \n`;
    content += `> You can edit the values in the table below, and the bot will sync them back.\n\n`;
    content += `| Key | Value | Updated At |\n`;
    content += `|-----|-------|------------|\n`;

    for (const row of rows) {
        content += `| ${row.key} | ${row.value} | ${row.updated_at} |\n`;
    }

    fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Sync Markdown file TO SQLite (Update SQL)
 * @param {string} userId 
 */
function syncMdToSqlite(userId) {
    const filePath = getUserMemoryPath(userId);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const d = getDb();

    const upsert = d.prepare(`
        INSERT INTO user_memory (user_id, key, value, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);

    // Parse the table
    for (const line of lines) {
        const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            if (key !== 'Key' && !key.startsWith('---')) {
                upsert.run(userId, key, value);
            }
        }
    }
}

/**
 * Save a key-value pair for a specific user.
 */
export function saveUserMemory(userId, key, value) {
    const d = getDb();
    d.prepare(`
        INSERT INTO user_memory (user_id, key, value, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(userId, key, value);

    syncSqliteToMd(userId);
}

/**
 * Get a stored value for a user.
 */
export function getUserMemory(userId, key) {
    // Before reading, sync from MD to catch manual user edits
    syncMdToSqlite(userId);

    const d = getDb();
    const row = d.prepare('SELECT value FROM user_memory WHERE user_id = ? AND key = ?').get(userId, key);
    return row ? row.value : null;
}

/**
 * List all memory keys for a user.
 */
export function listUserMemory(userId) {
    syncMdToSqlite(userId);

    const d = getDb();
    return d.prepare('SELECT key, value, updated_at FROM user_memory WHERE user_id = ? ORDER BY key').all(userId);
}

/**
 * Delete a memory key for a user.
 */
export function deleteUserMemory(userId, key) {
    const d = getDb();
    const result = d.prepare('DELETE FROM user_memory WHERE user_id = ? AND key = ?').run(userId, key);

    if (result.changes > 0) {
        syncSqliteToMd(userId);
        return true;
    }
    return false;
}

/**
 * Delete all memory for a user.
 */
export function deleteAllUserMemory(userId) {
    const d = getDb();
    d.prepare('DELETE FROM user_memory WHERE user_id = ?').run(userId);

    const filePath = getUserMemoryPath(userId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
