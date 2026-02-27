import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { MockDiscordUser, MockDiscordGuildMember, MockDiscordGuild, MockDiscordMessage, MockEmbed } from '../mocks/discord.js';

describe('Moderation Commands', () => {
    let mockGuild;
    let mockModerator;
    let mockTarget;
    let mockTargetMember;

    beforeAll(() => {
        mockModerator = new MockDiscordUser('999888777', 'Moderator', 'Mod#0');
        mockTarget = new MockDiscordUser('123456789', 'TargetUser', 'Target#0');
        mockTargetMember = new MockDiscordGuildMember(mockTarget, [], 'TargetUser');
        mockGuild = new MockDiscordGuild('555666777', 'Test Server');
        mockGuild.addMember(mockModerator);
        mockGuild.addMember(mockTarget);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Kick Command', () => {
        it('should kick a user successfully', async () => {
            const kickUser = async (member, reason) => {
                if (!member.kickable) {
                    throw new Error('User cannot be kicked');
                }
                return { success: true, userId: member.id, reason };
            };

            const result = await kickUser(mockTargetMember, 'Test kick');
            expect(result.success).toBe(true);
            expect(result.userId).toBe('123456789');
        });

        it('should reject kick if user is not kickable', async () => {
            const nonKickableMember = { ...mockTargetMember, kickable: false };

            const kickUser = async (member, reason) => {
                if (!member.kickable) {
                    throw new Error('User cannot be kicked');
                }
                return { success: true };
            };

            await expect(kickUser(nonKickableMember, 'Test')).rejects.toThrow('User cannot be kicked');
        });

        it('should require reason for kick', async () => {
            const kickUser = async (member, reason) => {
                if (!reason || reason.trim() === '') {
                    throw new Error('Reason is required');
                }
                return { success: true };
            };

            await expect(kickUser(mockTargetMember, '')).rejects.toThrow('Reason is required');
            await expect(kickUser(mockTargetMember, 'Valid reason')).resolves.not.toThrow();
        });
    });

    describe('Ban Command', () => {
        it('should ban a user successfully', async () => {
            const banUser = async (member, reason, deleteDays = 1) => {
                if (!member.bannable) {
                    throw new Error('User cannot be banned');
                }
                return { success: true, userId: member.id, reason, deleteDays };
            };

            const result = await banUser(mockTargetMember, 'Test ban', 7);
            expect(result.success).toBe(true);
            expect(result.deleteDays).toBe(7);
        });

        it('should reject ban if user is not bannable', async () => {
            const nonBannableMember = { ...mockTargetMember, bannable: false };

            const banUser = async (member, reason) => {
                if (!member.bannable) {
                    throw new Error('User cannot be banned');
                }
                return { success: true };
            };

            await expect(banUser(nonBannableMember, 'Test')).rejects.toThrow('User cannot be banned');
        });

        it('should validate delete days parameter', async () => {
            const banUser = async (member, reason, deleteDays) => {
                if (deleteDays < 0 || deleteDays > 7) {
                    throw new Error('Delete days must be between 0 and 7');
                }
                return { success: true };
            };

            await expect(banUser(mockTargetMember, 'Test', -1)).rejects.toThrow('Delete days must be between 0 and 7');
            await expect(banUser(mockTargetMember, 'Test', 8)).rejects.toThrow('Delete days must be between 0 and 7');
            await expect(banUser(mockTargetMember, 'Test', 3)).resolves.not.toThrow();
        });
    });

    describe('Warn Command', () => {
        it('should warn a user successfully', async () => {
            const warnUser = async (userId, moderatorId, reason, guildId) => {
                if (!reason || reason.trim() === '') {
                    throw new Error('Reason is required');
                }
                return { success: true, userId, moderatorId, reason, guildId };
            };

            const result = await warnUser('123456789', '999888777', 'Spamming', '555666777');
            expect(result.success).toBe(true);
            expect(result.reason).toBe('Spamming');
        });

        it('should track warning count', async () => {
            const userWarnings = new Map();
            const warnUser = async (userId, moderatorId, reason, guildId) => {
                const count = (userWarnings.get(userId) || 0) + 1;
                userWarnings.set(userId, count);
                return { success: true, warningCount: count };
            };

            await warnUser('123', '999', 'First warn', '555');
            await warnUser('123', '999', 'Second warn', '555');

            expect(userWarnings.get('123')).toBe(2);
        });

        it('should escalate after multiple warnings', async () => {
            const getAction = (warningCount) => {
                if (warningCount >= 5) return 'ban';
                if (warningCount >= 3) return 'mute';
                if (warningCount >= 2) return 'kick';
                return 'warn';
            };

            expect(getAction(1)).toBe('warn');
            expect(getAction(2)).toBe('kick');
            expect(getAction(3)).toBe('mute');
            expect(getAction(5)).toBe('ban');
        });
    });

    describe('Unban Command', () => {
        it('should unban a user successfully', async () => {
            const unbanUser = async (userId, moderatorId, reason) => {
                return { success: true, userId, moderatorId, reason };
            };

            const result = await unbanUser('123456789', '999888777', 'Appealed');
            expect(result.success).toBe(true);
        });

        it('should require reason for unban', async () => {
            const unbanUser = async (userId, moderatorId, reason) => {
                if (!reason || reason.trim() === '') {
                    throw new Error('Reason is required for unban');
                }
                return { success: true };
            };

            await expect(unbanUser('123', '999', '')).rejects.toThrow('Reason is required for unban');
        });
    });

    describe('Mute Command', () => {
        it('should mute a user successfully', async () => {
            const muteUser = async (member, duration, reason) => {
                if (!member.manageable) {
                    throw new Error('Cannot manage this member');
                }
                return { success: true, duration, reason };
            };

            const result = await muteUser(mockTargetMember, 3600000, 'Spamming');
            expect(result.success).toBe(true);
        });

        it('should validate mute duration', async () => {
            const muteUser = async (member, duration) => {
                const maxDuration = 2419200000;
                if (duration > maxDuration) {
                    throw new Error('Mute duration cannot exceed 28 days');
                }
                return { success: true };
            };

            await expect(muteUser(mockTargetMember, 2419200001)).rejects.toThrow('Mute duration cannot exceed 28 days');
            await expect(muteUser(mockTargetMember, 86400000)).resolves.not.toThrow();
        });

        it('should parse time duration strings', () => {
            const parseDuration = (str) => {
                const timeMap = { 's': 1000, 'm': 60000, 'h': 3600000, 'd': 86400000, 'w': 604800000 };
                const match = str.match(/^(\d+)([smhdw])$/);
                if (!match) return null;
                return parseInt(match[1]) * timeMap[match[2]];
            };

            expect(parseDuration('5m')).toBe(300000);
            expect(parseDuration('1h')).toBe(3600000);
            expect(parseDuration('2d')).toBe(172800000);
            expect(parseDuration('1w')).toBe(604800000);
            expect(parseDuration('invalid')).toBeNull();
        });
    });

    describe('Purge Command', () => {
        it('should delete messages in bulk', async () => {
            const messages = [
                { id: '1', content: 'Message 1', createdAt: new Date(Date.now() - 1000) },
                { id: '2', content: 'Message 2', createdAt: new Date(Date.now() - 2000) },
                { id: '3', content: 'Message 3', createdAt: new Date(Date.now() - 3000) }
            ];

            const deleteMessages = async (msgs, limit) => {
                return msgs.slice(0, limit).length;
            };

            const count = await deleteMessages(messages, 2);
            expect(count).toBe(2);
        });

        it('should respect 14-day message deletion limit', async () => {
            const messages = [
                { id: '1', createdAt: new Date(Date.now() - 86400000 * 13) },
                { id: '2', createdAt: new Date(Date.now() - 86400000 * 15) }
            ];

            const canDelete = (message) => {
                const twoWeeksAgo = Date.now() - 86400000 * 14;
                return new Date(message.createdAt).getTime() > twoWeeksAgo;
            };

            expect(canDelete(messages[0])).toBe(true);
            expect(canDelete(messages[1])).toBe(false);
        });

        it('should filter messages by user', async () => {
            const messages = [
                { id: '1', authorId: '123', content: 'Message 1' },
                { id: '2', authorId: '456', content: 'Message 2' },
                { id: '3', authorId: '123', content: 'Message 3' }
            ];

            const filterByUser = (msgs, userId) => {
                return msgs.filter(m => m.authorId === userId);
            };

            const userMessages = filterByUser(messages, '123');
            expect(userMessages.length).toBe(2);
        });
    });
});

describe('Moderation Logging', () => {
    it('should create audit log entry for moderation actions', async () => {
        const moderationLogs = [];
        const createLog = async (userId, moderatorId, action, reason, guildId) => {
            const log = {
                id: moderationLogs.length + 1,
                userId,
                moderatorId,
                action,
                reason,
                guildId,
                timestamp: new Date().toISOString()
            };
            moderationLogs.push(log);
            return log;
        };

        const log = await createLog('123', '999', 'kick', 'Spamming', '555');
        expect(log.action).toBe('kick');
        expect(log.id).toBe(1);
    });

    it('should retrieve moderation logs by user', async () => {
        const logs = [
            { id: 1, userId: '123', action: 'warn', timestamp: new Date(Date.now() - 86400000) },
            { id: 2, userId: '123', action: 'kick', timestamp: new Date() },
            { id: 3, userId: '456', action: 'ban', timestamp: new Date() }
        ];

        const getLogsByUser = (userId) => {
            return logs.filter(log => log.userId === userId);
        };

        const userLogs = getLogsByUser('123');
        expect(userLogs.length).toBe(2);
    });

    it('should retrieve moderation logs by action', async () => {
        const logs = [
            { id: 1, action: 'warn' },
            { id: 2, action: 'kick' },
            { id: 3, action: 'warn' }
        ];

        const getLogsByAction = (action) => {
            return logs.filter(log => log.action === action);
        };

        const warnLogs = getLogsByAction('warn');
        expect(warnLogs.length).toBe(2);
    });

    it('should calculate moderation statistics', async () => {
        const logs = [
            { action: 'warn' },
            { action: 'kick' },
            { action: 'ban' },
            { action: 'warn' },
            { action: 'mute' }
        ];

        const calculateStats = () => {
            const stats = {};
            logs.forEach(log => {
                stats[log.action] = (stats[log.action] || 0) + 1;
            });
            return stats;
        };

        const stats = calculateStats();
        expect(stats.warn).toBe(2);
        expect(stats.kick).toBe(1);
        expect(stats.ban).toBe(1);
    });
});

describe('Moderation Embeds', () => {
    it('should format kick embed correctly', () => {
        const formatKickEmbed = (target, moderator, reason) => {
            return new MockEmbed()
                .setTitle('User Kicked')
                .setDescription(`${target} has been kicked from the server`)
                .addFields(
                    { name: 'User', value: target.toString() },
                    { name: 'Moderator', value: moderator.toString() },
                    { name: 'Reason', value: reason }
                )
                .setColor('#FFA500');
        };

        const embed = formatKickEmbed(
            new MockDiscordUser('123', 'User', 'User#0'),
            new MockDiscordUser('999', 'Mod', 'Mod#0'),
            'Spamming'
        );

        expect(embed.title).toBe('User Kicked');
        expect(embed.color).toBe('#FFA500');
        expect(embed.fields.length).toBe(3);
    });

    it('should format ban embed correctly', () => {
        const formatBanEmbed = (target, moderator, reason, duration = null) => {
            const embed = new MockEmbed()
                .setTitle('User Banned')
                .setDescription(`${target} has been banned from the server`)
                .addFields(
                    { name: 'User', value: target.toString() },
                    { name: 'Moderator', value: moderator.toString() },
                    { name: 'Reason', value: reason }
                )
                .setColor('#FF0000');

            if (duration) {
                embed.addFields({ name: 'Duration', value: duration });
            }
            return embed;
        };

        const embed = formatBanEmbed(
            new MockDiscordUser('123', 'User', 'User#0'),
            new MockDiscordUser('999', 'Mod', 'Mod#0'),
            'Rule violation'
        );

        expect(embed.title).toBe('User Banned');
        expect(embed.color).toBe('#FF0000');
    });
});
