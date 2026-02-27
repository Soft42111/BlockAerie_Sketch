import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { MockDatabase, MockDatabaseManager } from '../mocks/database.js';

describe('Database Operations', () => {
    let mockDb;
    let dbManager;

    beforeAll(() => {
        mockDb = new MockDatabase();
        dbManager = new MockDatabaseManager();
    });

    beforeEach(() => {
        mockDb.tables.clear();
        mockDb.cache.clear();
        dbManager.cache.clear();
        mockDb.tables.set('users', [
            { discord_id: '123', username: 'testuser', reputation_score: 50, warnings_count: 0 }
        ]);
        mockDb.tables.set('moderation_logs', [
            { id: 1, user_id: '123', moderator_id: '999', action: 'warn', reason: 'Test' }
        ]);
    });

    describe('User CRUD Operations', () => {
        it('should create a new user', async () => {
            await dbManager.usersCreate('456', 'newuser');

            const user = await dbManager.usersGetById('456');
            expect(user).toBeDefined();
            expect(user.username).toBe('newuser');
        });

        it('should retrieve user by ID', async () => {
            const user = await dbManager.usersGetById('123');
            expect(user).toBeDefined();
            expect(user.discord_id).toBe('123');
            expect(user.username).toBe('testuser');
        });

        it('should return null for non-existent user', async () => {
            const user = await dbManager.usersGetById('nonexistent');
            expect(user).toBeNull();
        });

        it('should update user data', async () => {
            const updated = await dbManager.usersUpdate('123', {
                username: 'updateduser',
                reputation_score: 100
            });
            expect(updated).toBe(true);

            const user = await dbManager.usersGetById('123');
            expect(user.username).toBe('updateduser');
            expect(user.reputation_score).toBe(100);
        });

        it('should increment user reputation', async () => {
            const initialRep = (await dbManager.usersGetById('123'))?.reputation_score || 0;

            await dbManager.usersIncrementReputation('123', 10);

            const updatedUser = await dbManager.usersGetById('123');
            expect(updatedUser.reputation_score).toBe(initialRep + 10);
        });

        it('should get top reputation users', async () => {
            mockDb.tables.set('users', [
                { discord_id: '1', username: 'user1', reputation_score: 100 },
                { discord_id: '2', username: 'user2', reputation_score: 50 },
                { discord_id: '3', username: 'user3', reputation_score: 200 }
            ]);

            const topUsers = await dbManager.usersGetTopReputation(2);

            expect(topUsers.length).toBe(2);
            expect(topUsers[0].reputation_score).toBe(200);
            expect(topUsers[1].reputation_score).toBe(100);
        });

        it('should get all users with pagination', async () => {
            const users = Array.from({ length: 50 }, (_, i) => ({
                discord_id: String(i),
                username: `user${i}`,
                reputation_score: i
            }));
            mockDb.tables.set('users', users);

            const result = await dbManager.usersGetAll(10, 0);
            expect(result.length).toBe(10);
        });
    });

    describe('Moderation Logs CRUD', () => {
        it('should create moderation log', async () => {
            const logId = await dbManager.moderationLogsCreate(
                '456',
                '999',
                'kick',
                'Spamming',
                '555'
            );

            expect(logId).toBeDefined();
            expect(typeof logId).toBe('number');
        });

        it('should retrieve moderation logs by user', async () => {
            const logs = await dbManager.moderationLogsGetByUserId('123');

            expect(Array.isArray(logs)).toBe(true);
            expect(logs.length).toBeGreaterThan(0);
            expect(logs[0].user_id).toBe('123');
        });

        it('should filter logs by action type', async () => {
            mockDb.tables.set('moderation_logs', [
                { id: 1, user_id: '123', action: 'warn' },
                { id: 2, user_id: '123', action: 'kick' },
                { id: 3, user_id: '456', action: 'warn' }
            ]);

            const stmt = mockDb.prepare('SELECT * FROM moderation_logs WHERE action = ?');
            const warnLogs = stmt.all('warn');

            expect(warnLogs.length).toBe(2);
        });
    });

    describe('Reputation Operations', () => {
        it('should create reputation record', async () => {
            await dbManager.userReputationCreate('789');

            const record = await dbManager.userReputationGet('789');
            expect(record).toBeDefined();
            expect(record.user_id).toBe('789');
        });

        it('should upvote user', async () => {
            await dbManager.userReputationCreate('123');
            await dbManager.userReputationUpvote('123');

            const record = await dbManager.userReputationGet('123');
            expect(record.positive_votes).toBeGreaterThan(0);
        });

        it('should downvote user', async () => {
            await dbManager.userReputationCreate('123');
            await dbManager.userReputationDownvote('123');

            const record = await dbManager.userReputationGet('123');
            expect(record.negative_votes).toBeGreaterThan(0);
        });

        it('should calculate reputation score', async () => {
            mockDb.tables.set('user_reputation', [
                { user_id: '123', positive_votes: 10, negative_votes: 2 }
            ]);

            const record = await dbManager.userReputationGet('123');
            const score = record.positive_votes - record.negative_votes;

            expect(score).toBe(8);
        });
    });

    describe('Anti-Spam Operations', () => {
        it('should create spam record', async () => {
            await dbManager.antiSpamRecordsCreate('123', '555');

            const record = await dbManager.antiSpamRecordsGetRecord('123', '555');
            expect(record).toBeDefined();
            expect(record.message_count).toBe(1);
        });

        it('should increment spam count', async () => {
            await dbManager.antiSpamRecordsCreate('123', '555');
            await dbManager.antiSpamRecordsIncrement('123', '555');
            await dbManager.antiSpamRecordsIncrement('123', '555');

            const record = await dbManager.antiSpamRecordsGetRecord('123', '555');
            expect(record.message_count).toBe(3);
        });
    });

    describe('Server Settings', () => {
        it('should create server settings', async () => {
            const settings = {
                prefix: '!',
                modRole: '111',
                logChannel: '222'
            };

            await dbManager.serverSettingsCreate('555', settings);

            const result = await dbManager.serverSettingsGet('555');
            expect(result).toBeDefined();
            expect(result.settings.prefix).toBe('!');
        });

        it('should update specific setting', async () => {
            await dbManager.serverSettingsCreate('555', { prefix: '!' });
            await dbManager.serverSettingsUpdateSetting('555', 'prefix', '?');

            const result = await dbManager.serverSettingsGet('555');
            expect(result.settings.prefix).toBe('?');
        });
    });

    describe('Batch Operations', () => {
        it('should batch insert users', async () => {
            const users = [
                { discordId: '111', username: 'user1' },
                { discordId: '222', username: 'user2' },
                { discordId: '333', username: 'user3' }
            ];

            await dbManager.batchInsertUsers(users);

            expect(mockDb.tables.has('users')).toBe(true);
        });

        it('should perform batch insert in transaction', () => {
            const transactionFn = mockDb.transaction(() => {
                const stmt = mockDb.prepare('INSERT INTO users (discord_id, username) VALUES (?, ?)');
                stmt.run('1', 'user1');
                stmt.run('2', 'user2');
                stmt.run('3', 'user3');
                return 'success';
            });

            const result = transactionFn();
            expect(result).toBe('success');
        });
    });

    describe('Cache Management', () => {
        it('should cache and retrieve data', async () => {
            const cacheKey = 'users:123';
            const data = { id: '123', name: 'test' };

            dbManager.setCache(cacheKey, data);
            const cached = dbManager.getCached(cacheKey);

            expect(cached).toEqual(data);
        });

        it('should invalidate cache by pattern', async () => {
            dbManager.setCache('users:123', { data: '1' });
            dbManager.setCache('users:456', { data: '2' });
            dbManager.setCache('other:789', { data: '3' });

            dbManager.invalidateCache('users:');

            expect(dbManager.getCached('users:123')).toBeNull();
            expect(dbManager.getCached('other:789')).toBeDefined();
        });
    });

    describe('Database Statistics', () => {
        it('should return database stats', async () => {
            const stats = await dbManager.getStats();

            expect(stats).toBeDefined();
            expect(stats.tables).toBeDefined();
            expect(typeof stats.cacheSize).toBe('number');
        });

        it('should serialize database', async () => {
            const serialized = mockDb.serialize();

            expect(serialized).toBeDefined();
            expect(typeof serialized).toBe('string');
        });
    });

    describe('Error Handling', () => {
        it('should handle duplicate inserts gracefully', async () => {
            await dbManager.usersCreate('123', 'user1');
            await dbManager.usersCreate('123', 'user2');

            const user = await dbManager.usersGetById('123');
            expect(user.username).toBe('user1');
        });

        it('should handle transaction rollbacks', () => {
            const transactionFn = mockDb.transaction(() => {
                const stmt = mockDb.prepare('INSERT INTO users (discord_id, username) VALUES (?, ?)');
                stmt.run('1', 'user1');
                throw new Error('Rollback test');
            });

            expect(() => transactionFn()).toThrow('Rollback test');
        });
    });
});
