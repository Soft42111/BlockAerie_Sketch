import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { MarkdownSync } from '../../packages/utils/markdownSync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'bot_database.sqlite');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.cache = new Map();
        this.cacheTTL = 30000;
        this.statementCache = new Map();
        this.initialized = false;
        this.sync = null;
    }

    async initialize() {
        if (this.initialized) return;

        this.db = new Database(DB_PATH, { timeout: 5000 });
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('cache_size = 64000');
        this.db.pragma('temp_store = MEMORY');

        await this.createTables();
        this.createIndexes();

        this.sync = new MarkdownSync(this.db);
        this.syncAll();

        this.initialized = true;
        console.log('Database initialized at:', DB_PATH);
    }

    syncAll() {
        if (!this.sync) return;
        // Sync these back from MD first to pick up human changes
        this.sync.syncMdToTable('users', 'registry.md', ['discord_id']);
        this.sync.syncMdToTable('server_settings', 'server_settings.md', ['guild_id']);
        this.sync.syncMdToTable('user_reputation', 'reputation.md', ['user_id']);

        // Then output current state
        this.sync.syncTableToMd('users', 'registry.md', 'User Registry');
        this.sync.syncTableToMd('moderation_logs', 'moderation_logs.md', 'Moderation Logs');
        this.sync.syncTableToMd('server_settings', 'server_settings.md', 'Server Settings');
        this.sync.syncTableToMd('user_reputation', 'reputation.md', 'User Reputation');
    }

    async createTables() {
        const createTableQueries = [
            `CREATE TABLE IF NOT EXISTS users (
                discord_id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                reputation_score INTEGER DEFAULT 0,
                join_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                warnings_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS moderation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                action TEXT NOT NULL,
                reason TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                guild_id TEXT NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS server_settings (
                guild_id TEXT PRIMARY KEY,
                settings_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS anti_spam_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                message_count INTEGER DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                guild_id TEXT NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS user_reputation (
                user_id TEXT PRIMARY KEY,
                positive_votes INTEGER DEFAULT 0,
                negative_votes INTEGER DEFAULT 0,
                last_vote DATETIME
            )`
        ];

        for (const query of createTableQueries) {
            this.db.exec(query);
        }
    }

    createIndexes() {
        const indexQueries = [
            `CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)`,
            `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
            `CREATE INDEX IF NOT EXISTS idx_moderation_logs_user_id ON moderation_logs(user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_moderation_logs_guild_id ON moderation_logs(guild_id)`,
            `CREATE INDEX IF NOT EXISTS idx_moderation_logs_timestamp ON moderation_logs(timestamp)`,
            `CREATE INDEX IF NOT EXISTS idx_server_settings_guild_id ON server_settings(guild_id)`,
            `CREATE INDEX IF NOT EXISTS idx_anti_spam_records_user_id ON anti_spam_records(user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_anti_spam_records_guild_id ON anti_spam_records(guild_id)`,
            `CREATE INDEX IF NOT EXISTS idx_anti_spam_records_timestamp ON anti_spam_records(timestamp)`,
            `CREATE INDEX IF NOT EXISTS idx_user_reputation_user_id ON user_reputation(user_id)`
        ];

        for (const query of indexQueries) {
            this.db.exec(query);
        }
    }

    getCached(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }
        if (cached) {
            this.cache.delete(key);
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
        if (this.cache.size > 100) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    invalidateCache(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    prepareStatement(sql) {
        if (!this.statementCache.has(sql)) {
            this.statementCache.set(sql, this.db.prepare(sql));
        }
        return this.statementCache.get(sql);
    }

    async executeInTransaction(operations) {
        const transaction = this.db.transaction(() => {
            return operations();
        });
        return transaction();
    }

    async usersCreate(discordId, username) {
        const stmt = this.prepareStatement(`
            INSERT OR IGNORE INTO users (discord_id, username) VALUES (?, ?)
        `);
        stmt.run(discordId, username);
        this.invalidateCache('users');
        this.sync.syncTableToMd('users', 'registry.md', 'User Registry');
    }

    async usersGetById(discordId) {
        const cacheKey = `users:${discordId}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        const stmt = this.prepareStatement(`
            SELECT * FROM users WHERE discord_id = ?
        `);
        const result = stmt.get(discordId);
        if (result) this.setCache(cacheKey, result);
        return result;
    }

    async usersGetByUsername(username) {
        const stmt = this.prepareStatement(`
            SELECT * FROM users WHERE username = ?
        `);
        return stmt.get(username);
    }

    async usersGetAll(limit = 100, offset = 0) {
        const stmt = this.prepareStatement(`
            SELECT * FROM users ORDER BY join_date DESC LIMIT ? OFFSET ?
        `);
        return stmt.all(limit, offset);
    }

    async usersUpdate(discordId, data) {
        const allowedFields = ['username', 'reputation_score', 'warnings_count'];
        const updates = [];
        const values = [];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(data[field]);
            }
        }

        if (updates.length === 0) return false;

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(discordId);

        const stmt = this.prepareStatement(`
            UPDATE users SET ${updates.join(', ')} WHERE discord_id = ?
        `);
        const result = stmt.run(...values);
        this.invalidateCache(`users:${discordId}`);
        this.invalidateCache('users');
        this.sync.syncTableToMd('users', 'registry.md', 'User Registry');
        return result.changes > 0;
    }

    async usersIncrementReputation(discordId, amount) {
        const stmt = this.prepareStatement(`
            UPDATE users SET reputation_score = reputation_score + ?, 
            updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?
        `);
        stmt.run(amount, discordId);
        this.invalidateCache(`users:${discordId}`);
        this.sync.syncTableToMd('users', 'registry.md', 'User Registry');
    }

    async usersIncrementWarnings(discordId) {
        const stmt = this.prepareStatement(`
            UPDATE users SET warnings_count = warnings_count + 1,
            updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?
        `);
        stmt.run(discordId);
        this.invalidateCache(`users:${discordId}`);
        this.sync.syncTableToMd('users', 'registry.md', 'User Registry');
    }

    async usersDelete(discordId) {
        const stmt = this.prepareStatement(`
            DELETE FROM users WHERE discord_id = ?
        `);
        const result = stmt.run(discordId);
        this.invalidateCache(`users:${discordId}`);
        this.invalidateCache('users');
        this.sync.syncTableToMd('users', 'registry.md', 'User Registry');
        return result.changes > 0;
    }

    async usersGetTopReputation(limit = 10) {
        const stmt = this.prepareStatement(`
            SELECT * FROM users ORDER BY reputation_score DESC LIMIT ?
        `);
        return stmt.all(limit);
    }

    async usersSearch(query, limit = 20) {
        const stmt = this.prepareStatement(`
            SELECT * FROM users WHERE username LIKE ? ORDER BY reputation_score DESC LIMIT ?
        `);
        return stmt.all(`%${query}%`, limit);
    }

    async moderationLogsCreate(userId, moderatorId, action, reason, guildId) {
        const stmt = this.prepareStatement(`
            INSERT INTO moderation_logs (user_id, moderator_id, action, reason, guild_id)
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = stmt.run(userId, moderatorId, action, reason, guildId);
        this.invalidateCache('moderation_logs');
        this.sync.syncTableToMd('moderation_logs', 'moderation_logs.md', 'Moderation Logs');
        return result.lastInsertRowid;
    }

    async moderationLogsGetById(id) {
        const cacheKey = `mod_log:${id}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        const stmt = this.prepareStatement(`
            SELECT * FROM moderation_logs WHERE id = ?
        `);
        const result = stmt.get(id);
        if (result) this.setCache(cacheKey, result);
        return result;
    }

    async moderationLogsGetByUserId(userId, limit = 50) {
        const stmt = this.prepareStatement(`
            SELECT * FROM moderation_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?
        `);
        return stmt.all(userId, limit);
    }

    async moderationLogsGetByGuildId(guildId, limit = 100) {
        const stmt = this.prepareStatement(`
            SELECT * FROM moderation_logs WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?
        `);
        return stmt.all(guildId, limit);
    }

    async moderationLogsGetByAction(action, limit = 100) {
        const stmt = this.prepareStatement(`
            SELECT * FROM moderation_logs WHERE action = ? ORDER BY timestamp DESC LIMIT ?
        `);
        return stmt.all(action, limit);
    }

    async moderationLogsGetRecent(guildId, days = 7) {
        const stmt = this.prepareStatement(`
            SELECT * FROM moderation_logs 
            WHERE guild_id = ? AND timestamp >= datetime('now', '-${days} days')
            ORDER BY timestamp DESC
        `);
        return stmt.all(guildId);
    }

    async moderationLogsGetStats(guildId) {
        const stmt = this.prepareStatement(`
            SELECT action, COUNT(*) as count 
            FROM moderation_logs 
            WHERE guild_id = ? 
            GROUP BY action
        `);
        return stmt.all(guildId);
    }

    async moderationLogsDelete(id) {
        const stmt = this.prepareStatement(`
            DELETE FROM moderation_logs WHERE id = ?
        `);
        const result = stmt.run(id);
        this.invalidateCache(`mod_log:${id}`);
        this.invalidateCache('moderation_logs');
        return result.changes > 0;
    }

    async moderationLogsClearByUserId(userId) {
        const stmt = this.prepareStatement(`
            DELETE FROM moderation_logs WHERE user_id = ?
        `);
        const result = stmt.run(userId);
        this.invalidateCache('moderation_logs');
        return result.changes;
    }

    async serverSettingsCreate(guildId, settings) {
        const settingsJson = JSON.stringify(settings);
        const stmt = this.prepareStatement(`
            INSERT OR REPLACE INTO server_settings (guild_id, settings_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(guildId, settingsJson);
        this.invalidateCache(`settings:${guildId}`);
        this.sync.syncTableToMd('server_settings', 'server_settings.md', 'Server Settings');
    }

    async serverSettingsGet(guildId) {
        const cacheKey = `settings:${guildId}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        const stmt = this.prepareStatement(`
            SELECT * FROM server_settings WHERE guild_id = ?
        `);
        const result = stmt.get(guildId);

        if (result) {
            const parsed = {
                ...result,
                settings: JSON.parse(result.settings_json)
            };
            this.setCache(cacheKey, parsed);
            return parsed;
        }
        return null;
    }

    async serverSettingsGetSettingsOnly(guildId) {
        const full = await this.serverSettingsGet(guildId);
        return full?.settings || null;
    }

    async serverSettingsUpdate(guildId, settings) {
        const settingsJson = JSON.stringify(settings);
        const stmt = this.prepareStatement(`
            UPDATE server_settings 
            SET settings_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = ?
        `);
        const result = stmt.run(settingsJson, guildId);
        this.invalidateCache(`settings:${guildId}`);
        return result.changes > 0;
    }

    async serverSettingsUpdateSetting(guildId, key, value) {
        const current = await this.serverSettingsGetSettingsOnly(guildId);
        if (!current) {
            await this.serverSettingsCreate(guildId, { [key]: value });
            return true;
        }

        current[key] = value;
        return await this.serverSettingsUpdate(guildId, current);
    }

    async serverSettingsDelete(guildId) {
        const stmt = this.prepareStatement(`
            DELETE FROM server_settings WHERE guild_id = ?
        `);
        const result = stmt.run(guildId);
        this.invalidateCache(`settings:${guildId}`);
        return result.changes > 0;
    }

    async serverSettingsGetAll() {
        const stmt = this.prepareStatement(`
            SELECT * FROM server_settings ORDER BY updated_at DESC
        `);
        return stmt.all().map(r => ({
            ...r,
            settings: JSON.parse(r.settings_json)
        }));
    }

    async antiSpamRecordsCreate(userId, guildId) {
        const stmt = this.prepareStatement(`
            INSERT INTO anti_spam_records (user_id, guild_id, message_count, timestamp)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
        `);
        stmt.run(userId, guildId);
        this.invalidateCache(`spam:${userId}:${guildId}`);
    }

    async antiSpamRecordsIncrement(userId, guildId) {
        const stmt = this.prepareStatement(`
            UPDATE anti_spam_records 
            SET message_count = message_count + 1, timestamp = CURRENT_TIMESTAMP
            WHERE user_id = ? AND guild_id = ?
        `);
        const result = stmt.run(userId, guildId);

        if (result.changes === 0) {
            await this.antiSpamRecordsCreate(userId, guildId);
        }
        this.invalidateCache(`spam:${userId}:${guildId}`);
    }

    async antiSpamRecordsGetRecord(userId, guildId) {
        const cacheKey = `spam:${userId}:${guildId}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        const stmt = this.prepareStatement(`
            SELECT * FROM anti_spam_records WHERE user_id = ? AND guild_id = ?
        `);
        const result = stmt.get(userId, guildId);
        if (result) this.setCache(cacheKey, result);
        return result;
    }

    async antiSpamRecordsGetRecentByUser(userId, minutes = 5) {
        const stmt = this.prepareStatement(`
            SELECT * FROM anti_spam_records 
            WHERE user_id = ? AND timestamp >= datetime('now', '-${minutes} minutes')
            ORDER BY timestamp DESC
        `);
        return stmt.all(userId);
    }

    async antiSpamRecordsGetSpammers(guildId, threshold = 10, minutes = 1) {
        const stmt = this.prepareStatement(`
            SELECT user_id, SUM(message_count) as total_messages, MAX(timestamp) as last_activity
            FROM anti_spam_records
            WHERE guild_id = ? AND timestamp >= datetime('now', '-${minutes} minutes')
            GROUP BY user_id
            HAVING total_messages >= ?
            ORDER BY total_messages DESC
        `);
        return stmt.all(guildId, threshold);
    }

    async antiSpamRecordsReset(userId, guildId) {
        const stmt = this.prepareStatement(`
            DELETE FROM anti_spam_records WHERE user_id = ? AND guild_id = ?
        `);
        const result = stmt.run(userId, guildId);
        this.invalidateCache(`spam:${userId}:${guildId}`);
        return result.changes > 0;
    }

    async antiSpamRecordsCleanupOldRecords(days = 7) {
        const stmt = this.prepareStatement(`
            DELETE FROM anti_spam_records 
            WHERE timestamp < datetime('now', '-${days} days')
        `);
        const result = stmt.run();
        this.invalidateCache('spam');
        return result.changes;
    }

    async antiSpamRecordsGetStats(guildId) {
        const stmt = this.prepareStatement(`
            SELECT COUNT(*) as total_records, 
                   COUNT(DISTINCT user_id) as unique_users,
                   MAX(message_count) as max_messages
            FROM anti_spam_records WHERE guild_id = ?
        `);
        return stmt.get(guildId);
    }

    async userReputationCreate(userId) {
        const stmt = this.prepareStatement(`
            INSERT OR IGNORE INTO user_reputation (user_id) VALUES (?)
        `);
        stmt.run(userId);
    }

    async userReputationGet(userId) {
        const cacheKey = `reputation:${userId}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        const stmt = this.prepareStatement(`
            SELECT * FROM user_reputation WHERE user_id = ?
        `);
        const result = stmt.get(userId);
        if (result) this.setCache(cacheKey, result);
        return result;
    }

    async userReputationUpvote(userId) {
        const stmt = this.prepareStatement(`
            UPDATE user_reputation 
            SET positive_votes = positive_votes + 1, 
                last_vote = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);
        stmt.run(userId);
        this.sync.syncTableToMd('user_reputation', 'reputation.md', 'User Reputation');
        this.invalidateCache(`reputation:${userId}`);
    }

    async userReputationDownvote(userId) {
        const stmt = this.prepareStatement(`
            UPDATE user_reputation 
            SET negative_votes = negative_votes + 1,
                last_vote = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);
        stmt.run(userId);
        this.sync.syncTableToMd('user_reputation', 'reputation.md', 'User Reputation');
        this.invalidateCache(`reputation:${userId}`);
    }

    async userReputationGetScore(userId) {
        const record = await this.userReputationGet(userId);
        if (!record) return null;
        return record.positive_votes - record.negative_votes;
    }

    async userReputationGetTopUsers(limit = 10) {
        const stmt = this.prepareStatement(`
            SELECT user_id, (positive_votes - negative_votes) as score
            FROM user_reputation
            ORDER BY score DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    async userReputationGetBottomUsers(limit = 10) {
        const stmt = this.prepareStatement(`
            SELECT user_id, (positive_votes - negative_votes) as score
            FROM user_reputation
            ORDER BY score ASC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    async userReputationDelete(userId) {
        const stmt = this.prepareStatement(`
            DELETE FROM user_reputation WHERE user_id = ?
        `);
        const result = stmt.run(userId);
        this.invalidateCache(`reputation:${userId}`);
        this.sync.syncTableToMd('user_reputation', 'reputation.md', 'User Reputation');
        return result.changes > 0;
    }

    async batchInsertUsers(users) {
        const transaction = this.db.transaction(() => {
            const stmt = this.prepareStatement(`
                INSERT OR IGNORE INTO users (discord_id, username) VALUES (?, ?)
            `);
            for (const user of users) {
                stmt.run(user.discordId, user.username);
            }
        });
        transaction();
        this.invalidateCache('users');
    }

    async batchInsertModerationLogs(logs) {
        const transaction = this.db.transaction(() => {
            const stmt = this.prepareStatement(`
                INSERT INTO moderation_logs (user_id, moderator_id, action, reason, guild_id)
                VALUES (?, ?, ?, ?, ?)
            `);
            for (const log of logs) {
                stmt.run(log.userId, log.moderatorId, log.action, log.reason, log.guildId);
            }
        });
        transaction();
        this.invalidateCache('moderation_logs');
    }

    async close() {
        this.cache.clear();
        this.statementCache.clear();
        if (this.db) {
            this.db.close();
            this.initialized = false;
        }
    }

    async backup(destinationPath) {
        const fs = await import('fs');
        const content = this.db.serialize();
        fs.writeFileSync(destinationPath, content);
        return destinationPath;
    }

    async getStats() {
        const stmt = this.prepareStatement(`
            SELECT name FROM sqlite_master WHERE type='table'
        `);
        const tables = stmt.all();

        const tableStats = {};
        for (const table of tables) {
            if (table.name === 'sqlite_sequence') continue;
            const countStmt = this.prepareStatement(`SELECT COUNT(*) as count FROM ${table.name}`);
            const result = countStmt.get();
            tableStats[table.name] = result.count;
        }

        return {
            tables: tableStats,
            cacheSize: this.cache.size,
            statementCacheSize: this.statementCache.size,
            databasePath: DB_PATH
        };
    }
}

const databaseManager = new DatabaseManager();

export default databaseManager;
export { DatabaseManager };
