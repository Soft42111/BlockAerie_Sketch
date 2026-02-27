import { 
    EmbedBuilder, 
    Colors, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { geminiFallbackManager } from './geminiFallbackManager.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const AUTOMOD_DATA_FILE = path.join(DATA_DIR, 'automod_config.json');

export class AdvancedAutoModeration {
    constructor() {
        this.ensureDataFiles();
        this.loadData();
        this.messageTracker = new Map();
        this.violationCounts = new Map();
        this.rateLimits = new Map();
    }

    ensureDataFiles() {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        
        if (!fs.existsSync(AUTOMOD_DATA_FILE)) {
            fs.writeFileSync(AUTOMOD_DATA_FILE, JSON.stringify({
                guildConfigs: {},
                globalWhitelist: [],
                customRules: [],
                bannedDomains: [],
                allowedInvites: [],
                keywords: []
            }, null, 2));
        }
    }

    loadData() {
        try {
            this.automodData = JSON.parse(fs.readFileSync(AUTOMOD_DATA_FILE, 'utf8'));
        } catch (error) {
            this.automodData = {
                guildConfigs: {},
                globalWhitelist: [],
                customRules: [],
                bannedDomains: [],
                allowedInvites: [],
                keywords: []
            };
        }
    }

    saveData() {
        try {
            fs.writeFileSync(AUTOMOD_DATA_FILE, JSON.stringify(this.automodData, null, 2));
        } catch (error) {
            console.error('Failed to save automod data:', error);
        }
    }

    getConfig(guildId) {
        if (!this.automodData.guildConfigs[guildId]) {
            this.automodData.guildConfigs[guildId] = this.getDefaultConfig();
        }
        return this.automodData.guildConfigs[guildId];
    }

    getDefaultConfig() {
        return {
            enabled: true,
            logChannelId: null,
            notifyUser: true,
            deleteMessage: true,
            strikesEnabled: true,
            strikeThreshold: 3,
            strikeDuration: '1h',
            actions: {
                inviteDetection: { enabled: true, action: 'delete', strike: 1 },
                mentionSpam: { enabled: true, threshold: 5, action: 'mute', strike: 2 },
                urlFiltering: { enabled: true, action: 'delete', strike: 1, whitelist: [] },
                keywordFiltering: { enabled: true, action: 'delete', strike: 1 },
                massEmoji: { enabled: true, threshold: 5, action: 'delete', strike: 1 },
                textFlood: { enabled: true, threshold: 5, window: 3000, action: 'mute', strike: 2 },
                newAccount: { enabled: true, days: 7, action: 'mute', strike: 1 },
                capsLock: { enabled: true, threshold: 70, action: 'delete', strike: 0 },
                attachmentFilter: { enabled: true, types: [], action: 'delete', strike: 1 },
                aiContentFilter: { enabled: true, action: 'delete', strike: 1 }
            },
            exemptions: {
                roles: [],
                users: [],
                channels: []
            }
        };
    }

    async analyzeContentAI(content) {
        try {
            const prompt = `Analyze this Discord message for policy violations. Check for:
1. Hate speech or discrimination
2. Harassment or bullying
3. Violence or threats
4. Explicit adult content
5. Spam or scams
6. Illegal content

Message: "${content}"

Respond with ONLY "SAFE" if content is acceptable, or "VIOLATION: <reason>" if it violates any policy.`;

            const result = await geminiFallbackManager.generateContent(prompt, { maxTokens: 50 });
            
            if (result.startsWith('VIOLATION:')) {
                return { safe: false, reason: result.replace('VIOLATION:', '').trim() };
            }
            return { safe: true };
        } catch (error) {
            console.error('AI content analysis failed:', error);
            return { safe: true, error: true };
        }
    }

    async processMessage(message) {
        if (!message.guild || message.author.bot) return null;
        
        const config = this.getConfig(message.guild.id);
        if (!config.enabled) return null;

        const exemptions = config.exemptions;
        if (exemptions.roles.some(r => message.member.roles.cache.has(r)) ||
            exemptions.users.includes(message.author.id) ||
            exemptions.channels.includes(message.channel.id)) {
            return null;
        }

        const violations = [];

        try {
            if (config.actions.inviteDetection.enabled) {
                const inviteViolation = await this.checkInviteLinks(message);
                if (inviteViolation) violations.push(inviteViolation);
            }

            if (config.actions.mentionSpam.enabled) {
                const mentionViolation = this.checkMentionSpam(message);
                if (mentionViolation) violations.push(mentionViolation);
            }

            if (config.actions.urlFiltering.enabled) {
                const urlViolation = this.checkURLs(message);
                if (urlViolation) violations.push(urlViolation);
            }

            if (config.actions.keywordFiltering.enabled) {
                const keywordViolation = this.checkKeywords(message);
                if (keywordViolation) violations.push(keywordViolation);
            }

            if (config.actions.massEmoji.enabled) {
                const emojiViolation = this.checkMassEmoji(message);
                if (emojiViolation) violations.push(emojiViolation);
            }

            if (config.actions.capsLock.enabled) {
                const capsViolation = this.checkCapsLock(message);
                if (capsViolation) violations.push(capsViolation);
            }

            if (config.actions.textFlood.enabled) {
                const floodViolation = this.checkTextFlood(message);
                if (floodViolation) violations.push(floodViolation);
            }

            if (config.actions.aiContentFilter.enabled) {
                const aiViolation = await this.checkAIContent(message);
                if (aiViolation) violations.push(aiViolation);
            }

            if (violations.length > 0) {
                await this.handleViolations(message, violations, config);
                return violations;
            }
        } catch (error) {
            console.error('Automod processing error:', error);
        }

        return null;
    }

    async checkInviteLinks(message) {
        const inviteRegex = /(discord\.gg|discord\.com\/invite|discord\.io|invite\.gg|discord\.app\.gg)\/([a-zA-Z0-9-]+)/gi;
        const matches = message.content.match(inviteRegex);
        
        if (!matches) return null;

        const guildId = message.guild.id;
        const allowedInvites = this.automodData.allowedInvites[guildId] || [];
        
        for (const invite of matches) {
            const code = invite.split('/').pop();
            if (!allowedInvites.some(ai => ai.code === code || invite.includes(ai.domain))) {
                return {
                    type: 'invite_detection',
                    reason: 'Unauthorized Discord invite',
                    details: `Invite: ${invite}`,
                    action: config.actions.inviteDetection.action,
                    strike: config.actions.inviteDetection.strike
                };
            }
        }
        return null;
    }

    checkMentionSpam(message) {
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        const threshold = config.actions.mentionSpam.threshold;
        
        if (mentionCount >= threshold) {
            return {
                type: 'mention_spam',
                reason: `Mass mentions (${mentionCount} mentions)`,
                details: `Threshold: ${threshold}`,
                action: config.actions.mentionSpam.action,
                strike: config.actions.mentionSpam.strike
            };
        }
        return null;
    }

    checkURLs(message) {
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const matches = message.content.match(urlRegex);
        
        if (!matches) return null;

        const guildId = message.guild.id;
        const whitelist = this.automodData.guildConfigs[guildId]?.actions?.urlFiltering?.whitelist || [];
        
        for (const url of matches) {
            const domain = url.replace(/https?:\/\//, '').split('/')[0];
            if (!whitelist.some(w => domain.includes(w))) {
                const isBanned = this.automodData.bannedDomains.some(bd => domain.includes(bd));
                if (isBanned || !url.startsWith('https://')) {
                    return {
                        type: 'url_filtering',
                        reason: 'Untrusted URL',
                        details: `URL: ${url.substring(0, 50)}...`,
                        action: config.actions.urlFiltering.action,
                        strike: config.actions.urlFiltering.strike
                    };
                }
            }
        }
        return null;
    }

    checkKeywords(message) {
        const keywords = this.automodData.keywords;
        if (keywords.length === 0) return null;

        const content = message.content.toLowerCase();
        for (const keyword of keywords) {
            if (content.includes(keyword.toLowerCase())) {
                return {
                    type: 'keyword_filtering',
                    reason: 'Blocked keyword',
                    details: `Keyword: ${keyword}`,
                    action: config.actions.keywordFiltering.action,
                    strike: config.actions.keywordFiltering.strike
                };
            }
        }
        return null;
    }

    checkMassEmoji(message) {
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
        const matches = message.content.match(emojiRegex);
        const threshold = config.actions.massEmoji.threshold;
        
        if (matches && matches.length >= threshold) {
            return {
                type: 'mass_emoji',
                reason: `Mass emoji (${matches.length} emojis)`,
                details: `Threshold: ${threshold}`,
                action: config.actions.massEmoji.action,
                strike: config.actions.massEmoji.strike
            };
        }
        return null;
    }

    checkCapsLock(message) {
        if (message.content.length < 10) return null;
        
        const uppercase = message.content.replace(/[^A-Z]/g, '').length;
        const percentage = (uppercase / message.content.length) * 100;
        const threshold = config.actions.capsLock.threshold;
        
        if (percentage >= threshold) {
            return {
                type: 'caps_lock',
                reason: 'Excessive caps lock',
                details: `${percentage.toFixed(1)}% caps`,
                action: config.actions.capsLock.action,
                strike: config.actions.capsLock.strike
            };
        }
        return null;
    }

    checkTextFlood(message) {
        const userId = message.author.id;
        const guildId = message.guild.id;
        const key = `${guildId}-${userId}`;
        const threshold = config.actions.textFlood.threshold;
        const window = config.actions.textFlood.window;
        
        if (!this.messageTracker.has(key)) {
            this.messageTracker.set(key, []);
        }
        
        const messages = this.messageTracker.get(key);
        const now = Date.now();
        
        messages.push({ time: now, content: message.content });
        
        const recentMessages = messages.filter(m => now - m.time < window);
        this.messageTracker.set(key, recentMessages);
        
        if (recentMessages.length >= threshold) {
            const similarMessages = recentMessages.filter(m => 
                m.content.toLowerCase() === message.content.toLowerCase()
            );
            
            if (similarMessages.length >= 3) {
                return {
                    type: 'text_flood',
                    reason: 'Message flood detected',
                    details: `${recentMessages.length} messages in ${window}ms`,
                    action: config.actions.textFlood.action,
                    strike: config.actions.textFlood.strike
                };
            }
        }
        return null;
    }

    async checkAIContent(message) {
        const result = await this.analyzeContentAI(message.content);
        
        if (!result.safe && !result.error) {
            return {
                type: 'ai_content_filter',
                reason: 'AI-detected policy violation',
                details: result.reason,
                action: config.actions.aiContentFilter.action,
                strike: config.actions.aiContentFilter.strike
            };
        }
        return null;
    }

    async handleViolations(message, violations, config) {
        let totalStrikes = 0;
        
        for (const violation of violations) {
            totalStrikes += violation.strike || 1;
            
            if (config.deleteMessage) {
                try {
                    await message.delete();
                } catch (error) {
                    console.error('Failed to delete automod message:', error);
                }
            }

            if (config.notifyUser) {
                try {
                    const notifyEmbed = new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle('⚠️ Message Removed')
                        .setDescription(`Your message was removed for: **${violation.reason}**`)
                        .addFields({ name: 'Details', value: violation.details || 'N/A' })
                        .setFooter({ text: 'Repeated violations may result in additional penalties.' });
                    
                    await message.author.send({ embeds: [notifyEmbed] });
                } catch (error) {
                }
            }
        }

        await this.logViolations(message, violations, config);

        if (config.strikesEnabled && totalStrikes > 0) {
            await this.addStrike(message.author.id, message.guild.id, totalStrikes, violations[0].reason);
        }

        if (totalStrikes >= config.strikeThreshold) {
            await this.executeStrikeAction(message.member, config.strikeAction || 'mute', config.strikeDuration);
        }
    }

    async logViolations(message, violations, config) {
        if (!config.logChannelId) return;
        
        try {
            const logChannel = await message.guild.channels.fetch(config.logChannelId);
            if (!logChannel) return;

            const logEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('🚨 AutoMod Detection')
                .setThumbnail(message.author.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: 'Channel', value: message.channel.toString(), inline: true },
                    { name: 'Violations', value: violations.map(v => v.type).join(', ') || 'Unknown', inline: false }
                )
                .setDescription(`**Message:** ${message.content.substring(0, 500)}`)
                .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });
        } catch (error) {
            console.error('Failed to log automod violations:', error);
        }
    }

    async addStrike(userId, guildId, count, reason) {
        const key = `${guildId}-${userId}`;
        const strikes = this.violationCounts.get(key) || { count: 0, expiresAt: 0 };
        
        strikes.count += count;
        strikes.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
        this.violationCounts.set(key, strikes);
    }

    async executeStrikeAction(member, action, duration) {
        try {
            switch (action) {
                case 'mute':
                    await member.timeout(30 * 60 * 1000, 'AutoMod: Strike threshold reached');
                    break;
                case 'kick':
                    await member.kick('AutoMod: Strike threshold reached');
                    break;
                case 'ban':
                    await member.ban({ reason: 'AutoMod: Strike threshold reached', days: 1 });
                    break;
            }
        } catch (error) {
            console.error('Failed to execute strike action:', error);
        }
    }

    async handleGuildMemberAdd(member) {
        const config = this.getConfig(member.guild.id);
        if (!config.actions.newAccount.enabled) return;

        const accountAge = Date.now() - member.user.createdTimestamp;
        const thresholdDays = config.actions.newAccount.days * 24 * 60 * 60 * 1000;

        if (accountAge < thresholdDays) {
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('⚠️ Account Verification')
                    .setDescription('Your Discord account is relatively new. You may be subject to additional verification.')
                    .addFields(
                        { name: 'Account Age', value: `${Math.floor(accountAge / (24 * 60 * 60 * 1000))} days` },
                        { name: 'Minimum Required', value: `${config.actions.newAccount.days} days` }
                    );

                await member.send({ embeds: [dmEmbed] });
            } catch (error) {
            }
        }
    }

    updateConfig(guildId, newConfig) {
        this.automodData.guildConfigs[guildId] = {
            ...this.getDefaultConfig(),
            ...this.automodData.guildConfigs[guildId],
            ...newConfig
        };
        this.saveData();
    }

    addKeyword(keyword) {
        if (!this.automodData.keywords.includes(keyword)) {
            this.automodData.keywords.push(keyword);
            this.saveData();
        }
    }

    removeKeyword(keyword) {
        this.automodData.keywords = this.automodData.keywords.filter(k => k !== keyword);
        this.saveData();
    }

    addAllowedInvite(guildId, invite) {
        if (!this.automodData.allowedInvites[guildId]) {
            this.automodData.allowedInvites[guildId] = [];
        }
        this.automodData.allowedInvites[guildId].push({
            ...invite,
            addedAt: Date.now()
        });
        this.saveData();
    }

    getStats(guildId) {
        return {
            enabled: this.automodData.guildConfigs[guildId]?.enabled || false,
            violationsToday: this.getViolationsToday(guildId),
            topViolations: this.getTopViolations(guildId)
        };
    }

    getViolationsToday(guildId) {
        return 0;
    }

    getTopViolations(guildId) {
        return [];
    }
}

export const advancedAutoMod = new AdvancedAutoModeration();
