import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { MockDiscordUser, MockDiscordGuild, MockDiscordTextChannel, MockDiscordVoiceChannel, MockDiscordCategoryChannel } from '../mocks/discord.js';

describe('Channel Management', () => {
    let mockGuild;

    beforeAll(() => {
        mockGuild = new MockDiscordGuild('555666777', 'Test Server');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGuild.channels = new Map();
    });

    describe('Channel Creation', () => {
        it('should create a new text channel', async () => {
            const createChannel = async (name, type = 'GUILD_TEXT', options = {}) => {
                const channel = {
                    id: Math.random().toString(36).substring(7),
                    name,
                    type,
                    topic: options.topic || null,
                    nsfw: options.nsfw || false,
                    rateLimitPerUser: options.slowmode || 0,
                    permissionOverwrites: new Map(),
                    createdAt: new Date()
                };
                mockGuild.channels.set(channel.id, channel);
                return channel;
            };

            const channel = await createChannel('general', 'GUILD_TEXT', { topic: 'General discussion' });
            expect(channel.name).toBe('general');
            expect(channel.topic).toBe('General discussion');
        });

        it('should create a new voice channel', async () => {
            const createVoiceChannel = async (name, options = {}) => {
                const channel = {
                    id: Math.random().toString(36).substring(7),
                    name,
                    type: 'GUILD_VOICE',
                    bitrate: options.bitrate || 64000,
                    userLimit: options.userLimit || 0,
                    createdAt: new Date()
                };
                mockGuild.channels.set(channel.id, channel);
                return channel;
            };

            const channel = await createVoiceChannel('Voice Room', { bitrate: 128000, userLimit: 10 });
            expect(channel.name).toBe('Voice Room');
            expect(channel.bitrate).toBe(128000);
        });

        it('should create a category channel', async () => {
            const createCategory = async (name, options = {}) => {
                const category = {
                    id: Math.random().toString(36).substring(7),
                    name,
                    type: 'GUILD_CATEGORY',
                    children: new Map(),
                    createdAt: new Date()
                };
                mockGuild.channels.set(category.id, category);
                return category;
            };

            const category = await createCategory('Text Channels');
            expect(category.name).toBe('Text Channels');
            expect(category.type).toBe('GUILD_CATEGORY');
        });

        it('should validate channel names', () => {
            const validateName = (name) => {
                if (!name || name.trim() === '') {
                    return { valid: false, error: 'Channel name is required' };
                }
                if (name.length < 2 || name.length > 100) {
                    return { valid: false, error: 'Channel name must be 2-100 characters' };
                }
                if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
                    return { valid: false, error: 'Channel name can only contain letters, numbers, hyphens, and underscores' };
                }
                return { valid: true };
            };

            expect(validateName('general').valid).toBe(true);
            expect(validateName('General Channel').valid).toBe(false);
            expect(validateName('g').valid).toBe(false);
            expect(validateName('').valid).toBe(false);
        });
    });

    describe('Channel Deletion', () => {
        it('should delete a channel', async () => {
            const channels = new Map([['123', { name: 'test', id: '123' }]]);

            const deleteChannel = async (channelId) => {
                if (!channels.has(channelId)) {
                    throw new Error('Channel not found');
                }
                const channel = channels.get(channelId);
                channels.delete(channelId);
                return { success: true, deletedChannel: channel };
            };

            const result = await deleteChannel('123');
            expect(result.success).toBe(true);
            expect(channels.has('123')).toBe(false);
        });

        it('should prevent deletion of essential channels', async () => {
            const essentialChannels = ['general', 'rules'];

            const canDelete = (channelName) => {
                return !essentialChannels.includes(channelName.toLowerCase());
            };

            expect(canDelete('general')).toBe(false);
            expect(canDelete('rules')).toBe(false);
            expect(canDelete('off-topic')).toBe(true);
        });

        it('should log channel deletion', async () => {
            const auditLogs = [];

            const logDeletion = (channel, moderator) => {
                auditLogs.push({
                    action: 'channel_delete',
                    channel: channel.name,
                    moderator,
                    timestamp: new Date().toISOString()
                });
            };

            logDeletion({ name: 'test' }, '999');
            expect(auditLogs.length).toBe(1);
            expect(auditLogs[0].action).toBe('channel_delete');
        });
    });

    describe('Channel Editing', () => {
        it('should update channel name', async () => {
            const channel = { id: '123', name: 'old-name' };

            const updateName = (ch, newName) => {
                ch.name = newName;
                return ch;
            };

            const updated = updateName(channel, 'new-name');
            expect(updated.name).toBe('new-name');
        });

        it('should update channel topic', async () => {
            const channel = { id: '123', topic: 'Old topic' };

            const updateTopic = (ch, newTopic) => {
                ch.topic = newTopic;
                return ch;
            };

            const updated = updateTopic(channel, 'New topic');
            expect(updated.topic).toBe('New topic');
        });

        it('should update slowmode', async () => {
            const channel = { id: '123', rateLimitPerUser: 0 };

            const updateSlowmode = (ch, seconds) => {
                if (seconds < 0 || seconds > 21600) {
                    throw new Error('Slowmode must be 0-21600 seconds');
                }
                ch.rateLimitPerUser = seconds;
                return ch;
            };

            const updated = updateSlowmode(channel, 300);
            expect(updated.rateLimitPerUser).toBe(300);
        });

        it('should handle NSFW toggle', async () => {
            const channel = { id: '123', nsfw: false };

            const toggleNSFW = (ch, isNSFW) => {
                ch.nsfw = isNSFW;
                return ch;
            };

            const updated = toggleNSFW(channel, true);
            expect(updated.nsfw).toBe(true);
        });
    });

    describe('Channel Permissions', () => {
        it('should set permission overwrites', async () => {
            const channel = { id: '123', permissionOverwrites: new Map() };

            const setPermission = (ch, targetId, allow, deny) => {
                ch.permissionOverwrites.set(targetId, {
                    allow: allow || new Set(),
                    deny: deny || new Set()
                });
                return ch;
            };

            const updated = setPermission(channel, '456', ['VIEW_CHANNEL'], ['SEND_MESSAGES']);
            expect(updated.permissionOverwrites.has('456')).toBe(true);
        });

        it('should calculate effective permissions', () => {
            const calculatePermissions = (rolePerms, channelPerms) => {
                let perms = new Set(rolePerms);
                if (channelPerms.allow) {
                    channelPerms.allow.forEach(p => perms.add(p));
                }
                if (channelPerms.deny) {
                    channelPerms.deny.forEach(p => perms.delete(p));
                }
                return perms;
            };

            const rolePerms = ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'];
            const channelPerms = { allow: ['MANAGE_MESSAGES'], deny: ['SEND_MESSAGES'] };

            const effective = calculatePermissions(rolePerms, channelPerms);
            expect(effective.has('VIEW_CHANNEL')).toBe(true);
            expect(effective.has('SEND_MESSAGES')).toBe(false);
            expect(effective.has('MANAGE_MESSAGES')).toBe(true);
        });
    });

    describe('Channel Categories', () => {
        it('should move channel to category', async () => {
            const category = { id: 'cat1', children: new Map() };
            const channel = { id: 'ch1', parentId: null };

            const moveToCategory = (ch, cat) => {
                ch.parentId = cat.id;
                cat.children.set(ch.id, ch);
                return ch;
            };

            const updated = moveToCategory(channel, category);
            expect(updated.parentId).toBe('cat1');
            expect(category.children.has('ch1')).toBe(true);
        });

        it('should list channels in category', async () => {
            const channels = [
                { id: '1', parentId: 'cat1', name: 'channel1' },
                { id: '2', parentId: 'cat1', name: 'channel2' },
                { id: '3', parentId: 'cat2', name: 'channel3' }
            ];

            const listCategoryChannels = (channelList, categoryId) => {
                return channelList.filter(ch => ch.parentId === categoryId);
            };

            const categoryChannels = listCategoryChannels(channels, 'cat1');
            expect(categoryChannels.length).toBe(2);
            expect(categoryChannels.every(c => c.parentId === 'cat1')).toBe(true);
        });
    });

    describe('Channel Utilities', () => {
        it('should find channel by name', async () => {
            const channels = [
                { id: '1', name: 'general' },
                { id: '2', name: 'off-topic' },
                { id: '3', name: 'help' }
            ];

            const findByName = (channelList, name) => {
                return channelList.find(ch => ch.name.toLowerCase() === name.toLowerCase());
            };

            expect(findByName(channels, 'general').id).toBe('1');
            expect(findByName(channels, 'HELP')).toBe('3');
            expect(findByName(channels, 'nonexistent')).toBeUndefined();
        });

        it('should get channel statistics', async () => {
            const channels = [
                { id: '1', name: 'general', messages: 1000, type: 'GUILD_TEXT' },
                { id: '2', name: 'voice1', members: 5, type: 'GUILD_VOICE' }
            ];

            const getStats = (channelList) => {
                return {
                    totalChannels: channelList.length,
                    textChannels: channelList.filter(c => c.type === 'GUILD_TEXT').length,
                    voiceChannels: channelList.filter(c => c.type === 'GUILD_VOICE').length
                };
            };

            const stats = getStats(channels);
            expect(stats.totalChannels).toBe(2);
            expect(stats.textChannels).toBe(1);
            expect(stats.voiceChannels).toBe(1);
        });

        it('should sort channels by position', async () => {
            const channels = [
                { id: '1', name: 'a', position: 3 },
                { id: '2', name: 'b', position: 1 },
                { id: '3', name: 'c', position: 2 }
            ];

            const sortByPosition = (channelList) => {
                return [...channelList].sort((a, b) => a.position - b.position);
            };

            const sorted = sortByPosition(channels);
            expect(sorted[0].position).toBe(1);
            expect(sorted[1].position).toBe(2);
            expect(sorted[2].position).toBe(3);
        });
    });

    describe('Voice Channel Management', () => {
        it('should handle voice channel bitrate', async () => {
            const updateBitrate = (channel, bitrate) => {
                const maxBitrate = channel.userLimit > 0 ? Math.min(128000, 64000 + (channel.userLimit - 1) * 8000) : 96000;
                return Math.min(bitrate, maxBitrate);
            };

            const channel = { id: '1', userLimit: 0 };
            const newBitrate = updateBitrate(channel, 128000);
            expect(newBitrate).toBe(96000);
        });

        it('should handle voice channel user limit', async () => {
            const updateUserLimit = (channel, limit) => {
                if (limit < 0 || limit > 99) {
                    throw new Error('User limit must be 0-99');
                }
                channel.userLimit = limit;
                return channel;
            };

            const channel = { id: '1', userLimit: 0 };
            const updated = updateUserLimit(channel, 10);
            expect(updated.userLimit).toBe(10);
        });
    });

    describe('Channel Archiving', () => {
        it('should archive channel messages', async () => {
            const messages = [
                { id: '1', content: 'Message 1', timestamp: new Date() },
                { id: '2', content: 'Message 2', timestamp: new Date() }
            ];

            const archive = async (msgList) => {
                return msgList.map(m => ({
                    ...m,
                    archived: true,
                    archivedAt: new Date().toISOString()
                }));
            };

            const archived = await archive(messages);
            expect(archived.every(m => m.archived)).toBe(true);
        });

        it('should prevent posting in archived channels', () => {
            const channel = { id: '1', archived: true };

            const canPost = (ch) => {
                return !ch.archived;
            };

            expect(canPost(channel)).toBe(false);
        });
    });
});
