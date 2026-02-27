import { PermissionsBitField, GuildMember, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dashboardServer from './dashboard.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const MODERATION_FILE = path.join(DATA_DIR, 'moderation.json');
const WARNS_FILE = path.join(DATA_DIR, 'warns.json');

class ModerationManager {
    constructor() {
        this.ensureDataDir();
        this.loadData();
        this.activeMutes = new Map();
        this.spamTracker = new Map();
        this.raidTracker = new Map();
    }

    ensureDataDir() {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(MODERATION_FILE)) {
            fs.writeFileSync(MODERATION_FILE, JSON.stringify({
                guilds: {}
            }, null, 2));
        }
        if (!fs.existsSync(WARNS_FILE)) {
            fs.writeFileSync(WARNS_FILE, JSON.stringify({}, null, 2));
        }
    }

    loadData() {
        try {
            const rawData = JSON.parse(fs.readFileSync(MODERATION_FILE, 'utf8'));

            // Migration: If the old structure is detected, move it into a 'guilds' object
            if (!rawData.guilds) {
                this.data = {
                    guilds: {
                        'default': {
                            autoModRules: rawData.autoModRules || [],
                            logChannelId: rawData.logChannelId || null,
                            muteRoleId: rawData.muteRoleId || null,
                            lockedChannels: rawData.lockedChannels || [],
                            lockImmuneRoles: rawData.lockImmuneRoles || [],
                            raidProtection: rawData.raidProtection || {
                                enabled: false,
                                joinThreshold: 10,
                                timeWindow: 10000,
                                action: 'lockdown'
                            }
                        }
                    }
                };
            } else {
                this.data = rawData;
            }
        } catch (error) {
            this.data = { guilds: {} };
        }
        try {
            this.warns = JSON.parse(fs.readFileSync(WARNS_FILE, 'utf8'));
        } catch (error) {
            this.warns = {};
        }
    }

    /**
     * Get or initialize data for a specific guild
     * @param {string} guildId 
     */
    getGuildData(guildId) {
        if (!guildId) return null;
        if (!this.data.guilds[guildId]) {
            this.data.guilds[guildId] = {
                autoModRules: [],
                logChannelId: null,
                muteRoleId: null,
                lockedChannels: [],
                lockImmuneRoles: [],
                raidProtection: {
                    enabled: false,
                    joinThreshold: 10,
                    timeWindow: 10000,
                    action: 'lockdown'
                }
            };
            this.saveData();
        }
        return this.data.guilds[guildId];
    }

    saveData() {
        try {
            fs.writeFileSync(MODERATION_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('❌ Failed to save moderation data:', error);
        }
    }

    saveWarns() {
        try {
            fs.writeFileSync(WARNS_FILE, JSON.stringify(this.warns, null, 2));
        } catch (error) {
            console.error('❌ Failed to save warns:', error);
        }
    }

    /**
     * Generate a unique case ID
     */
    generateCaseId() {
        return Math.random().toString(36).substring(2, 9).toUpperCase();
    }

    /**
     * Check if moderator can perform action on target
     * @param {GuildMember} moderator - The moderator performing the action
     * @param {GuildMember} target - The target member
     * @param {string} action - The action being performed
     * @returns {Object} - { allowed: boolean, reason: string }
     */
    canModerate(moderator, target, action = 'moderate') {
        if (!moderator || !target) {
            return { allowed: false, reason: 'Invalid member data' };
        }

        // Bot owner check
        if (moderator.id === process.env.BOT_OWNER_ID) {
            return { allowed: true };
        }

        // Self-check
        if (moderator.id === target.id) {
            return { allowed: false, reason: `You cannot ${action} yourself` };
        }

        // Guild owner check - owner cannot be moderated
        if (target.id === target.guild.ownerId) {
            return { allowed: false, reason: 'Cannot moderate the server owner' };
        }

        // Role hierarchy check
        const modHighestRole = moderator.roles.highest;
        const targetHighestRole = target.roles.highest;
        const botHighestRole = target.guild.members.me.roles.highest;

        // Check if bot can moderate the target
        if (targetHighestRole.position >= botHighestRole.position) {
            return { allowed: false, reason: 'I cannot moderate this user - their highest role is equal to or higher than mine' };
        }

        // Check if moderator can moderate the target
        if (targetHighestRole.position >= modHighestRole.position) {
            return { allowed: false, reason: 'You cannot moderate a user with equal or higher role' };
        }

        return { allowed: true };
    }

    /**
     * Check permission for specific moderation action
     * @param {GuildMember} moderator - The moderator
     * @param {string} permission - The required permission
     * @returns {boolean}
     */
    hasPermission(moderator, permission) {
        if (!moderator) return false;
        return moderator.permissions.has(permission);
    }

    /**
     * Log moderation action to log channel
     * @param {Object} action - Action details
     */
    async logAction(action) {
        const guildData = this.getGuildData(action.guild.id);
        if (!guildData || !guildData.logChannelId) return false;

        try {
            const guild = action.guild;
            const logChannel = await guild.channels.fetch(guildData.logChannelId).catch(() => null);
            if (!logChannel) return false;

            const embed = {
                color: this.getActionColor(action.type),
                title: `${this.getActionEmoji(action.type)} ${action.type.toUpperCase()}`,
                description: `**User:** ${action.target.tag} (${action.target.id})\n**Moderator:** ${action.moderator.tag} (${action.moderator.id})`,
                fields: [
                    {
                        name: 'Reason',
                        value: action.reason || 'No reason provided',
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: { text: `Case ID: ${action.caseId || 'N/A'}` }
            };

            if (action.duration) {
                embed.fields.push({
                    name: 'Duration',
                    value: action.duration,
                    inline: true
                });
            }

            await logChannel.send({ embeds: [embed] });

            // Broadcast to Dashboard
            dashboardServer.broadcastAction({
                type: 'moderation',
                action: action.type,
                target: action.target.tag,
                moderator: action.moderator.tag,
                reason: action.reason,
                details: action
            });

            return true;
        } catch (error) {
            console.error('❌ Failed to log action:', error);
            return false;
        }
    }

    getActionColor(type) {
        const colors = {
            ban: 0xFF0000,
            kick: 0xFF8C00,
            mute: 0xFFD700,
            unmute: 0x00FF00,
            warn: 0xFFA500,
            timeout: 0x800080,
            unban: 0x00FF00,
            role_create: 0x3498DB,
            role_delete: 0xE74C3C,
            role_add: 0x2ECC71,
            role_remove: 0xF1C40F,
            webhook_create: 0x9B59B6
        };
        return colors[type] || 0x808080;
    }

    getActionEmoji(type) {
        const emojis = {
            ban: '🔨',
            kick: '👢',
            mute: '🔇',
            unmute: '🔊',
            warn: '⚠️',
            timeout: '⏱️',
            unban: '✅',
            role_create: '🎭',
            role_delete: '🗑️',
            role_add: '➕',
            role_remove: '➖',
            webhook_create: '⚓'
        };
        return emojis[type] || '📝';
    }

    /**
     * Ban a user from the guild
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember} target - The target
     * @param {Object} options - Ban options
     */
    async ban(moderator, target, options = {}) {
        const { reason = 'No reason provided', deleteMessageSeconds = 0 } = options;

        // Permission check
        if (!this.hasPermission(moderator, PermissionFlagsBits.BanMembers)) {
            return { success: false, error: 'You need Ban Members permission' };
        }

        // Hierarchy check
        const hierarchyCheck = this.canModerate(moderator, target, 'ban');
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }

        try {
            await target.ban({ reason, deleteMessageSeconds });

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'ban',
                guild: target.guild,
                target: target.user,
                moderator: moderator.user,
                reason,
                caseId
            });

            return { success: true, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Unban a user from the guild
     * @param {GuildMember} moderator - The moderator
     * @param {Object} guild - The guild
     * @param {string} userId - The user ID to unban
     * @param {string} reason - Unban reason
     */
    async unban(moderator, guild, userId, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.BanMembers)) {
            return { success: false, error: 'You need Ban Members permission' };
        }

        try {
            await guild.members.unban(userId, reason);

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'unban',
                guild,
                target: { tag: userId, id: userId },
                moderator: moderator.user,
                reason,
                caseId
            });

            return { success: true, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Kick a member from the guild
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember} target - The target
     * @param {string} reason - Kick reason
     */
    async kick(moderator, target, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.KickMembers)) {
            return { success: false, error: 'You need Kick Members permission' };
        }

        const hierarchyCheck = this.canModerate(moderator, target, 'kick');
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }

        try {
            await target.kick(reason);

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'kick',
                guild: target.guild,
                target: target.user,
                moderator: moderator.user,
                reason,
                caseId
            });

            return { success: true, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Timeout/mute a member
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember} target - The target
     * @param {number} durationMs - Duration in milliseconds
     * @param {string} reason - Timeout reason
     */
    async timeout(moderator, target, durationMs, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ModerateMembers)) {
            return { success: false, error: 'You need Moderate Members permission' };
        }

        const hierarchyCheck = this.canModerate(moderator, target, 'timeout');
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }

        try {
            await target.timeout(durationMs, reason);

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'timeout',
                guild: target.guild,
                target: target.user,
                moderator: moderator.user,
                reason,
                duration: this.formatDuration(durationMs),
                caseId
            });

            return { success: true, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Remove timeout from a member
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember} target - The target
     * @param {string} reason - Reason
     */
    async removeTimeout(moderator, target, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ModerateMembers)) {
            return { success: false, error: 'You need Moderate Members permission' };
        }

        try {
            await target.timeout(null, reason);

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'unmute',
                guild: target.guild,
                target: target.user,
                moderator: moderator.user,
                reason,
                caseId
            });

            return { success: true, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Warn a user
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember} target - The target
     * @param {string} reason - Warn reason
     */
    async warn(moderator, target, reason = 'No reason provided') {
        const hierarchyCheck = this.canModerate(moderator, target, 'warn');
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }

        const guildId = target.guild.id;
        const userId = target.id;

        if (!this.warns[guildId]) this.warns[guildId] = {};
        if (!this.warns[guildId][userId]) this.warns[guildId][userId] = [];

        const warnData = {
            id: this.generateCaseId(),
            reason,
            moderator: moderator.id,
            timestamp: Date.now()
        };

        this.warns[guildId][userId].push(warnData);
        this.saveWarns();

        await this.logAction({
            type: 'warn',
            guild: target.guild,
            target: target.user,
            moderator: moderator.user,
            reason,
            caseId: warnData.id
        });

        // Check for auto-actions
        const warnCount = this.warns[guildId][userId].length;
        const autoAction = await this.checkAutoActions(target.guild, target, warnCount);

        return {
            success: true,
            caseId: warnData.id,
            warnCount,
            autoAction
        };
    }

    /**
     * Get warnings for a user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     */
    getWarnings(guildId, userId) {
        if (!this.warns[guildId] || !this.warns[guildId][userId]) return [];
        return this.warns[guildId][userId];
    }

    /**
     * Clear warnings for a user
     * @param {GuildMember} moderator - The moderator
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     */
    clearWarnings(moderator, guildId, userId) {
        if (!this.warns[guildId] || !this.warns[guildId][userId]) {
            return { success: false, error: 'No warnings found for this user' };
        }

        delete this.warns[guildId][userId];
        this.saveWarns();

        return { success: true, clearedCount: this.warns[guildId]?.[userId]?.length || 0 };
    }

    /**
     * Remove a specific warning
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} warnId - Warning ID
     */
    removeWarning(guildId, userId, warnId) {
        if (!this.warns[guildId] || !this.warns[guildId][userId]) {
            return { success: false, error: 'No warnings found' };
        }

        const index = this.warns[guildId][userId].findIndex(w => w.id === warnId);
        if (index === -1) {
            return { success: false, error: 'Warning not found' };
        }

        this.warns[guildId][userId].splice(index, 1);
        this.saveWarns();

        return { success: true };
    }

    /**
     * Check and execute auto-actions based on warn count
     * @param {Object} guild - Guild
     * @param {GuildMember} target - Target member
     * @param {number} warnCount - Current warn count
     */
    async checkAutoActions(guild, target, warnCount) {
        const guildData = this.getGuildData(guild.id);
        const rules = guildData.autoModRules.filter(r => r.enabled);

        for (const rule of rules) {
            if (rule.trigger === 'warns' && warnCount >= rule.threshold) {
                const moderator = guild.members.me;

                switch (rule.action) {
                    case 'timeout':
                        await this.timeout(moderator, target, rule.duration, `Auto-action: ${warnCount} warnings`);
                        return { executed: true, action: 'timeout', duration: rule.duration };
                    case 'kick':
                        await this.kick(moderator, target, `Auto-action: ${warnCount} warnings`);
                        return { executed: true, action: 'kick' };
                    case 'ban':
                        await this.ban(moderator, target, { reason: `Auto-action: ${warnCount} warnings` });
                        return { executed: true, action: 'ban' };
                }
            }
        }
        return { executed: false };
    }

    /**
     * Add auto-moderation rule
     * @param {Object} rule - Rule configuration
     */
    addAutoModRule(guildId, rule) {
        const guildData = this.getGuildData(guildId);
        rule.id = this.generateCaseId();
        rule.createdAt = Date.now();
        guildData.autoModRules.push(rule);
        this.saveData();
        return rule;
    }

    /**
     * Remove auto-moderation rule
     * @param {string} ruleId - Rule ID
     */
    removeAutoModRule(guildId, ruleId) {
        const guildData = this.getGuildData(guildId);
        const index = guildData.autoModRules.findIndex(r => r.id === ruleId);
        if (index === -1) return false;

        guildData.autoModRules.splice(index, 1);
        this.saveData();
        return true;
    }

    /**
     * Set log channel
     * @param {string} channelId - Channel ID
     */
    setLogChannel(guildId, channelId) {
        const guildData = this.getGuildData(guildId);
        guildData.logChannelId = channelId;
        this.saveData();
        return true;
    }

    /**
     * Check if user is spamming
     * @param {string} userId - User ID
     * @param {string} content - Message content
     * @param {Object} config - Anti-spam config
     */
    checkSpam(userId, content, config = {}) {
        const { messageThreshold = 5, timeWindow = 5000, maxDuplicates = 3 } = config;
        const now = Date.now();

        if (!this.spamTracker.has(userId)) {
            this.spamTracker.set(userId, { messages: [], lastMessage: null, duplicateCount: 0 });
        }

        const userData = this.spamTracker.get(userId);

        // Clean old messages
        userData.messages = userData.messages.filter(m => now - m.timestamp < timeWindow);

        // Check duplicates (Flood Protection)
        if (userData.lastMessage === content) {
            userData.duplicateCount++;
        } else {
            userData.duplicateCount = 1;
            userData.lastMessage = content;
        }

        // Add current message
        userData.messages.push({ content, timestamp: now });

        // Check message rate
        if (userData.messages.length >= messageThreshold) {
            return { isSpamming: true, reason: 'Message rate exceeded (Fast typing)' };
        }

        // Check duplicates count
        if (userData.duplicateCount >= maxDuplicates) {
            return { isSpamming: true, reason: 'Repeated text spam' };
        }

        // Check for mass mentions
        const mentionCount = (content.match(/<@!?\d+>/g) || []).length;
        if (mentionCount > 5) {
            return { isSpamming: true, reason: 'Mass mention detected' };
        }

        return { isSpamming: false };
    }

    /**
     * Advanced Content Check (Invites, Emojis, Links)
     * @param {Message} message - The Discord message object
     * @returns {Object} Analysis result
     */
    checkContent(message) {
        const content = message.content;
        const guildData = this.getGuildData(message.guild.id);
        const config = guildData.autoModRules || [];

        // 1. Invite Link Detection
        const inviteRegex = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/.+/i;
        if (inviteRegex.test(content)) {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return { violation: true, type: 'invite', reason: 'Unauthorized Discord invite link' };
            }
        }

        // 2. URL Scanning (Blacklist)
        const blockedDomains = ['grabify.link', 'iplogger.org', 'bit.ly/sus-link'];
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = content.match(urlRegex) || [];

        for (const url of urls) {
            if (blockedDomains.some(domain => url.includes(domain))) {
                return { violation: true, type: 'malicious_link', reason: 'Malicious/Blocked URL detected' };
            }
        }

        // 3. Mass Emoji Detection
        const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|<a?:.+?:\d+>)/g;
        const emojiCount = (content.match(emojiRegex) || []).length;
        if (emojiCount > 8) {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return { violation: true, type: 'emoji_spam', reason: `Mass emoji usage (${emojiCount} emojis)` };
            }
        }

        // 4. Mass Mention Detection
        const mentionCount = (content.match(/<@!?\d+>/g) || []).length;
        if (mentionCount > 5) {
            if (!message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
                return { violation: true, type: 'mention_spam', reason: `Mass mention (${mentionCount} mentions)` };
            }
        }

        return { violation: false };
    }

    /**
     * Check for raid activity
     * @param {string} guildId - Guild ID
     * @param {string} userId - New member ID
     */
    checkRaid(guildId, userId) {
        const guildDataConfig = this.getGuildData(guildId);
        if (!guildDataConfig.raidProtection.enabled) return { isRaid: false };

        const now = Date.now();
        const config = guildDataConfig.raidProtection;

        if (!this.raidTracker.has(guildId)) {
            this.raidTracker.set(guildId, { joins: [], locked: false });
        }

        const guildData = this.raidTracker.get(guildId);

        // Clean old joins
        guildData.joins = guildData.joins.filter(j => now - j < config.timeWindow);

        // Add current join
        guildData.joins.push(now);

        // Check if raid threshold exceeded
        if (guildData.joins.length >= config.joinThreshold) {
            return {
                isRaid: true,
                joinsInWindow: guildData.joins.length,
                action: config.action
            };
        }

        return { isRaid: false, joinsInWindow: guildData.joins.length };
    }

    /**
     * Toggle raid protection
     * @param {boolean} enabled - Enable/disable
     * @param {Object} config - Raid protection config
     */
    setRaidProtection(guildId, enabled, config = {}) {
        const guildData = this.getGuildData(guildId);
        guildData.raidProtection = {
            ...guildData.raidProtection,
            enabled,
            ...config
        };
        this.saveData();
        return guildData.raidProtection;
    }

    /**
     * Toggle lock for a channel
     * @param {string} channelId - Channel ID
     */
    toggleLock(guildId, channelId) {
        const guildData = this.getGuildData(guildId);
        const index = guildData.lockedChannels.indexOf(channelId);
        let locked = false;

        if (index === -1) {
            guildData.lockedChannels.push(channelId);
            locked = true;
        } else {
            guildData.lockedChannels.splice(index, 1);
            locked = false;
        }

        this.saveData();
        return locked;
    }

    /**
     * Check if a channel is locked
     * @param {string} channelId - Channel ID
     */
    isLocked(guildId, channelId) {
        const guildData = this.getGuildData(guildId);
        return guildData.lockedChannels.includes(channelId);
    }

    /**
     * Toggle lock immunity for a role
     * @param {string} roleId - Role ID
     */
    toggleLockImmunity(guildId, roleId) {
        const guildData = this.getGuildData(guildId);
        const index = guildData.lockImmuneRoles.indexOf(roleId);
        let immune = false;

        if (index === -1) {
            guildData.lockImmuneRoles.push(roleId);
            immune = true;
        } else {
            guildData.lockImmuneRoles.splice(index, 1);
            immune = false;
        }

        this.saveData();
        return immune;
    }

    /**
     * Check if a member is immune to channel locks
     * @param {GuildMember} member - The member to check
     */
    isImmuneToLock(member) {
        if (!member) return false;
        // Admins are always immune
        if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

        // Bot owner is always immune
        if (member.id === process.env.BOT_OWNER_ID) return true;

        // Check for immune roles
        const guildData = this.getGuildData(member.guild.id);
        return member.roles.cache.some(role => guildData.lockImmuneRoles.includes(role.id));
    }

    // ── Role Management ───────────────────────────────────────────

    async createRole(moderator, guild, data) {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ManageRoles)) {
            return { success: false, error: 'Missing Manage Roles permission' };
        }

        try {
            const role = await guild.roles.create({
                name: data.name,
                color: data.color,
                reason: data.reason || `Created by ${moderator.user.tag}`
            });

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'role_create',
                guild,
                target: { tag: role.name, id: role.id },
                moderator: moderator.user,
                reason: data.reason || 'No reason provided',
                caseId
            });

            return { success: true, role, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deleteRole(moderator, guild, roleId, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ManageRoles)) {
            return { success: false, error: 'Missing Manage Roles permission' };
        }

        const role = guild.roles.cache.get(roleId);
        if (!role) return { success: false, error: 'Role not found' };

        if (role.position >= guild.members.me.roles.highest.position) {
            return { success: false, error: 'I cannot delete a role that is higher than mine' };
        }

        try {
            const roleName = role.name;
            await role.delete(reason);

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'role_delete',
                guild,
                target: { tag: roleName, id: roleId },
                moderator: moderator.user,
                reason,
                caseId
            });

            return { success: true, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async addRoleToMember(moderator, target, role, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ManageRoles)) {
            return { success: false, error: 'Missing Manage Roles permission' };
        }

        if (role.position >= moderator.roles.highest.position && moderator.id !== target.guild.ownerId) {
            return { success: false, error: 'You cannot manage a role higher than yours' };
        }

        try {
            await target.roles.add(role, reason);

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'role_add',
                guild: target.guild,
                target: target.user,
                moderator: moderator.user,
                reason: `Added role: ${role.name} | ${reason}`,
                caseId
            });

            return { success: true, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async removeRoleFromMember(moderator, target, role, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ManageRoles)) {
            return { success: false, error: 'Missing Manage Roles permission' };
        }

        if (role.position >= moderator.roles.highest.position && moderator.id !== target.guild.ownerId) {
            return { success: false, error: 'You cannot manage a role higher than yours' };
        }

        try {
            await target.roles.remove(role, reason);

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'role_remove',
                guild: target.guild,
                target: target.user,
                moderator: moderator.user,
                reason: `Removed role: ${role.name} | ${reason}`,
                caseId
            });

            return { success: true, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ── Webhook Management ────────────────────────────────────────

    async createWebhook(moderator, channel, name, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ManageWebhooks)) {
            return { success: false, error: 'Missing Manage Webhooks permission' };
        }

        try {
            const webhook = await channel.createWebhook({
                name: name,
                reason: `Created by ${moderator.user.tag}: ${reason}`
            });

            const caseId = this.generateCaseId();
            await this.logAction({
                type: 'webhook_create',
                guild: channel.guild,
                target: { tag: webhook.name, id: webhook.id },
                moderator: moderator.user,
                reason: `In #${channel.name} | ${reason}`,
                caseId
            });

            return { success: true, webhook, caseId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate unique case ID
     */
    generateCaseId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    /**
     * Format duration for display
     * @param {number} ms - Duration in milliseconds
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Parse duration string (e.g., "1d", "2h", "30m")
     * @param {string} durationStr - Duration string
     * @returns {number|null} - Duration in milliseconds or null if invalid
     */
    parseDuration(durationStr) {
        const match = durationStr.match(/^(\d+)([smhd])$/i);
        if (!match) return null;

        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        const multipliers = {
            s: 1000,
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000
        };

        return value * multipliers[unit];
    }
}

export const moderationManager = new ModerationManager();
