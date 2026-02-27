import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { securityManager } from './securityManager.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const ANTISPAM_FILE = path.join(DATA_DIR, 'antispam.json');
const VIOLATIONS_DIR = path.join(DATA_DIR, 'violations');

class AntiSpamSystem {
    constructor() {
        this.messageHistory = new Map();
        this.userCooldowns = new Map();
        this.joinMonitor = {
            joins: [],
            lastMinute: 0,
            isRaidMode: false,
            lockdownChannels: new Set()
        };
        this.strikes = new Map();
        this.loadConfiguration();
        this.loadPersistedData();
        this.startCleanupInterval();
        this.startJoinMonitorInterval();
    }

    loadConfiguration() {
        this.config = {
            antispam: {
                enabled: true,
                messagesPerSecond: 3,
                messagesPerMinute: 20,
                cooldownMs: 1000,
                duplicateThreshold: 3,
                duplicateWindowMs: 5000,
                mentionThreshold: 5,
                linkThreshold: 3,
                emojiThreshold: 8,
                strikeThreshold: 5,
                strikeDecayMinutes: 60,
                autoStrikeIncrease: true,
                ignoredChannels: [],
                ignoredRoles: [],
                ignoredUsers: [],
                bypassAdmin: true
            },
            antiraid: {
                enabled: true,
                joinsPerMinute: 10,
                newAccountDays: 7,
                raidModeActivationThreshold: 15,
                autoLockdownThreshold: 25,
                lockdownDurationMinutes: 30,
                suspiciousPatterns: {
                    names: [
                        /^[a-z]{1,3}\d{3,}$/i,
                        /^[a-z]{5,}\d{5,}$/i,
                        /^(giveaway|winner|prize|nitro|free|gift)\d*$/i,
                        /^\w{1,3}\w*\d{5,}$/i
                    ],
                    avatars: {
                        defaultOnly: true,
                        recentlyChanged: true
                    }
                },
                raidRoles: ['raid', 'locked'],
                alertWebhookUrl: null,
                modChannelId: null,
                graduatedResponse: {
                    level1: { joinsPerMinute: 10, action: 'verify' },
                    level2: { joinsPerMinute: 15, action: 'captcha' },
                    level3: { joinsPerMinute: 20, action: 'lockdown' },
                    level4: { joinsPerMinute: 25, action: 'ban' }
                }
            },
            actions: {
                warn: { dmUser: true, deleteMessage: true },
                mute: { durationMinutes: 30, deleteMessage: true },
                kick: { deleteMessage: true },
                ban: { deleteMessage: true, durationDays: 1 },
                lockdown: { channelIds: [], durationMinutes: 30 },
                verify: { roleId: null }
            }
        };

        this.loadConfigFromFile();
    }

    loadConfigFromFile() {
        const configFile = path.join(DATA_DIR, 'antispam-config.json');
        if (fs.existsSync(configFile)) {
            try {
                const fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                this.config = { ...this.config, ...fileConfig };
                console.log('ℹ️ Anti-spam configuration loaded from file');
            } catch (error) {
                console.error('❌ Failed to load antispam config', error);
            }
        }
    }

    saveConfigToFile() {
        const configFile = path.join(DATA_DIR, 'antispam-config.json');
        try {
            fs.writeFileSync(configFile, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('❌ Failed to save antispam config', error);
        }
    }

    loadPersistedData() {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(VIOLATIONS_DIR)) fs.mkdirSync(VIOLATIONS_DIR, { recursive: true });

        if (fs.existsSync(ANTISPAM_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(ANTISPAM_FILE, 'utf8'));
                this.joinMonitor.joins = data.joins || [];
                this.joinMonitor.isRaidMode = data.isRaidMode || false;
                this.joinMonitor.lockdownChannels = new Set(data.lockdownChannels || []);
                this.strikes = new Map(Object.entries(data.strikes || {}));
            } catch (error) {
                console.error('❌ Failed to load antispam data', error);
            }
        }
    }

    savePersistedData() {
        try {
            const data = {
                joins: this.joinMonitor.joins,
                isRaidMode: this.joinMonitor.isRaidMode,
                lockdownChannels: Array.from(this.joinMonitor.lockdownChannels),
                strikes: Object.fromEntries(this.strikes)
            };
            fs.writeFileSync(ANTISPAM_FILE, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('❌ Failed to save antispam data', error);
        }
    }

    startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            for (const [userId, messages] of this.messageHistory) {
                const recentMessages = messages.filter(m => now - m.timestamp < 60000);
                if (recentMessages.length === 0) {
                    this.messageHistory.delete(userId);
                } else {
                    this.messageHistory.set(userId, recentMessages);
                }
            }
            for (const [userId, data] of this.userCooldowns) {
                if (now - data.lastMessage > 300000) {
                    this.userCooldowns.delete(userId);
                }
            }
            this.decayStrikes();
            this.cleanJoinHistory();
            this.savePersistedData();
        }, 60000);
    }

    startJoinMonitorInterval() {
        setInterval(() => {
            this.cleanJoinHistory();
        }, 30000);
    }

    cleanJoinHistory() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        this.joinMonitor.joins = this.joinMonitor.joins.filter(j => j.timestamp > oneMinuteAgo);
    }

    decayStrikes() {
        const decayTime = this.config.antispam.strikeDecayMinutes * 60 * 1000;
        const now = Date.now();
        for (const [userId, strikeData] of this.strikes) {
            if (now - strikeData.lastUpdate > decayTime && strikeData.count > 0) {
                strikeData.count = Math.max(0, strikeData.count - 1);
                strikeData.lastUpdate = now;
            }
        }
    }

    shouldIgnoreUser(user) {
        if (!user) return true;
        if (user.bot) return true;
        if (this.config.antispam.bypassAdmin && securityManager.isAdmin(user.id)) return true;
        if (this.config.antispam.ignoredUsers.includes(user.id)) return true;
        if (user.roles) {
            for (const role of user.roles.cache.values()) {
                if (this.config.antispam.ignoredRoles.includes(role.id)) return true;
            }
        }
        return false;
    }

    shouldIgnoreChannel(channel) {
        if (!channel) return true;
        if (this.config.antispam.ignoredChannels.includes(channel.id)) return true;
        return false;
    }

    async handleMessageCreate(message) {
        if (!this.config.antispam.enabled) return null;
        if (this.shouldIgnoreUser(message.member)) return null;
        if (this.shouldIgnoreChannel(message.channel)) return null;

        const userId = message.author.id;
        const now = Date.now();
        const violations = [];
        const strikeReasons = [];

        if (!this.messageHistory.has(userId)) {
            this.messageHistory.set(userId, []);
        }
        const userMessages = this.messageHistory.get(userId);

        const rateLimitCheck = this.checkRateLimit(userId, userMessages, now);
        if (rateLimitCheck.violation) {
            violations.push({ type: 'rate_limit', severity: 'medium', ...rateLimitCheck });
            strikeReasons.push(`Rate limit exceeded: ${rateLimitCheck.count}/${rateLimitCheck.limit} messages`);
        }

        const duplicateCheck = this.checkDuplicateMessages(message, userMessages);
        if (duplicateCheck.violation) {
            violations.push({ type: 'duplicate', severity: 'low', ...duplicateCheck });
            strikeReasons.push(`Duplicate message detected (${duplicateCheck.count} times)`);
        }

        const mentionCheck = this.checkMentionSpam(message);
        if (mentionCheck.violation) {
            violations.push({ type: 'mention_spam', severity: 'high', ...mentionCheck });
            strikeReasons.push(`Mention spam: ${mentionCheck.count} mentions`);
        }

        const linkCheck = this.checkLinkSpam(message);
        if (linkCheck.violation) {
            violations.push({ type: 'link_spam', severity: 'medium', ...linkCheck });
            strikeReasons.push(`Link spam: ${linkCheck.count} links`);
        }

        const emojiCheck = this.checkEmojiSpam(message);
        if (emojiCheck.violation) {
            violations.push({ type: 'emoji_spam', severity: 'medium', ...emojiCheck });
            strikeReasons.push(`Emoji spam: ${emojiCheck.count} emojis`);
        }

        userMessages.push({ content: message.content, timestamp: now, violations });
        if (userMessages.length > 100) userMessages.shift();

        if (violations.length > 0) {
            const totalStrikes = this.addStrike(userId, violations.length, strikeReasons.join('; '));
            const action = await this.takeAction(message, violations, totalStrikes);
            await this.logViolation(message, violations, action);
            return { violations, action, totalStrikes };
        }

        return null;
    }

    checkRateLimit(userId, messages, now) {
        const recentMessages = messages.filter(m => now - m.timestamp < 1000);
        const limit = this.config.antispam.messagesPerSecond;
        if (recentMessages.length >= limit) {
            return { violation: true, count: recentMessages.length, limit, window: '1 second' };
        }

        const minuteMessages = messages.filter(m => now - m.timestamp < 60000);
        const minuteLimit = this.config.antispam.messagesPerMinute;
        if (minuteMessages.length >= minuteLimit) {
            return { violation: true, count: minuteMessages.length, limit: minuteLimit, window: '1 minute' };
        }

        const cooldownData = this.userCooldowns.get(userId) || { lastMessage: 0 };
        if (now - cooldownData.lastMessage < this.config.antispam.cooldownMs) {
            cooldownData.violations = (cooldownData.violations || 0) + 1;
            this.userCooldowns.set(userId, cooldownData);
            if (cooldownData.violations >= 3) {
                this.userCooldowns.set(userId, { lastMessage: now, violations: 0 });
                return { violation: true, count: cooldownData.violations, limit: 1, window: 'cooldown' };
            }
        }
        this.userCooldowns.set(userId, { lastMessage: now, violations: 0 });

        return { violation: false };
    }

    checkDuplicateMessages(message, messages) {
        const recentMessages = messages.filter(m => 
            message.content.toLowerCase() === m.content.toLowerCase() &&
            Date.now() - m.timestamp < this.config.antispam.duplicateWindowMs
        );
        if (recentMessages.length >= this.config.antispam.duplicateThreshold) {
            return { violation: true, count: recentMessages.length + 1, content: message.content.substring(0, 100) };
        }
        return { violation: false };
    }

    checkMentionSpam(message) {
        const mentions = message.mentions.users.size + message.mentions.roles.size + message.mentions.everyone ? 1 : 0;
        if (mentions >= this.config.antispam.mentionThreshold) {
            return { violation: true, count: mentions, threshold: this.config.antispam.mentionThreshold };
        }
        return { violation: false };
    }

    checkLinkSpam(message) {
        const linkPattern = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+\.[^\s]+)/gi;
        const links = message.content.match(linkPattern) || [];
        if (links.length >= this.config.antispam.linkThreshold) {
            return { violation: true, count: links.length, links: links.slice(0, 5) };
        }
        return { violation: false };
    }

    checkEmojiSpam(message) {
        const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}]/gu;
        const emojis = message.content.match(emojiPattern) || [];
        if (emojis.length >= this.config.antispam.emojiThreshold) {
            return { violation: true, count: emojis.length };
        }
        return { violation: false };
    }

    addStrike(userId, amount, reason) {
        const current = this.strikes.get(userId) || { count: 0, reasons: [], lastUpdate: Date.now() };
        current.count += amount;
        current.reasons.push({ reason, timestamp: Date.now() });
        if (current.reasons.length > 20) current.reasons.shift();
        current.lastUpdate = Date.now();
        this.strikes.set(userId, current);
        return current.count;
    }

    getStrikes(userId) {
        return this.strikes.get(userId) || { count: 0, reasons: [] };
    }

    resetStrikes(userId) {
        this.strikes.delete(userId);
    }

    async takeAction(message, violations, totalStrikes) {
        const highestSeverity = violations.reduce((max, v) => {
            const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
            return severityOrder[v.severity] > severityOrder[max] ? v.severity : max;
        }, 'low');

        if (totalStrikes >= this.config.antispam.strikeThreshold * 2) {
            try {
                await message.member.kick(`Auto-mod: Excessive spam violations (${totalStrikes} strikes)`);
                return { type: 'kick', reason: 'Spam threshold exceeded' };
            } catch (error) {
                console.error('❌ Failed to kick spammer', error);
            }
        } else if (totalStrikes >= this.config.antispam.strikeThreshold) {
            try {
                const durationMs = 30 * 60 * 1000;
                await message.member.timeout(durationMs, `Auto-mod: Spam violations (${totalStrikes} strikes)`);
                return { type: 'mute', duration: 30, reason: 'Spam threshold reached' };
            } catch (error) {
                console.error('❌ Failed to timeout user', error);
            }
        } else if (highestSeverity === 'high' || totalStrikes >= this.config.antispam.strikeThreshold * 0.6) {
            try {
                await message.delete();
                const dmEmbed = {
                    color: 0xFFAA00,
                    title: '⚠️ Spam Warning',
                    description: `Your message in **${message.guild.name}** was removed for spamming.\n\n**Violations:** ${violations.map(v => v.type).join(', ')}\n**Strikes:** ${totalStrikes}/${this.config.antispam.strikeThreshold}\n\nRepeated violations will result in timeout or ban.`
                };
                await message.author.send({ embeds: [dmEmbed] }).catch(() => {});
                return { type: 'warn', reason: 'High severity violation' };
            } catch (error) {
                console.error('❌ Failed to warn user', error);
            }
        }

        try {
            await message.delete();
            return { type: 'delete', reason: 'Spam detected' };
        } catch (error) {
            console.error('❌ Failed to delete spam message', error);
        }

        return { type: 'none' };
    }

    async logViolation(message, violations, action) {
        try {
            const logEntry = {
                id: `${message.guildId}-${message.id}-${Date.now()}`,
                userId: message.author.id,
                username: message.author.tag,
                guildId: message.guildId,
                channelId: message.channel.id,
                violations: violations.map(v => ({ type: v.type, severity: v.severity })),
                action: action.type,
                reason: action.reason,
                timestamp: new Date().toISOString(),
                messageContent: message.content.substring(0, 500)
            };

            const logFile = path.join(VIOLATIONS_DIR, `${message.guildId}.json`);
            let logs = [];
            if (fs.existsSync(logFile)) {
                try { logs = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}
            }
            logs.push(logEntry);
            if (logs.length > 1000) logs = logs.slice(-500);
            fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

            if (violations.some(v => v.severity === 'high' || v.severity === 'critical')) {
                await this.sendRaidAlert(logEntry);
            }
        } catch (error) {
            console.error('❌ Failed to log violation', error);
        }
    }

    async handleGuildMemberAdd(member) {
        if (!this.config.antiraid.enabled) return null;
        if (member.user.bot) return null;

        const now = Date.now();
        this.joinMonitor.joins.push({
            userId: member.id,
            timestamp: now,
            accountAge: Date.now() - member.user.createdTimestamp
        });

        const recentJoins = this.joinMonitor.joins.filter(j => now - j.timestamp < 60000);
        const joinsPerMinute = recentJoins.length;

        const checks = [];
        let raidLevel = 0;

        if (joinsPerMinute >= this.config.antiraid.joinsPerMinute) {
            raidLevel = 1;
            checks.push({ type: 'join_rate', severity: 'medium', joins: joinsPerMinute, threshold: this.config.antiraid.joinsPerMinute });
        }

        const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < this.config.antiraid.newAccountDays) {
            checks.push({ type: 'new_account', severity: 'low', accountAge: accountAgeDays.toFixed(1) });
            if (raidLevel === 0 && joinsPerMinute >= this.config.antiraid.joinsPerMinute * 0.7) {
                raidLevel = 1;
            }
        }

        const nameCheck = this.checkSuspiciousName(member.user.username);
        if (nameCheck.violation) {
            checks.push({ type: 'suspicious_name', severity: 'medium', pattern: nameCheck.pattern });
            if (raidLevel === 0) raidLevel = 1;
        }

        if (this.config.antiraid.suspiciousPatterns.avatars.defaultOnly) {
            if (member.user.avatar === null || member.user.avatar.startsWith('a_')) {
                checks.push({ type: 'default_avatar', severity: 'low' });
            }
        }

        const graduatedResponse = this.config.antiraid.graduatedResponse;
        if (joinsPerMinute >= graduatedResponse.level4.joinsPerMinute) {
            raidLevel = 4;
        } else if (joinsPerMinute >= graduatedResponse.level3.joinsPerMinute) {
            raidLevel = 3;
        } else if (joinsPerMinute >= graduatedResponse.level2.joinsPerMinute) {
            raidLevel = 2;
        }

        if (!this.joinMonitor.isRaidMode && raidLevel >= 3) {
            await this.activateRaidMode(member.guild, raidLevel);
        }

        if (raidLevel > 0) {
            const action = await this.handleRaidResponse(member, raidLevel, checks);
            await this.logRaidEvent(member, checks, action);
            return { checks, action, raidLevel, joinsPerMinute };
        }

        return null;
    }

    checkSuspiciousName(username) {
        const patterns = this.config.antiraid.suspiciousPatterns.names;
        for (const pattern of patterns) {
            if (pattern.test(username)) {
                return { violation: true, pattern: pattern.toString() };
            }
        }
        return { violation: false };
    }

    async activateRaidMode(guild, level) {
        this.joinMonitor.isRaidMode = true;
        console.log(`⚠️ RAID MODE ACTIVATED on ${guild.name} (Level ${level})`);

        try {
            const modChannelId = this.config.antiraid.modChannelId;
            if (modChannelId) {
                const modChannel = await guild.channels.fetch(modChannelId).catch(() => null);
                if (modChannel) {
                    const embed = {
                        color: 0xFF0000,
                        title: '🚨 RAID MODE ACTIVATED',
                        description: `**Level:** ${level}\n**Time:** ${new Date().toISOString()}\n**Joins/min:** ${this.joinMonitor.joins.filter(j => Date.now() - j.timestamp < 60000).length}`,
                        fields: [
                            { name: 'Status', value: 'Anti-spam system now in heightened alert', inline: true },
                            { name: 'Duration', value: `Auto-disable after ${this.config.antiraid.lockdownDurationMinutes} minutes`, inline: true }
                        ]
                    };
                    await modChannel.send({ embeds: [embed] });
                }
            }

            if (this.config.antiraid.alertWebhookUrl) {
                await this.sendWebhookAlert({ type: 'raid_mode', level, guild: guild.name, timestamp: new Date().toISOString() });
            }

            if (level >= 3) {
                await this.activateLockdown(guild);
            }

            setTimeout(() => {
                this.deactivateRaidMode(guild);
            }, this.config.antiraid.lockdownDurationMinutes * 60 * 1000);

        } catch (error) {
            console.error('❌ Failed to activate raid mode', error);
        }
    }

    async deactivateRaidMode(guild) {
        this.joinMonitor.isRaidMode = false;
        this.joinMonitor.lockdownChannels.clear();
        console.log(`ℹ️ RAID MODE DEACTIVATED on ${guild.name}`);

        try {
            const modChannelId = this.config.antiraid.modChannelId;
            if (modChannelId) {
                const modChannel = await guild.channels.fetch(modChannelId).catch(() => null);
                if (modChannel) {
                    const embed = {
                        color: 0x00FF88,
                        title: '✅ RAID MODE DEACTIVATED',
                        description: `The raid threat has passed on **${guild.name}**.\n**Time:** ${new Date().toISOString()}`
                    };
                    await modChannel.send({ embeds: [embed] });
                }
            }
        } catch (error) {
            console.error('❌ Failed to send raid mode deactivation', error);
        }
    }

    async activateLockdown(guild) {
        try {
            const channels = guild.channels.cache.filter(c => c.type === 0);
            for (const [id, channel] of channels) {
                try {
                    const existingOverwrites = channel.permissionOverwrites.cache;
                    const everyoneRole = guild.roles.everyone;
                    if (existingOverwrites.get(everyoneRole.id)?.deny.has('SendMessages')) continue;

                    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
                    this.joinMonitor.lockdownChannels.add(id);
                } catch (error) {
                    console.warn(`⚠️ Failed to lockdown channel ${channel.name}`, error);
                }
            }
            console.log(`🔒 Lockdown activated on ${guild.name}`);
        } catch (error) {
            console.error('❌ Failed to activate lockdown', error);
        }
    }

    async deactivateLockdown(guild) {
        try {
            for (const channelId of this.joinMonitor.lockdownChannels) {
                const channel = await guild.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    try {
                        const everyoneRole = guild.roles.everyone;
                        await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
                    } catch (error) {}
                }
            }
            this.joinMonitor.lockdownChannels.clear();
            console.log(`🔓 Lockdown deactivated on ${guild.name}`);
        } catch (error) {
            console.error('❌ Failed to deactivate lockdown', error);
        }
    }

    async handleRaidResponse(member, level, checks) {
        const responseActions = this.config.antiraid.graduatedResponse;
        const action = responseActions[`level${level}`] || responseActions.level1;

        try {
            switch (action.action) {
                case 'verify':
                    if (this.config.actions.verify.roleId) {
                        const verifyRole = member.guild.roles.cache.get(this.config.actions.verify.roleId);
                        if (verifyRole) {
                            await member.roles.add(verifyRole).catch(() => {});
                        }
                    }
                    return { type: 'verify', action: 'Added verification role' };

                case 'captcha':
                    const verifyRole = member.guild.roles.cache.get(this.config.actions.verify.roleId);
                    if (verifyRole && !member.roles.cache.has(verifyRole.id)) {
                        await member.roles.add(verifyRole).catch(() => {});
                    }
                    return { type: 'captcha', action: 'Require verification' };

                case 'lockdown':
                    await this.activateLockdown(member.guild);
                    return { type: 'lockdown', action: 'Server lockdown activated' };

                case 'ban':
                    await member.ban({ reason: `Auto-mod: Raid protection (Level ${level})` }).catch(() => {});
                    return { type: 'ban', action: 'User banned for raid protection' };

                default:
                    return { type: 'none' };
            }
        } catch (error) {
            console.error('❌ Failed to handle raid response', error);
            return { type: 'error', action: error.message };
        }
    }

    async logRaidEvent(member, checks, action) {
        try {
            const logEntry = {
                id: `raid-${member.id}-${Date.now()}`,
                userId: member.id,
                username: member.user.tag,
                guildId: member.guild.id,
                checks: checks.map(c => ({ type: c.type, severity: c.severity })),
                action: action.type,
                timestamp: new Date().toISOString(),
                accountAge: Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24))
            };

            const logFile = path.join(VIOLATIONS_DIR, `raid-${member.guild.id}.json`);
            let logs = [];
            if (fs.existsSync(logFile)) {
                try { logs = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}
            }
            logs.push(logEntry);
            if (logs.length > 500) logs = logs.slice(-250);
            fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
        } catch (error) {
            console.error('❌ Failed to log raid event', error);
        }
    }

    async sendRaidAlert(logEntry) {
        try {
            const modChannelId = this.config.antiraid.modChannelId || securityManager.getModChannel();
            if (modChannelId && global.client) {
                const modChannel = await global.client.channels.fetch(modChannelId).catch(() => null);
                if (modChannel) {
                    const embed = {
                        color: 0xFF0000,
                        title: '🚨 HIGH SEVERITY SPAM ALERT',
                        fields: [
                            { name: 'User', value: `${logEntry.username} (${logEntry.userId})`, inline: true },
                            { name: 'Violations', value: logEntry.violations.map(v => v.type).join(', '), inline: true },
                            { name: 'Action Taken', value: logEntry.action, inline: true },
                            { name: 'Time', value: logEntry.timestamp, inline: true }
                        ]
                    };
                    await modChannel.send({ embeds: [embed] });
                }
            }
        } catch (error) {
            console.error('❌ Failed to send raid alert', error);
        }
    }

    async sendWebhookAlert(data) {
        if (!this.config.antiraid.alertWebhookUrl) return;
        try {
            const webhookUrl = this.config.antiraid.alertWebhookUrl;
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `**Anti-Spam Alert**\n${JSON.stringify(data, null, 2)}`
                })
            });
        } catch (error) {
            console.error('❌ Failed to send webhook alert', error);
        }
    }

    getDashboardData(guildId) {
        try {
            const violationFile = path.join(VIOLATIONS_DIR, `${guildId}.json`);
            const raidFile = path.join(VIOLATIONS_DIR, `raid-${guildId}.json`);
            
            let violations = [];
            let raids = [];

            if (fs.existsSync(violationFile)) {
                try { violations = JSON.parse(fs.readFileSync(violationFile, 'utf8')); } catch {}
            }
            if (fs.existsSync(raidFile)) {
                try { raids = JSON.parse(fs.readFileSync(raidFile, 'utf8')); } catch {}
            }

            const now = Date.now();
            const oneHourAgo = now - 3600000;
            const oneDayAgo = now - 86400000;

            const recentViolations = violations.filter(v => new Date(v.timestamp).getTime() > oneHourAgo);
            const dailyViolations = violations.filter(v => new Date(v.timestamp).getTime() > oneDayAgo);
            const recentRaids = raids.filter(r => new Date(r.timestamp).getTime() > oneDayAgo);

            const topSpammers = recentViolations.reduce((acc, v) => {
                if (!acc[v.userId]) {
                    acc[v.userId] = { userId: v.userId, username: v.username, count: 0 };
                }
                acc[v.userId].count++;
                return acc;
            }, {});

            const violationTypes = recentViolations.reduce((acc, v) => {
                v.violations.forEach(violation => {
                    acc[violation.type] = (acc[violation.type] || 0) + 1;
                });
                return acc;
            }, {});

            return {
                summary: {
                    violationsLastHour: recentViolations.length,
                    violationsLastDay: dailyViolations.length,
                    raidsLastDay: recentRaids.length,
                    activeRaidMode: this.joinMonitor.isRaidMode,
                    lockedChannels: this.joinMonitor.lockdownChannels.size,
                    joinsLastMinute: this.joinMonitor.joins.filter(j => now - j.timestamp < 60000).length
                },
                topSpammers: Object.values(topSpammers).sort((a, b) => b.count - a.count).slice(0, 10),
                violationTypes,
                recentActivity: [...recentViolations.slice(-10)].reverse(),
                raidEvents: [...recentRaids.slice(-5)].reverse(),
                configuration: {
                    antispamEnabled: this.config.antispam.enabled,
                    antiraidEnabled: this.config.antiraid.enabled,
                    strikeThreshold: this.config.antispam.strikeThreshold,
                    raidThreshold: this.config.antiraid.raidModeActivationThreshold
                }
            };
        } catch (error) {
            console.error('❌ Failed to generate dashboard data', error);
            return { error: 'Failed to load dashboard data' };
        }
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfigToFile();
        return this.config;
    }

    getConfig() {
        return this.config;
    }

    isRaidModeActive(guildId) {
        return this.joinMonitor.isRaidMode;
    }

    isLocked(channelId) {
        return this.joinMonitor.lockdownChannels.has(channelId);
    }

    async manualLockdown(guild, durationMinutes = 30) {
        await this.activateLockdown(guild);
        this.joinMonitor.isRaidMode = true;
        setTimeout(() => {
            this.deactivateLockdown(guild);
            this.joinMonitor.isRaidMode = false;
        }, durationMinutes * 60 * 1000);
    }

    async manualRaidMode(guild, activate = true) {
        if (activate) {
            await this.activateRaidMode(guild, 3);
        } else {
            await this.deactivateRaidMode(guild);
        }
    }

    getSystemStats() {
        const now = Date.now();
        return {
            messageHistorySize: this.messageHistory.size,
            userCooldownsSize: this.userCooldowns.size,
            activeStrikes: this.strikes.size,
            pendingJoins: this.joinMonitor.joins.filter(j => now - j.timestamp < 60000).length,
            raidModeActive: this.joinMonitor.isRaidMode,
            lockedChannels: this.joinMonitor.lockdownChannels.size,
            uptime: process.uptime()
        };
    }
}

export const antiSpam = new AntiSpamSystem();
