/**
 * Backup Manager
 * 
 * Handles serialization and restoration of server state.
 * Saves/Loads from local JSON files in data/backups/
 */
import fs from 'fs';
import path from 'path';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export const backupManager = {
    /**
     * Create a backup of the guild.
     * @param {import('discord.js').Guild} guild 
     * @returns {Promise<string>} Backup ID
     */
    async createBackup(guild) {
        const backupData = {
            id: Date.now().toString(),
            name: guild.name,
            createdAt: new Date().toISOString(),
            guildId: guild.id,
            roles: [],
            channels: []
        };

        // 1. Serialize Roles
        // Sort by position DESC (highest first)
        const roles = guild.roles.cache.sort((a, b) => b.position - a.position);
        roles.forEach(role => {
            if (role.managed || role.name === '@everyone') return; // Skip external/managed roles
            backupData.roles.push({
                name: role.name,
                color: role.hexColor,
                hoist: role.hoist,
                permissions: role.permissions.bitfield.toString(),
                mentionable: role.mentionable,
                position: role.position
            });
        });

        // 2. Serialize Channels & Categories
        // Fetch all to ensure cache is populated
        const channels = await guild.channels.fetch();
        const sortedChannels = channels.sort((a, b) => a.position - b.position);

        sortedChannels.forEach(ch => {
            if (!ch) return;
            const channelData = {
                name: ch.name,
                type: ch.type,
                parentId: ch.parentId, // We'll need to map this on restore
                parentName: ch.parent ? ch.parent.name : null,
                permissionOverwrites: []
            };

            // Serialize overwrites
            ch.permissionOverwrites.cache.forEach(overwrite => {
                // We only store role overwrites easily. User overwrites range from tricky to impossible if users leave.
                // For simplicity Phase 19: Store role overwrites by Role Name (since IDs change).
                const role = guild.roles.cache.get(overwrite.id);
                if (role) {
                    channelData.permissionOverwrites.push({
                        roleName: role.name,
                        allow: overwrite.allow.bitfield.toString(),
                        deny: overwrite.deny.bitfield.toString()
                    });
                }
            });

            backupData.channels.push(channelData);
        });

        const filePath = path.join(BACKUP_DIR, `${backupData.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

        return backupData.id;
    },

    /**
     * List available backups.
     * @returns {Array<{id: string, name: string, date: string}>}
     */
    listBackups() {
        if (!fs.existsSync(BACKUP_DIR)) return [];
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
        return files.map(f => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8'));
                return { id: data.id, name: data.name, date: data.createdAt, guildId: data.guildId };
            } catch (e) {
                return null;
            }
        }).filter(b => b !== null).sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    /**
     * Load a backup by ID.
     * @param {string} backupId 
     */
    getBackup(backupId) {
        const filePath = path.join(BACKUP_DIR, `${backupId}.json`);
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    },

    /**
     * Restore a backup to a guild.
     * WARNING: destructive operation.
     * @param {import('discord.js').Guild} guild 
     * @param {string} backupId 
     */
    async restoreBackup(guild, backupId) {
        const backup = this.getBackup(backupId);
        if (!backup) throw new Error('Backup not found');

        // 1. Roles
        // We'll try to find existing roles by name to update, or create new ones.
        // We do NOT delete existing roles to avoid breaking existing members, unless requested (Phase 20?).
        // For Phase 19: "Safe Restore" - Create missing, update existing permissions.

        const roleMap = new Map(); // Old Role Name -> New Role object

        for (const roleData of backup.roles) {
            let role = guild.roles.cache.find(r => r.name === roleData.name);
            if (role) {
                // Update existing
                await role.edit({
                    color: roleData.color,
                    permissions: BigInt(roleData.permissions),
                    hoist: roleData.hoist,
                    mentionable: roleData.mentionable
                });
            } else {
                // Create new
                role = await guild.roles.create({
                    name: roleData.name,
                    color: roleData.color,
                    permissions: BigInt(roleData.permissions),
                    hoist: roleData.hoist,
                    mentionable: roleData.mentionable
                });
            }
            roleMap.set(roleData.name, role);
        }

        // 2. Categories
        // We need to recreate categories first to assign channels to them.
        const categoryMap = new Map(); // Category Name -> Category Channel

        const categories = backup.channels.filter(c => c.type === ChannelType.GuildCategory);
        for (const catData of categories) {
            let category = guild.channels.cache.find(c => c.name === catData.name && c.type === ChannelType.GuildCategory);
            if (!category) {
                category = await guild.channels.create({
                    name: catData.name,
                    type: ChannelType.GuildCategory
                });
            }
            // Update perms
            await this.applyOverwrites(category, catData.permissionOverwrites, guild);
            categoryMap.set(catData.name, category);
        }

        // 3. Channels (Text/Voice)
        const channels = backup.channels.filter(c => c.type !== ChannelType.GuildCategory);
        for (const chData of channels) {
            // Find parent
            let parentId = null;
            if (chData.parentName && categoryMap.has(chData.parentName)) {
                parentId = categoryMap.get(chData.parentName).id;
            }

            let channel = guild.channels.cache.find(c => c.name === chData.name && c.type === chData.type && c.parentId === parentId);
            if (!channel) {
                channel = await guild.channels.create({
                    name: chData.name,
                    type: chData.type,
                    parent: parentId
                });
            } else {
                // If parent changed, move it
                if (channel.parentId !== parentId) {
                    await channel.setParent(parentId);
                }
            }

            // Update perms
            await this.applyOverwrites(channel, chData.permissionOverwrites, guild);
        }

        return true;
    },

    async applyOverwrites(channel, overwrites, guild) {
        if (!overwrites || overwrites.length === 0) return;

        const permissionOverwrites = [];
        // Always include @everyone if not explicitly handled? Discord defaults usually suffice.

        for (const ov of overwrites) {
            const role = guild.roles.cache.find(r => r.name === ov.roleName);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: BigInt(ov.allow),
                    deny: BigInt(ov.deny)
                });
            }
        }

        if (permissionOverwrites.length > 0) {
            await channel.permissionOverwrites.set(permissionOverwrites);
        }
    }
};
