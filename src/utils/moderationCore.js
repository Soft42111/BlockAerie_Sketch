import { 
    PermissionFlagsBits, 
    EmbedBuilder, 
    Colors, 
    time,
    TimestampStyles
} from 'discord.js';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const MODERATION_DATA_FILE = path.join(DATA_DIR, 'moderation_cases.json');
const MUTE_CONFIG_FILE = path.join(DATA_DIR, 'mute_config.json');

export class ModerationSystem {
    constructor() {
        this.ensureDataFiles();
        this.loadData();
        this.caseCounter = this.loadCaseCounter();
        this.undoStack = new Map();
    }

    ensureDataFiles() {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        
        if (!fs.existsSync(MODERATION_DATA_FILE)) {
            fs.writeFileSync(MODERATION_DATA_FILE, JSON.stringify({
                cases: [],
                userCases: {},
                guildCaseCount: {}
            }, null, 2));
        }
        
        if (!fs.existsSync(MUTE_CONFIG_FILE)) {
            fs.writeFileSync(MUTE_CONFIG_FILE, JSON.stringify({
                roleId: null,
                guildMuteConfigs: {}
            }, null, 2));
        }
    }

    loadData() {
        try {
            this.moderationData = JSON.parse(fs.readFileSync(MODERATION_DATA_FILE, 'utf8'));
        } catch (error) {
            this.moderationData = { cases: [], userCases: {}, guildCaseCount: {} };
        }
        
        try {
            this.muteConfig = JSON.parse(fs.readFileSync(MUTE_CONFIG_FILE, 'utf8'));
        } catch (error) {
            this.muteConfig = { roleId: null, guildMuteConfigs: {} };
        }
    }

    saveModerationData() {
        try {
            fs.writeFileSync(MODERATION_DATA_FILE, JSON.stringify(this.moderationData, null, 2));
        } catch (error) {
            console.error('Failed to save moderation data:', error);
        }
    }

    saveMuteConfig() {
        try {
            fs.writeFileSync(MUTE_CONFIG_FILE, JSON.stringify(this.muteConfig, null, 2));
        } catch (error) {
            console.error('Failed to save mute config:', error);
        }
    }

    loadCaseCounter() {
        const maxCaseNum = this.moderationData.cases.reduce((max, caseItem) => {
            const num = parseInt(caseItem.caseNumber.replace(/^#/, '')) || 0;
            return Math.max(max, num);
        }, 0);
        return maxCaseNum + 1;
    }

    hasPermission(member, permission) {
        if (!member) return false;
        return member.permissions.has(permission);
    }

    hasModeratorRole(member) {
        const config = this.muteConfig.guildMuteConfigs[member.guild.id] || {};
        const modRoleId = config.modRoleId;
        if (modRoleId && member.roles.cache.has(modRoleId)) {
            return true;
        }
        return member.permissions.has(PermissionFlagsBits.ModerateMembers);
    }

    checkHierarchy(moderator, target) {
        if (moderator.id === target.id) {
            return { allowed: false, reason: 'You cannot moderate yourself' };
        }
        
        if (target.id === target.guild.ownerId) {
            return { allowed: false, reason: 'Cannot moderate the server owner' };
        }
        
        if (target.roles.highest.position >= moderator.roles.highest.position) {
            return { allowed: false, reason: 'Target has equal or higher role' };
        }
        
        const botMember = target.guild.members.me;
        if (target.roles.highest.position >= botMember.roles.highest.position) {
            return { allowed: false, reason: 'Cannot moderate - target role is too high' };
        }
        
        return { allowed: true };
    }

    async notifyUser(user, guild, action, details) {
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle(`Action Taken in ${guild.name}`)
                .setDescription(`A moderation action has been taken against you.`)
                .addFields(
                    { name: 'Action', value: action, inline: true },
                    { name: 'Guild', value: guild.name, inline: true },
                    { name: 'Details', value: details }
                )
                .setTimestamp();

            await user.send({ embeds: [dmEmbed] });
            return true;
        } catch (error) {
            return false;
        }
    }

    generateCaseNumber() {
        return `#${String(this.caseCounter++).padStart(5, '0')}`;
    }

    createCase(moderator, target, type, reason, options = {}) {
        const caseNumber = this.generateCaseNumber();
        const caseData = {
            caseNumber,
            type,
            targetId: target.id,
            targetTag: target.user?.tag || target.tag,
            moderatorId: moderator.id,
            moderatorTag: moderator.user?.tag || moderator.tag,
            guildId: moderator.guild?.id || options.guildId,
            reason,
            duration: options.duration || null,
            evidence: options.evidence || [],
            timestamp: Date.now(),
            undone: false,
            undoReason: null,
            additionalInfo: options.additionalInfo || {}
        };

        this.moderationData.cases.push(caseData);
        
        if (!this.moderationData.userCases[caseData.targetId]) {
            this.moderationData.userCases[caseData.targetId] = [];
        }
        this.moderationData.userCases[caseData.targetId].push(caseNumber);
        
        const guildId = caseData.guildId;
        if (!this.moderationData.guildCaseCount[guildId]) {
            this.moderationData.guildCaseCount[guildId] = 0;
        }
        this.moderationData.guildCaseCount[guildId]++;
        
        this.saveModerationData();
        
        return caseData;
    }

    async logToChannel(guild, caseData) {
        const config = this.muteConfig.guildMuteConfigs[guild.id] || {};
        const logChannelId = config.logChannelId;
        
        if (!logChannelId) return null;
        
        try {
            const logChannel = await guild.channels.fetch(logChannelId);
            if (!logChannel) return null;
            
            const actionColors = {
                ban: Colors.Red,
                unban: Colors.Green,
                kick: Colors.Orange,
                mute: Colors.Yellow,
                unmute: Colors.Green,
                timeout: Colors.Purple,
                untimeout: Colors.Green,
                warn: Colors.Orange,
                softban: Colors.Red
            };
            
            const actionEmojis = {
                ban: '',
                unban: '',
                kick: '',
                mute: '',
                unmute: '',
                timeout: '',
                untimeout: '',
                warn: '',
                softban: ''
            };
            
            const logEmbed = new EmbedBuilder()
                .setColor(actionColors[caseData.type] || Colors.Grey)
                .setTitle(`${actionEmojis[caseData.type]} ${caseData.type.toUpperCase()} - Case ${caseData.caseNumber}`)
                .addFields(
                    { name: 'Target', value: `${caseData.targetTag} (${caseData.targetId})`, inline: true },
                    { name: 'Moderator', value: `${caseData.moderatorTag} (${caseData.moderatorId})`, inline: true },
                    { name: 'Reason', value: caseData.reason || 'No reason provided', inline: false }
                )
                .setTimestamp();
            
            if (caseData.duration) {
                logEmbed.addFields({ name: 'Duration', value: caseData.duration, inline: true });
            }
            
            if (caseData.evidence && caseData.evidence.length > 0) {
                logEmbed.addFields({ name: 'Evidence', value: caseData.evidence.join('\n'), inline: false });
            }
            
            await logChannel.send({ embeds: [logEmbed] });
            return logChannel;
        } catch (error) {
            console.error('Failed to log to moderation channel:', error);
            return null;
        }
    }

    parseDuration(durationStr) {
        const regex = /^(\d+)([smhdw])$/i;
        const match = durationStr.match(regex);
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        const multipliers = {
            s: 1000,
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
            w: 7 * 24 * 60 * 60 * 1000
        };
        
        return value * multipliers[unit];
    }

    formatDuration(ms) {
        if (!ms) return 'Permanent';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        
        const parts = [];
        if (weeks > 0) parts.push(`${weeks}w`);
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 && parts.length === 0) parts.push(`${seconds}s`);
        
        return parts.join(' ');
    }

    async ban(moderator, target, options = {}) {
        const { reason = 'No reason provided', duration = null, evidence = [], deleteMessages = '1d' } = options;
        
        if (!this.hasPermission(moderator, PermissionFlagsBits.BanMembers)) {
            return { success: false, error: 'Missing Ban Members permission' };
        }
        
        const hierarchyCheck = this.checkHierarchy(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }
        
        try {
            await target.ban({ reason, deleteMessageSeconds: this.parseDuration(deleteMessages) || 0 });
            
            const durationStr = duration ? this.formatDuration(duration) : 'Permanent';
            const caseData = this.createCase(moderator, target, 'ban', reason, {
                duration: durationStr,
                evidence,
                additionalInfo: { deleteMessages }
            });
            
            await this.logToChannel(target.guild, caseData);
            await this.notifyUser(target.user, target.guild, 'Ban', 
                `You have been banned from ${target.guild.name}\nReason: ${reason}\nDuration: ${durationStr}`);
            
            return { success: true, caseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async unban(moderator, guild, userId, reason = 'Appeal granted') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.BanMembers)) {
            return { success: false, error: 'Missing Ban Members permission' };
        }
        
        try {
            const bannedUser = await guild.bans.fetch(userId);
            if (!bannedUser) {
                return { success: false, error: 'User is not banned' };
            }
            
            await guild.members.unban(userId, reason);
            
            const caseData = this.createCase(moderator, { id: userId, tag: `${userId}` }, 'unban', reason, {
                guildId: guild.id,
                additionalInfo: { originalBan: bannedUser.reason }
            });
            
            await this.logToChannel(guild, caseData);
            
            return { success: true, caseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async kick(moderator, target, options = {}) {
        const { reason = 'No reason provided', evidence = [] } = options;
        
        if (!this.hasPermission(moderator, PermissionFlagsBits.KickMembers)) {
            return { success: false, error: 'Missing Kick Members permission' };
        }
        
        const hierarchyCheck = this.checkHierarchy(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }
        
        try {
            await target.kick(reason);
            
            const caseData = this.createCase(moderator, target, 'kick', reason, { evidence });
            await this.logToChannel(target.guild, caseData);
            await this.notifyUser(target.user, target.guild, 'Kick', 
                `You have been kicked from ${target.guild.name}\nReason: ${reason}`);
            
            return { success: true, caseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async mute(moderator, target, options = {}) {
        const { reason = 'No reason provided', duration = null, evidence = [] } = options;
        
        if (!this.hasPermission(moderator, PermissionFlagsBits.ModerateMembers)) {
            return { success: false, error: 'Missing Moderate Members permission' };
        }
        
        const hierarchyCheck = this.checkHierarchy(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }
        
        try {
            const durationMs = duration ? this.parseDuration(duration) : null;
            
            if (durationMs && durationMs > 28 * 24 * 60 * 60 * 1000) {
                return { success: false, error: 'Duration cannot exceed 28 days' };
            }
            
            await target.timeout(durationMs, reason);
            
            const durationStr = duration ? this.formatDuration(durationMs) : 'Indefinite';
            const caseData = this.createCase(moderator, target, 'mute', reason, {
                duration: durationStr,
                evidence,
                additionalInfo: { durationMs }
            });
            
            if (durationMs) {
                setTimeout(async () => {
                    try {
                        if (target.isCommunicationDisabled()) {
                            await target.timeout(null, 'Mute duration expired');
                        }
                    } catch (error) {
                        console.error('Auto-unmute failed:', error);
                    }
                }, durationMs);
            }
            
            await this.logToChannel(target.guild, caseData);
            await this.notifyUser(target.user, target.guild, 'Mute', 
                `You have been muted in ${target.guild.name}\nReason: ${reason}\nDuration: ${durationStr}`);
            
            return { success: true, caseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async unmute(moderator, target, reason = 'Manual unmute') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ModerateMembers)) {
            return { success: false, error: 'Missing Moderate Members permission' };
        }
        
        try {
            if (!target.isCommunicationDisabled()) {
                return { success: false, error: 'User is not muted' };
            }
            
            await target.timeout(null, reason);
            
            const caseData = this.createCase(moderator, target, 'unmute', reason);
            await this.logToChannel(target.guild, caseData);
            await this.notifyUser(target.user, target.guild, 'Unmute', 
                `Your mute in ${target.guild.name} has been removed`);
            
            return { success: true, caseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async timeout(moderator, target, duration, reason = 'No reason provided') {
        const durationMs = this.parseDuration(duration);
        
        if (!durationMs) {
            return { success: false, error: 'Invalid duration format. Use: 1s, 1m, 1h, 1d, 1w' };
        }
        
        if (durationMs > 28 * 24 * 60 * 60 * 1000) {
            return { success: false, error: 'Timeout cannot exceed 28 days' };
        }
        
        if (!this.hasPermission(moderator, PermissionFlagsBits.ModerateMembers)) {
            return { success: false, error: 'Missing Moderate Members permission' };
        }
        
        const hierarchyCheck = this.checkHierarchy(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }
        
        try {
            await target.timeout(durationMs, reason);
            
            const durationStr = this.formatDuration(durationMs);
            const caseData = this.createCase(moderator, target, 'timeout', reason, {
                duration: durationStr,
                additionalInfo: { durationMs, expiresAt: Date.now() + durationMs }
            });
            
            setTimeout(async () => {
                try {
                    if (target.isCommunicationDisabled()) {
                        await target.timeout(null, 'Timeout expired');
                    }
                } catch (error) {
                    console.error('Auto-untimeout failed:', error);
                }
            }, durationMs);
            
            await this.logToChannel(target.guild, caseData);
            await this.notifyUser(target.user, target.guild, 'Timeout', 
                `You have been timed out in ${target.guild.name}\nReason: ${reason}\nDuration: ${durationStr}`);
            
            return { success: true, caseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async untimeout(moderator, target, reason = 'Timeout removed') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.ModerateMembers)) {
            return { success: false, error: 'Missing Moderate Members permission' };
        }
        
        try {
            if (!target.isCommunicationDisabled()) {
                return { success: false, error: 'User is not timed out' };
            }
            
            await target.timeout(null, reason);
            
            const caseData = this.createCase(moderator, target, 'untimeout', reason);
            await this.logToChannel(target.guild, caseData);
            await this.notifyUser(target.user, target.guild, 'Timeout Removed', 
                `Your timeout in ${target.guild.name} has been removed`);
            
            return { success: true, caseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async warn(moderator, target, reason = 'No reason provided', evidence = []) {
        const hierarchyCheck = this.checkHierarchy(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }
        
        const guildId = target.guild.id;
        const userId = target.id;
        
        const caseData = this.createCase(moderator, target, 'warn', reason, {
            evidence,
            additionalInfo: { warnNumber: this.getWarningCount(guildId, userId) + 1 }
        });
        
        const warnCount = this.getWarningCount(guildId, userId);
        const autoActionResult = await this.checkAutoEscalation(target.guild, target, warnCount);
        
        await this.logToChannel(target.guild, caseData);
        await this.notifyUser(target.user, target.guild, 'Warning', 
            `You have received a warning in ${target.guild.name}\nReason: ${reason}\nTotal warnings: ${warnCount}`);
        
        return { success: true, caseData, warnCount, autoAction: autoActionResult };
    }

    getWarningCount(guildId, userId) {
        const userCases = this.moderationData.userCases[userId] || [];
        return userCases.filter(cn => {
            const caseItem = this.moderationData.cases.find(c => c.caseNumber === cn);
            return caseItem && caseItem.type === 'warn' && !caseItem.undone;
        }).length;
    }

    async checkAutoEscalation(guild, member, warnCount) {
        const config = this.muteConfig.guildMuteConfigs[guild.id] || {};
        const escalationRules = config.escalationRules || [];
        
        for (const rule of escalationRules) {
            if (warnCount >= rule.threshold) {
                const action = rule.action;
                const duration = rule.duration;
                
                switch (action) {
                    case 'mute':
                        await this.mute(guild.members.me, member, { 
                            reason: `Auto-escalation: ${warnCount} warnings`, 
                            duration 
                        });
                        return { executed: true, action: 'mute', duration };
                    case 'kick':
                        await this.kick(guild.members.me, member, 
                            `Auto-escalation: ${warnCount} warnings`);
                        return { executed: true, action: 'kick' };
                    case 'ban':
                        await this.ban(guild.members.me, member, 
                            `Auto-escalation: ${warnCount} warnings`);
                        return { executed: true, action: 'ban' };
                    case 'timeout':
                        await this.timeout(guild.members.me, member, duration,
                            `Auto-escalation: ${warnCount} warnings`);
                        return { executed: true, action: 'timeout', duration };
                }
            }
        }
        
        return { executed: false };
    }

    getWarnings(guildId, userId) {
        const userCases = this.moderationData.userCases[userId] || [];
        return userCases
            .map(cn => this.moderationData.cases.find(c => c.caseNumber === cn))
            .filter(c => c && c.type === 'warn' && !c.undone && c.guildId === guildId)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    async softban(moderator, target, reason = 'Softban - message cleanup', deleteDays = 7) {
        if (!this.hasPermission(moderator, PermissionFlagsBits.BanMembers)) {
            return { success: false, error: 'Missing Ban Members permission' };
        }
        
        const hierarchyCheck = this.checkHierarchy(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }
        
        try {
            const banOptions = { 
                reason, 
                deleteMessageSeconds: deleteDays * 24 * 60 * 60 
            };
            
            await target.ban(banOptions);
            await target.guild.members.unban(target.id, 'Softban - user returned');
            
            const caseData = this.createCase(moderator, target, 'softban', reason, {
                additionalInfo: { deleteDays, reason }
            });
            
            await this.logToChannel(target.guild, caseData);
            await this.notifyUser(target.user, target.guild, 'Softban', 
                `You have been softbanned from ${target.guild.name}\nReason: ${reason}\nNote: You may rejoin immediately`);
            
            return { success: true, caseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async undo(moderator, caseNumber, reason = 'Reversed') {
        const caseData = this.moderationData.cases.find(c => c.caseNumber === caseNumber);
        
        if (!caseData) {
            return { success: false, error: 'Case not found' };
        }
        
        if (caseData.undone) {
            return { success: false, error: 'Case already undone' };
        }
        
        if (caseData.moderatorId !== moderator.id && 
            !moderator.permissions.has(PermissionFlagsBits.Administrator)) {
            return { success: false, error: 'Only the original moderator or admin can undo' };
        }
        
        try {
            caseData.undone = true;
            caseData.undoReason = reason;
            caseData.undoneBy = moderator.id;
            caseData.undoneAt = Date.now();
            
            const guild = await moderator.client.guilds.fetch(caseData.guildId);
            if (!guild) {
                return { success: false, error: 'Guild not found' };
            }
            
            switch (caseData.type) {
                case 'ban':
                    try {
                        await guild.members.unban(caseData.targetId, `Undo: ${reason}`);
                    } catch (e) {
                        console.error('Undo ban failed:', e);
                    }
                    break;
                case 'mute':
                case 'timeout':
                    try {
                        const member = await guild.members.fetch(caseData.targetId);
                        if (member) {
                            await member.timeout(null, `Undo: ${reason}`);
                        }
                    } catch (e) {
                        console.error('Undo mute/timeout failed:', e);
                    }
                    break;
            }
            
            this.saveModerationData();
            
            const undoCaseData = this.createCase(moderator, { 
                id: moderator.id, 
                tag: moderator.user.tag 
            }, 'undo', reason, {
                guildId: guild.id,
                additionalInfo: { originalCase: caseNumber }
            });
            
            await this.logToChannel(guild, undoCaseData);
            
            return { success: true, originalCase: caseData, undoCase: undoCaseData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getCase(caseNumber) {
        return this.moderationData.cases.find(c => c.caseNumber === caseNumber);
    }

    searchCases(guildId, options = {}) {
        const { 
            userId, 
            type, 
            moderatorId, 
            startDate, 
            endDate, 
            limit = 50 
        } = options;
        
        let results = this.moderationData.cases.filter(c => c.guildId === guildId && !c.undone);
        
        if (userId) {
            results = results.filter(c => c.targetId === userId);
        }
        
        if (type) {
            results = results.filter(c => c.type === type);
        }
        
        if (moderatorId) {
            results = results.filter(c => c.moderatorId === moderatorId);
        }
        
        if (startDate) {
            results = results.filter(c => c.timestamp >= startDate);
        }
        
        if (endDate) {
            results = results.filter(c => c.timestamp <= endDate);
        }
        
        return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }

    setLogChannel(guildId, channelId) {
        if (!this.muteConfig.guildMuteConfigs[guildId]) {
            this.muteConfig.guildMuteConfigs[guildId] = {};
        }
        this.muteConfig.guildMuteConfigs[guildId].logChannelId = channelId;
        this.saveMuteConfig();
        return true;
    }

    getLogChannel(guildId) {
        return this.muteConfig.guildMuteConfigs[guildId]?.logChannelId;
    }

    setModRole(guildId, roleId) {
        if (!this.muteConfig.guildMuteConfigs[guildId]) {
            this.muteConfig.guildMuteConfigs[guildId] = {};
        }
        this.muteConfig.guildMuteConfigs[guildId].modRoleId = roleId;
        this.saveMuteConfig();
        return true;
    }

    addEscalationRule(guildId, rule) {
        if (!this.muteConfig.guildMuteConfigs[guildId]) {
            this.muteConfig.guildMuteConfigs[guildId] = {};
        }
        if (!this.muteConfig.guildMuteConfigs[guildId].escalationRules) {
            this.muteConfig.guildMuteConfigs[guildId].escalationRules = [];
        }
        rule.id = Date.now().toString();
        this.muteConfig.guildMuteConfigs[guildId].escalationRules.push(rule);
        this.saveMuteConfig();
        return rule;
    }

    getEscalationRules(guildId) {
        return this.muteConfig.guildMuteConfigs[guildId]?.escalationRules || [];
    }

    removeEscalationRule(guildId, ruleId) {
        const config = this.muteConfig.guildMuteConfigs[guildId];
        if (!config?.escalationRules) return false;
        
        const index = config.escalationRules.findIndex(r => r.id === ruleId);
        if (index === -1) return false;
        
        config.escalationRules.splice(index, 1);
        this.saveMuteConfig();
        return true;
    }

    getModerationStats(guildId) {
        const guildCases = this.moderationData.cases.filter(c => c.guildId === guildId && !c.undone);
        
        const stats = {
            total: guildCases.length,
            byType: {},
            byModerator: {},
            recent: guildCases.slice(-10)
        };
        
        for (const caseData of guildCases) {
            stats.byType[caseData.type] = (stats.byType[caseData.type] || 0) + 1;
            stats.byModerator[caseData.moderatorId] = (stats.byModerator[caseData.moderatorId] || 0) + 1;
        }
        
        return stats;
    }
}

export const moderationSystem = new ModerationSystem();
