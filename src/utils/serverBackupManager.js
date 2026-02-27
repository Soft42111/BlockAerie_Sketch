import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

export class ServerBackupManager {
    constructor() {
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    async createBackup(guild, options = {}) {
        const {
            includeChannels = true,
            includeRoles = true,
            includeEmojis = true,
            include Bans = true,
            includeSettings = true
        } = options;

        const backup = {
            id: uuidv4(),
            createdAt: Date.now(),
            guildId: guild.id,
            guildName: guild.name,
            options: { includeChannels, includeRoles, includeEmojis, includeBans, includeSettings },
            data: {}
        };

        try {
            if (includeChannels) {
                backup.data.channels = await this.backupChannels(guild);
                backup.data.categories = this.backupCategories(guild);
            }

            if (includeRoles) {
                backup.data.roles = this.backupRoles(guild);
            }

            if (includeEmojis) {
                backup.data.emojis = this.backupEmojis(guild);
            }

            if (includeBans) {
                backup.data.bans = await this.backupBans(guild);
            }

            if (includeSettings) {
                backup.data.settings = this.backupSettings(guild);
            }

            this.saveBackup(backup);

            return {
                success: true,
                backupId: backup.id,
                createdAt: new Date(backup.createdAt).toISOString(),
                size: JSON.stringify(backup).length,
                options: backup.options
            };
        } catch (error) {
            console.error('Backup creation failed:', error);
            return { success: false, error: error.message };
        }
    }

    async backupChannels(guild) {
        const channels = [];
        
        for (const channel of guild.channels.cache.values()) {
            if (channel.type === 2) continue;
            
            const channelData = {
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                topic: channel.topic,
                nsfw: channel.nsfw,
                bitrate: channel.bitrate,
                userLimit: channel.userLimit,
                parentId: channel.parentId,
                permissionOverwrites: []
            };

            for (const [id, overwrite] of channel.permissionOverwrites.cache) {
                channelData.permissionOverwrites.push({
                    id,
                    type: overwrite.type,
                    allow: overwrite.allow.toArray(),
                    deny: overwrite.deny.toArray()
                });
            }

            channels.push(channelData);
        }

        return channels;
    }

    backupCategories(guild) {
        const categories = [];
        
        for (const category of guild.channels.cache.filter(c => c.type === 4).values()) {
            categories.push({
                id: category.id,
                name: category.name,
                position: category.position,
                nsfw: category.nsfw,
                permissionOverwrites: []
            });

            for (const [id, overwrite] of category.permissionOverwrites.cache) {
                categories[categories.length - 1].permissionOverwrites.push({
                    id,
                    type: overwrite.type,
                    allow: overwrite.allow.toArray(),
                    deny: overwrite.deny.toArray()
                });
            }
        }

        return categories;
    }

    backupRoles(guild) {
        const roles = [];
        
        for (const role of guild.roles.cache.values()) {
            if (role.managed) continue;
            
            roles.push({
                id: role.id,
                name: role.name,
                color: role.hexColor,
                hoist: role.hoist,
                position: role.position,
                permissions: role.permissions.toArray(),
                mentionable: role.mentionable
            });
        }

        return roles.sort((a, b) => b.position - a.position);
    }

    backupEmojis(guild) {
        const emojis = [];
        
        for (const emoji of guild.emojis.cache.values()) {
            emojis.push({
                id: emoji.id,
                name: emoji.name,
                animated: emoji.animated,
                url: emoji.url
            });
        }

        return emojis;
    }

    async backupBans(guild) {
        const bans = [];
        
        try {
            const banList = await guild.bans.fetch();
            
            for (const [id, banEntry] of banList) {
                bans.push({
                    userId: id,
                    reason: banEntry.reason
                });
            }
        } catch (error) {
            console.error('Failed to backup bans:', error);
        }

        return bans;
    }

    backupSettings(guild) {
        return {
            name: guild.name,
            icon: guild.iconURL(),
            banner: guild.bannerURL(),
            splash: guild.splashURL(),
            verificationLevel: guild.verificationLevel,
            defaultMessageNotifications: guild.defaultMessageNotifications,
            explicitContentFilter: guild.explicitContentFilter,
            systemChannelId: guild.systemChannelId,
            systemChannelFlags: guild.systemChannelFlags.toArray(),
            rulesChannelId: guild.rulesChannelId,
            publicUpdatesChannelId: guild.publicUpdatesChannelId,
            afkChannelId: guild.afkChannelId,
            afkTimeout: guild.afkTimeout,
            mfaLevel: guild.mfaLevel,
            preferredLocale: guild.preferredLocale
        };
    }

    async restoreBackup(guild, backupId, options = {}) {
        const {
            restoreChannels = true,
            restoreRoles = true,
            restoreEmojis = true,
            restoreBans = true,
            restoreSettings = true,
            deleteExisting = false
        } = options;

        const backup = this.getBackup(backupId);
        
        if (!backup) {
            return { success: false, error: 'Backup not found' };
        }

        const results = {
            success: true,
            restored: {},
            errors: []
        };

        try {
            if (restoreRoles && backup.data.roles) {
                results.restored.roles = await this.restoreRoles(guild, backup.data.roles, deleteExisting);
            }

            if (restoreChannels && backup.data.channels) {
                results.restored.channels = await this.restoreChannels(guild, backup.data.channels, deleteExisting);
            }

            if (restoreEmojis && backup.data.emojis) {
                results.restored.emojis = await this.restoreEmojis(guild, backup.data.emojis);
            }

            if (restoreBans && backup.data.bans) {
                results.restored.bans = await this.restoreBans(guild, backup.data.bans);
            }

            if (restoreSettings && backup.data.settings) {
                results.restored.settings = await this.restoreSettings(guild, backup.data.settings);
            }
        } catch (error) {
            results.success = false;
            results.errors.push(error.message);
        }

        return results;
    }

    async restoreRoles(guild, rolesData, deleteExisting) {
        const restored = [];
        
        const sortedRoles = rolesData.sort((a, b) => a.position - b.position);
        
        for (const roleData of sortedRoles) {
            try {
                let role = guild.roles.cache.find(r => r.name === roleData.name && !r.managed);
                
                if (role && !deleteExisting) {
                    await role.edit({
                        color: roleData.color,
                        hoist: roleData.hoist,
                        permissions: roleData.permissions,
                        mentionable: roleData.mentionable
                    });
                    restored.push({ name: roleData.name, action: 'updated' });
                } else if (deleteExisting && role) {
                    await role.delete();
                    role = await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        hoist: roleData.hoist,
                        permissions: roleData.permissions,
                        mentionable: roleData.mentionable,
                        reason: 'Restoring from backup'
                    });
                    restored.push({ name: roleData.name, action: 'replaced' });
                } else {
                    role = await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        hoist: roleData.hoist,
                        permissions: roleData.permissions,
                        mentionable: roleData.mentionable,
                        reason: 'Restoring from backup'
                    });
                    restored.push({ name: roleData.name, action: 'created' });
                }
            } catch (error) {
                restored.push({ name: roleData.name, action: 'failed', error: error.message });
            }
        }

        return restored;
    }

    async restoreChannels(guild, channelsData, deleteExisting) {
        const restored = [];
        const createdChannels = new Map();

        for (const channelData of channelsData) {
            try {
                let channel = guild.channels.cache.find(c => c.name === channelData.name && c.type === channelData.type);
                
                if (channel && !deleteExisting) {
                    await channel.edit({
                        name: channelData.name,
                        topic: channelData.topic,
                        nsfw: channelData.nsfw,
                        bitrate: channelData.bitrate,
                        userLimit: channelData.userLimit
                    });
                    restored.push({ name: channelData.name, action: 'updated' });
                } else if (deleteExisting && channel) {
                    await channel.delete();
                    channel = await this.createChannel(guild, channelData, createdChannels);
                    restored.push({ name: channelData.name, action: 'replaced' });
                } else {
                    channel = await this.createChannel(guild, channelData, createdChannels);
                    restored.push({ name: channelData.name, action: 'created' });
                }

                createdChannels.set(channelData.id, channel);
            } catch (error) {
                restored.push({ name: channelData.name, action: 'failed', error: error.message });
            }
        }

        return restored;
    }

    async createChannel(guild, channelData, createdChannels) {
        const parentId = channelData.parentId && createdChannels.has(channelData.parentId)
            ? createdChannels.get(channelData.parentId).id
            : channelData.parentId;

        const channel = await guild.channels.create({
            name: channelData.name,
            type: channelData.type,
            topic: channelData.topic,
            nsfw: channelData.nsfw,
            bitrate: channelData.bitrate,
            userLimit: channelData.userLimit,
            parent: parentId,
            permissionOverwrites: channelData.permissionOverwrites.map(po => ({
                id: po.id,
                type: po.type,
                allow: po.allow,
                deny: po.deny
            }))
        });

        return channel;
    }

    async restoreEmojis(guild, emojisData) {
        const restored = [];
        
        for (const emojiData of emojisData) {
            try {
                const existingEmoji = guild.emojis.cache.find(e => e.name === emojiData.name);
                
                if (existingEmoji) {
                    if (emojiData.animated) {
                        restored.push({ name: emojiData.name, action: 'skipped', reason: 'Already exists' });
                        continue;
                    }
                    await existingEmoji.delete();
                }

                const emojiURL = emojiData.url;
                const response = await fetch(emojiURL);
                const buffer = await response.arrayBuffer();
                
                const newEmoji = await guild.emojis.create({
                    name: emojiData.name,
                    attachment: Buffer.from(buffer),
                    reason: 'Restoring from backup'
                });

                restored.push({ name: emojiData.name, action: 'created' });
            } catch (error) {
                restored.push({ name: emojiData.name, action: 'failed', error: error.message });
            }
        }

        return restored;
    }

    async restoreBans(guild, bansData) {
        const restored = [];
        
        for (const banData of bansData) {
            try {
                await guild.members.ban(banData.userId, { reason: banData.reason || 'Restored from backup' });
                restored.push({ userId: banData.userId, action: 'banned' });
            } catch (error) {
                restored.push({ userId: banData.userId, action: 'failed', error: error.message });
            }
        }

        return restored;
    }

    async restoreSettings(guild, settingsData) {
        try {
            await guild.edit({
                name: settingsData.name,
                verificationLevel: settingsData.verificationLevel,
                defaultMessageNotifications: settingsData.defaultMessageNotifications,
                explicitContentFilter: settingsData.explicitContentFilter,
                systemChannelId: settingsData.systemChannelId,
                afkChannelId: settingsData.afkChannelId,
                afkTimeout: settingsData.afkTimeout,
                preferredLocale: settingsData.preferredLocale
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    saveBackup(backup) {
        const backupPath = path.join(BACKUPS_DIR, `${backup.id}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    }

    getBackup(backupId) {
        const backupPath = path.join(BACKUPS_DIR, `${backupId}.json`);
        
        if (!fs.existsSync(backupPath)) {
            return null;
        }

        try {
            return JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        } catch {
            return null;
        }
    }

    listBackups(guildId = null) {
        const backups = [];
        
        if (!fs.existsSync(BACKUPS_DIR)) {
            return [];
        }

        const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
        
        for (const file of files) {
            try {
                const backup = JSON.parse(fs.readFileSync(path.join(BACKUPS_DIR, file), 'utf8'));
                
                if (!guildId || backup.guildId === guildId) {
                    backups.push({
                        id: backup.id,
                        createdAt: new Date(backup.createdAt).toISOString(),
                        guildName: backup.guildName,
                        options: backup.options,
                        size: fs.statSync(path.join(BACKUPS_DIR, file)).size
                    });
                }
            } catch {
                continue;
            }
        }

        return backups.sort((a, b) => b.createdAt - a.createdAt);
    }

    deleteBackup(backupId) {
        const backupPath = path.join(BACKUPS_DIR, `${backupId}.json`);
        
        if (!fs.existsSync(backupPath)) {
            return false;
        }

        fs.unlinkSync(backupPath);
        return true;
    }

    async exportBackup(backupId) {
        const backup = this.getBackup(backupId);
        
        if (!backup) {
            return null;
        }

        return JSON.stringify(backup, null, 2);
    }

    async importBackup(backupJson, targetGuild) {
        try {
            const backup = JSON.parse(backupJson);
            return await this.restoreBackup(targetGuild, backup.id);
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    scheduleAutomaticBackups(guild, intervalHours = 24) {
        const intervalMs = intervalHours * 60 * 60 * 1000;
        
        const intervalId = setInterval(async () => {
            await this.createBackup(guild);
        }, intervalMs);

        return intervalId;
    }
}

export const serverBackupManager = new ServerBackupManager();
