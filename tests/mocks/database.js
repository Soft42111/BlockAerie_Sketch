class MockDatabase {
    constructor() {
        this.tables = new Map();
        this.cache = new Map();
        this.statements = new Map();
        this.transactionCount = 0;
    }

    exec(sql) {
        const createTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
        if (createTableMatch) {
            const tableName = createTableMatch[1];
            if (!this.tables.has(tableName)) {
                this.tables.set(tableName, []);
            }
        }
        return undefined;
    }

    prepare(sql) {
        const stmt = {
            sql,
            run: jest.fn((...params) => {
                const insertMatch = sql.match(/INSERT\s+(?:OR\s+)?(?:IGNORE\s+)?INTO\s+(\w+)/i);
                if (insertMatch) {
                    const table = insertMatch[1];
                    if (!this.tables.has(table)) {
                        this.tables.set(table, []);
                    }
                    const row = params.reduce((acc, val, i) => {
                        const colMatch = sql.match(/\(([^)]+)\)/);
                        if (colMatch) {
                            const cols = colMatch[1].split(',').map(c => c.trim());
                            cols.forEach((col, idx) => {
                                acc[col] = params[idx];
                            });
                        }
                        return acc;
                    }, {});
                    row._id = this.tables.get(table).length + 1;
                    this.tables.get(table).push(row);
                    return { lastInsertRowid: row._id, changes: 1 };
                }

                const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
                if (updateMatch) {
                    return { changes: 1 };
                }

                const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
                if (deleteMatch) {
                    return { changes: 1 };
                }

                return { changes: 0 };
            }),
            get: jest.fn((...params) => {
                const selectMatch = sql.match(/SELECT.*FROM\s+(\w+)/i);
                if (selectMatch) {
                    const table = selectMatch[1];
                    if (!this.tables.has(table)) return null;

                    const rows = this.tables.get(table);

                    if (sql.includes('WHERE')) {
                        return rows.find(row => {
                            return params.every((param, i) => {
                                const val = Object.values(row)[i];
                                return String(val) === String(param);
                            });
                        }) || null;
                    }

                    return rows[0] || null;
                }
                return null;
            }),
            all: jest.fn((...params) => {
                const selectMatch = sql.match(/SELECT.*FROM\s+(\w+)/i);
                if (selectMatch) {
                    const table = selectMatch[1];
                    if (!this.tables.has(table)) return [];

                    let rows = [...this.tables.get(table)];

                    if (sql.includes('WHERE')) {
                        rows = rows.filter(row => {
                            return params.every((param, i) => {
                                const val = Object.values(row)[i];
                                return String(val) === String(param);
                            });
                        });
                    }

                    if (sql.includes('ORDER BY')) {
                        const orderMatch = sql.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
                        if (orderMatch) {
                            const [_, col, dir] = orderMatch;
                            rows.sort((a, b) => {
                                if (dir?.toUpperCase() === 'DESC') {
                                    return (b[col] || 0) - (a[col] || 0);
                                }
                                return (a[col] || 0) - (b[col] || 0);
                            });
                        }
                    }

                    if (sql.includes('LIMIT')) {
                        const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
                        if (limitMatch) {
                            rows = rows.slice(0, parseInt(limitMatch[1]));
                        }
                    }

                    return rows;
                }
                return [];
            })
        };
        this.statements.set(sql, stmt);
        return stmt;
    }

    transaction(callback) {
        return (...args) => {
            this.transactionCount++;
            try {
                const result = callback(...args);
                return result;
            } finally {
                this.transactionCount--;
            }
        };
    }

    pragma(pragma) {
        return undefined;
    }

    serialize() {
        return JSON.stringify({
            tables: Object.fromEntries(this.tables),
            created: new Date().toISOString()
        });
    }

    close() {
        this.tables.clear();
        this.cache.clear();
    }
}

class MockDatabaseManager {
    constructor() {
        this.db = new MockDatabase();
        this.cache = new Map();
        this.cacheTTL = 30000;
        this.initialized = true;
        this.mockData = this.initializeMockData();
    }

    initializeMockData() {
        const users = [
            { discord_id: '123456789', username: 'testuser', reputation_score: 50, warnings_count: 0, join_date: new Date().toISOString() },
            { discord_id: '987654321', username: 'trusteduser', reputation_score: 150, warnings_count: 0, join_date: new Date().toISOString() },
            { discord_id: '111222333', username: 'newuser', reputation_score: 0, warnings_count: 0, join_date: new Date().toISOString() }
        ];

        const moderationLogs = [
            { id: 1, user_id: '123456789', moderator_id: '999888777', action: 'warn', reason: 'Test warning', timestamp: new Date().toISOString(), guild_id: '555666777' }
        ];

        const userReputation = [
            { user_id: '123456789', positive_votes: 5, negative_votes: 1, last_vote: new Date().toISOString() },
            { user_id: '987654321', positive_votes: 15, negative_votes: 2, last_vote: new Date().toISOString() }
        ];

        users.forEach(u => {
            this.db.tables.set('users', users);
        });
        this.db.tables.set('moderation_logs', moderationLogs);
        this.db.tables.set('user_reputation', userReputation);

        return { users, moderationLogs, userReputation };
    }

    async initialize() {
        return;
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
    }

    invalidateCache(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    prepareStatement(sql) {
        return this.db.prepare(sql);
    }

    async usersCreate(discordId, username) {
        const stmt = this.prepareStatement(`INSERT OR IGNORE INTO users (discord_id, username) VALUES (?, ?)`);
        stmt.run(discordId, username);
    }

    async usersGetById(discordId) {
        const cacheKey = `users:${discordId}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;

        const stmt = this.prepareStatement(`SELECT * FROM users WHERE discord_id = ?`);
        const result = stmt.get(discordId);
        if (result) this.setCache(cacheKey, result);
        return result;
    }

    async usersUpdate(discordId, data) {
        const updates = [];
        const values = [];

        if (data.username) {
            updates.push('username = ?');
            values.push(data.username);
        }
        if (data.reputation_score !== undefined) {
            updates.push('reputation_score = ?');
            values.push(data.reputation_score);
        }
        if (data.warnings_count !== undefined) {
            updates.push('warnings_count = ?');
            values.push(data.warnings_count);
        }

        if (updates.length === 0) return false;

        const stmt = this.prepareStatement(`UPDATE users SET ${updates.join(', ')} WHERE discord_id = ?`);
        const result = stmt.run(...values, discordId);
        this.invalidateCache(`users:${discordId}`);
        return result.changes > 0;
    }

    async usersIncrementReputation(discordId, amount) {
        const stmt = this.prepareStatement(`UPDATE users SET reputation_score = reputation_score + ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`);
        stmt.run(amount, discordId);
        this.invalidateCache(`users:${discordId}`);
    }

    async usersGetTopReputation(limit = 10) {
        const stmt = this.prepareStatement(`SELECT * FROM users ORDER BY reputation_score DESC LIMIT ?`);
        return stmt.all(limit);
    }

    async usersGetAll(limit = 100, offset = 0) {
        const stmt = this.prepareStatement(`SELECT * FROM users ORDER BY join_date DESC LIMIT ? OFFSET ?`);
        return stmt.all(limit, offset);
    }

    async moderationLogsCreate(userId, moderatorId, action, reason, guildId) {
        const stmt = this.prepareStatement(`INSERT INTO moderation_logs (user_id, moderator_id, action, reason, guild_id) VALUES (?, ?, ?, ?, ?)`);
        const result = stmt.run(userId, moderatorId, action, reason, guildId);
        return result.lastInsertRowid;
    }

    async moderationLogsGetByUserId(userId, limit = 50) {
        const stmt = this.prepareStatement(`SELECT * FROM moderation_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?`);
        return stmt.all(userId, limit);
    }

    async userReputationCreate(userId) {
        const stmt = this.prepareStatement(`INSERT OR IGNORE INTO user_reputation (user_id) VALUES (?)`);
        stmt.run(userId);
    }

    async userReputationGet(userId) {
        const stmt = this.prepareStatement(`SELECT * FROM user_reputation WHERE user_id = ?`);
        return stmt.get(userId);
    }

    async userReputationUpvote(userId) {
        const stmt = this.prepareStatement(`UPDATE user_reputation SET positive_votes = positive_votes + 1, last_vote = CURRENT_TIMESTAMP WHERE user_id = ?`);
        stmt.run(userId);
    }

    async userReputationDownvote(userId) {
        const stmt = this.prepareStatement(`UPDATE user_reputation SET negative_votes = negative_votes + 1, last_vote = CURRENT_TIMESTAMP WHERE user_id = ?`);
        stmt.run(userId);
    }

    async antiSpamRecordsCreate(userId, guildId) {
        const stmt = this.prepareStatement(`INSERT INTO anti_spam_records (user_id, guild_id, message_count, timestamp) VALUES (?, ?, 1, CURRENT_TIMESTAMP)`);
        stmt.run(userId, guildId);
    }

    async antiSpamRecordsIncrement(userId, guildId) {
        const stmt = this.prepareStatement(`UPDATE anti_spam_records SET message_count = message_count + 1, timestamp = CURRENT_TIMESTAMP WHERE user_id = ? AND guild_id = ?`);
        const result = stmt.run(userId, guildId);
        if (result.changes === 0) {
            await this.antiSpamRecordsCreate(userId, guildId);
        }
    }

    async antiSpamRecordsGetRecord(userId, guildId) {
        const stmt = this.prepareStatement(`SELECT * FROM anti_spam_records WHERE user_id = ? AND guild_id = ?`);
        return stmt.get(userId, guildId);
    }

    async serverSettingsCreate(guildId, settings) {
        const stmt = this.prepareStatement(`INSERT OR REPLACE INTO server_settings (guild_id, settings_json) VALUES (?, ?)`);
        stmt.run(guildId, JSON.stringify(settings));
    }

    async serverSettingsGet(guildId) {
        const stmt = this.prepareStatement(`SELECT * FROM server_settings WHERE guild_id = ?`);
        const result = stmt.get(guildId);
        if (result) {
            return { ...result, settings: JSON.parse(result.settings_json) };
        }
        return null;
    }

    async batchInsertUsers(users) {
        const transaction = this.db.transaction(() => {
            const stmt = this.prepareStatement(`INSERT OR IGNORE INTO users (discord_id, username) VALUES (?, ?)`);
            for (const user of users) {
                stmt.run(user.discordId, user.username);
            }
        });
        transaction();
    }

    async close() {
        this.cache.clear();
        this.initialized = false;
    }

    async getStats() {
        return {
            tables: {
                users: this.db.tables.get('users')?.length || 0,
                moderation_logs: this.db.tables.get('moderation_logs')?.length || 0
            },
            cacheSize: this.cache.size
        };
    }

    resetAll() {
        this.cache.clear();
        this.db = new MockDatabase();
        this.mockData = this.initializeMockData();
    }
}

const mockDatabaseManager = new MockDatabaseManager();

export default mockDatabaseManager;
export { MockDatabase, MockDatabaseManager };
