import { 
    EmbedBuilder, 
    Colors, 
    PermissionFlagsBits,
    time,
    TimestampStyles 
} from 'discord.js';
import databaseManager from './database.js';
import { webhookManager, NotificationType, NotificationPriority } from './webhookManager.js';
import { moderationSystem } from './moderationCore.js';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTO_MOD_DATA_FILE = path.join(__dirname, '..', '..', 'data', 'auto_mod_config.json');
const GEMINI_MODEL_NAME = 'gemini-1.5-pro';

export const TriggerType = {
    MESSAGE_CONTENT: 'message_content',
    JOIN_PATTERN: 'join_pattern',
    MESSAGE_RATE: 'message_rate',
    KEYWORD_MATCH: 'keyword_match',
    REGEX_MATCH: 'regex_match'
};

export const ActionType = {
    WARN: 'warn',
    MUTE: 'mute',
    KICK: 'kick',
    BAN: 'ban',
    DELETE: 'delete',
    TIMEOUT: 'timeout',
    ROLE_ADD: 'role_add',
    ROLE_REMOVE: 'role_remove',
    DM_USER: 'dm_user'
};

export const RuleTemplate = {
    SPAM: 'spam',
    HARASSMENT: 'harassment',
    INVITE_LINKS: 'invite_links',
    EXPLICIT_CONTENT: 'explicit_content',
    NEW_ACCOUNT: 'new_account'
};

class AutoModerationSystem {
    constructor() {
        this.rules = new Map();
        this.userCooldowns = new Map();
        this.guildCooldowns = new Map();
        this.aiAnalysisCache = new Map();
        this.geminiClient = null;
        this.initializeData();
        this.initializeAI();
    }

    initializeData() {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        if (!fs.existsSync(AUTO_MOD_DATA_FILE)) {
            const defaultConfig = {
                rules: [],
                keywordLists: {
                    whitelist: [],
                    blacklist: []
                },
                guildConfigs: {},
                feedbackData: [],
                aiAnalysisHistory: []
            };
            fs.writeFileSync(AUTO_MOD_DATA_FILE, JSON.stringify(defaultConfig, null, 2));
        }

        this.loadData();
    }

    loadData() {
        try {
            const data = JSON.parse(fs.readFileSync(AUTO_MOD_DATA_FILE, 'utf8'));
            this.keywordLists = data.keywordLists || { whitelist: [], blacklist: [] };
            this.guildConfigs = data.guildConfigs || {};
            this.feedbackData = data.feedbackData || [];
            this.aiAnalysisHistory = data.aiAnalysisHistory || [];

            for (const rule of data.rules || []) {
                this.rules.set(rule.id, rule);
            }
        } catch (error) {
            console.error('Failed to load auto-mod data:', error);
            this.keywordLists = { whitelist: [], blacklist: [] };
            this.guildConfigs = {};
            this.feedbackData = [];
            this.aiAnalysisHistory = [];
        }
    }

    saveData() {
        try {
            const data = {
                rules: Array.from(this.rules.values()),
                keywordLists: this.keywordLists,
                guildConfigs: this.guildConfigs,
                feedbackData: this.feedbackData,
                aiAnalysisHistory: this.aiAnalysisHistory.slice(-1000)
            };
            fs.writeFileSync(AUTO_MOD_DATA_FILE, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save auto-mod data:', error);
        }
    }

    initializeAI() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (apiKey) {
                this.geminiClient = new GoogleGenAI({ apiKey });
                console.log('AI moderation initialized with Gemini');
            } else {
                console.warn('GEMINI_API_KEY not set - AI moderation disabled');
            }
        } catch (error) {
            console.warn('Failed to initialize Gemini client:', error.message);
        }
    }

    createRule(options) {
        const rule = {
            id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: options.name || 'Untitled Rule',
            description: options.description || '',
            enabled: options.enabled !== false,
            priority: options.priority || 0,
            dryRun: options.dryRun || false,
            trigger: {
                type: options.trigger.type,
                ...options.trigger
            },
            conditions: options.conditions || {},
            actions: options.actions || [],
            cooldown: options.cooldown || { enabled: false, duration: 0, perUser: true, perGuild: false },
            schedule: options.schedule || { enabled: false, startTime: null, endTime: null, timezone: 'UTC' },
            exceptions: options.exceptions || { channels: [], roles: [], users: [] },
            stats: {
                triggers: 0,
                actionsExecuted: 0,
                falsePositives: 0,
                lastTriggered: null
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.rules.set(rule.id, rule);
        this.saveData();
        return rule;
    }

    updateRule(ruleId, updates) {
        const rule = this.rules.get(ruleId);
        if (!rule) return null;

        const updatedRule = {
            ...rule,
            ...updates,
            id: rule.id,
            updatedAt: Date.now()
        };

        this.rules.set(ruleId, updatedRule);
        this.saveData();
        return updatedRule;
    }

    deleteRule(ruleId) {
        const deleted = this.rules.delete(ruleId);
        if (deleted) {
            this.saveData();
        }
        return deleted;
    }

    getRule(ruleId) {
        return this.rules.get(ruleId);
    }

    getAllRules(guildId = null) {
        const allRules = Array.from(this.rules.values());
        if (guildId) {
            return allRules.filter(r => r.guildId === guildId);
        }
        return allRules.sort((a, b) => b.priority - a.priority);
    }

    toggleRule(ruleId, enabled) {
        const rule = this.rules.get(ruleId);
        if (!rule) return null;
        rule.enabled = enabled;
        rule.updatedAt = Date.now();
        this.saveData();
        return rule;
    }

    async evaluateRule(rule, context) {
        if (!rule.enabled || rule.dryRun && context.dryRunOnly) {
            return { matched: false, reason: 'Rule disabled or in dry-run mode' };
        }

        if (await this.checkCooldown(rule, context)) {
            return { matched: false, reason: 'Rule in cooldown' };
        }

        if (await this.checkSchedule(rule, context)) {
            return { matched: false, reason: 'Rule outside scheduled time' };
        }

        if (await this.checkExceptions(rule, context)) {
            return { matched: false, reason: 'Target in exception list' };
        }

        const triggerResult = await this.evaluateTrigger(rule, context);
        if (!triggerResult.matched) {
            return { matched: false, reason: triggerResult.reason };
        }

        const conditionResult = await this.evaluateConditions(rule, context);
        if (!conditionResult.passed) {
            return { matched: false, reason: conditionResult.reason };
        }

        return { matched: true, triggerData: triggerResult.data };
    }

    async checkCooldown(rule, context) {
        if (!rule.cooldown?.enabled) return false;

        const cooldownKey = rule.cooldown.perUser 
            ? `${rule.id}:${context.userId}:${context.guildId}`
            : rule.cooldown.perGuild 
                ? `${rule.id}:${context.guildId}`
                : `${rule.id}:${context.userId}`;

        const lastTrigger = this.userCooldowns.get(cooldownKey);
        if (lastTrigger && Date.now() - lastTrigger < rule.cooldown.duration) {
            return true;
        }

        this.userCooldowns.set(cooldownKey, Date.now());
        return false;
    }

    async checkSchedule(rule, context) {
        if (!rule.schedule?.enabled) return false;

        const now = new Date();
        const startTime = new Date(rule.schedule.startTime);
        const endTime = new Date(rule.schedule.endTime);

        if (rule.schedule.daysOfWeek) {
            const dayOfWeek = now.getDay();
            if (!rule.schedule.daysOfWeek.includes(dayOfWeek)) {
                return true;
            }
        }

        if (now < startTime || now > endTime) {
            return true;
        }

        return false;
    }

    async checkExceptions(rule, context) {
        const { channels = [], roles = [], users = [] } = rule.exceptions || {};

        if (users.includes(context.userId)) return true;
        if (channels.includes(context.channelId)) return true;

        if (context.member && roles.length > 0) {
            const userRoles = context.member.roles.cache.map(r => r.id);
            if (roles.some(r => userRoles.includes(r))) return true;
        }

        return false;
    }

    async evaluateTrigger(rule, context) {
        switch (rule.trigger.type) {
            case TriggerType.MESSAGE_CONTENT:
                return this.evaluateMessageContentTrigger(rule, context);
            case TriggerType.JOIN_PATTERN:
                return this.evaluateJoinPatternTrigger(rule, context);
            case TriggerType.MESSAGE_RATE:
                return this.evaluateMessageRateTrigger(rule, context);
            case TriggerType.KEYWORD_MATCH:
                return this.evaluateKeywordTrigger(rule, context);
            case TriggerType.REGEX_MATCH:
                return this.evaluateRegexTrigger(rule, context);
            default:
                return { matched: false, reason: 'Unknown trigger type' };
        }
    }

    evaluateMessageContentTrigger(rule, context) {
        if (!context.messageContent) return { matched: false, reason: 'No message content' };

        const content = rule.trigger.options?.caseSensitive === false 
            ? context.messageContent.toLowerCase() 
            : context.messageContent;

        const patterns = rule.trigger.patterns || [];
        for (const pattern of patterns) {
            if (content.includes(pattern.toLowerCase())) {
                return { matched: true, data: { matchedPattern: pattern } };
            }
        }

        return { matched: false, reason: 'No matching pattern' };
    }

    async evaluateJoinPatternTrigger(rule, context) {
        if (!context.joinTimestamp) return { matched: false, reason: 'No join timestamp' };

        const accountAge = Date.now() - new Date(context.joinTimestamp).getTime();
        const maxAge = rule.trigger.maxAccountAge || 86400000;
        const minAge = rule.trigger.minAccountAge || 0;

        if (accountAge < minAge) {
            return { matched: true, data: { accountAge, reason: 'Account too new' } };
        }

        if (rule.trigger.checkJoinVelocity) {
            const recentJoins = await this.getRecentJoinCount(context.guildId);
            if (recentJoins >= rule.trigger.joinThreshold) {
                return { matched: true, data: { recentJoins, reason: 'High join velocity' } };
            }
        }

        return { matched: false, reason: 'Join pattern not matched' };
    }

    async evaluateMessageRateTrigger(rule, context) {
        if (!context.messageCount) return { matched: false, reason: 'No message count' };

        const threshold = rule.trigger.threshold || 5;
        const timeWindow = rule.trigger.timeWindow || 60000;

        if (context.messageCount >= threshold) {
            return { matched: true, data: { messageCount: context.messageCount, threshold, timeWindow } };
        }

        return { matched: false, reason: 'Message rate within limits' };
    }

    evaluateKeywordTrigger(rule, context) {
        if (!context.messageContent) return { matched: false, reason: 'No message content' };

        const content = this.prepareContent(context.messageContent);
        const keywords = rule.trigger.keywords || [];

        for (const keyword of keywords) {
            if (this.fuzzyMatch(content, keyword, rule.trigger.fuzzySensitivity || 0.8)) {
                return { matched: true, data: { matchedKeyword: keyword } };
            }
        }

        return { matched: false, reason: 'No keyword match' };
    }

    evaluateRegexTrigger(rule, context) {
        if (!context.messageContent) return { matched: false, reason: 'No message content' };

        const patterns = rule.trigger.patterns || [];
        for (const pattern of patterns) {
            try {
                const regex = new RegExp(pattern, rule.trigger.regexFlags || 'i');
                const match = regex.exec(context.messageContent);
                if (match) {
                    return { matched: true, data: { matchedPattern: pattern, match: match[0] } };
                }
            } catch (error) {
                console.error(`Invalid regex pattern: ${pattern}`, error);
            }
        }

        return { matched: false, reason: 'No regex match' };
    }

    prepareContent(content) {
        let processed = content;

        const ignorePatterns = [
            /```[\s\S]*?```/g,
            /`[^`]+`/g,
            /"[^"]*"/g,
            /'[^']*'/g
        ];

        for (const pattern of ignorePatterns) {
            processed = processed.replace(pattern, '');
        }

        return rule.trigger?.caseSensitive === false ? processed.toLowerCase() : processed;
    }

    fuzzyMatch(content, keyword, sensitivity) {
        if (content.includes(keyword.toLowerCase())) return true;

        const normalizedContent = content.toLowerCase();
        const normalizedKeyword = keyword.toLowerCase();

        const levenshteinDistance = this.levenshteinDistance(normalizedContent, normalizedKeyword);
        const maxLength = Math.max(normalizedContent.length, normalizedKeyword.length);
        const similarity = 1 - (levenshteinDistance / maxLength);

        return similarity >= sensitivity;
    }

    levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,
                        dp[i][j - 1] + 1,
                        dp[i - 1][j - 1] + 1
                    );
                }
            }
        }

        return dp[m][n];
    }

    async evaluateConditions(rule, context) {
        const conditions = rule.conditions || {};

        if (conditions.minAccountAge) {
            const accountAge = Date.now() - new Date(context.joinTimestamp || 0).getTime();
            if (accountAge < conditions.minAccountAge) {
                return { passed: false, reason: 'Account too new' };
            }
        }

        if (conditions.maxWarnings !== undefined) {
            const warnings = await this.getWarningCount(context.guildId, context.userId);
            if (warnings >= conditions.maxWarnings) {
                return { passed: false, reason: 'Warning threshold exceeded' };
            }
        }

        if (conditions.requiredRoles?.length > 0 && context.member) {
            const userRoles = context.member.roles.cache.map(r => r.id);
            if (!conditions.requiredRoles.some(r => userRoles.includes(r))) {
                return { passed: false, reason: 'Missing required role' };
            }
        }

        return { passed: true };
    }

    async executeActions(rule, context, triggerData) {
        if (context.dryRunOnly) {
            return { executed: false, reason: 'Dry run mode - no actions executed' };
        }

        rule.stats.actionsExecuted++;
        rule.stats.lastTriggered = Date.now();
        this.rules.set(rule.id, rule);

        const results = [];

        for (const action of rule.actions) {
            try {
                const result = await this.executeAction(action, context, triggerData, rule);
                results.push({ action: action.type, success: true, result });
            } catch (error) {
                console.error(`Failed to execute action ${action.type}:`, error);
                results.push({ action: action.type, success: false, error: error.message });
            }
        }

        await this.logRuleTrigger(rule, context, triggerData, results);
        return { executed: true, results };
    }

    async executeAction(action, context, triggerData, rule) {
        const guild = context.guild;
        const targetUser = context.user || await guild.members.fetch(context.userId);
        const botMember = guild.members.me;

        switch (action.type) {
            case ActionType.WARN:
                return this.executeWarn(botMember, targetUser, triggerData.matchedPattern || 'Auto-moderation warning', rule);
            case ActionType.MUTE:
                return this.executeMute(botMember, targetUser, action.duration || '1h', triggerData.matchedPattern || 'Auto-moderation mute', rule);
            case ActionType.KICK:
                return this.executeKick(botMember, targetUser, triggerData.matchedPattern || 'Auto-moderation kick', rule);
            case ActionType.BAN:
                return this.executeBan(botMember, targetUser, action.duration || null, triggerData.matchedPattern || 'Auto-moderation ban', rule);
            case ActionType.DELETE:
                return this.executeDelete(context.message, rule);
            case ActionType.TIMEOUT:
                return this.executeTimeout(botMember, targetUser, action.duration || '30m', triggerData.matchedPattern || 'Auto-moderation timeout', rule);
            case ActionType.ROLE_ADD:
                return this.executeRoleAdd(targetUser, action.roleId, rule);
            case ActionType.ROLE_REMOVE:
                return this.executeRoleRemove(targetUser, action.roleId, rule);
            case ActionType.DM_USER:
                return this.executeDMUser(targetUser, action.message || 'Please review our community guidelines.', rule);
            default:
                return { error: 'Unknown action type' };
        }
    }

    async executeWarn(moderator, target, reason, rule) {
        const result = await moderationSystem.warn(moderator, target, reason);
        if (result.success && rule.actions.some(a => a.type === ActionType.MUTE && a.triggerWarnings)) {
            const warningCount = moderationSystem.getWarningCount(target.guild.id, target.id);
            if (warningCount >= 5) {
                await this.executeMute(moderator, target, '1h', 'Auto-mute after 5 warnings', rule);
            }
        }
        return result;
    }

    async executeMute(moderator, target, duration, reason, rule) {
        return moderationSystem.mute(moderator, target, { duration, reason });
    }

    async executeKick(moderator, target, reason, rule) {
        return moderationSystem.kick(moderator, target, { reason });
    }

    async executeBan(moderator, target, duration, reason, rule) {
        return moderationSystem.ban(moderator, target, { duration, reason });
    }

    async executeDelete(message, rule) {
        if (message?.deletable) {
            try {
                await message.delete();
                return { deleted: true };
            } catch (error) {
                return { deleted: false, error: error.message };
            }
        }
        return { deleted: false, reason: 'Message not deletable' };
    }

    async executeTimeout(moderator, target, duration, reason, rule) {
        return moderationSystem.timeout(moderator, target, duration, reason);
    }

    async executeRoleAdd(target, roleId, rule) {
        if (target.guild.ownerId === target.id) {
            return { added: false, reason: 'Cannot modify server owner' };
        }

        try {
            const role = await target.guild.roles.fetch(roleId);
            if (role) {
                await target.roles.add(role);
                return { added: true, roleId };
            }
            return { added: false, reason: 'Role not found' };
        } catch (error) {
            return { added: false, error: error.message };
        }
    }

    async executeRoleRemove(target, roleId, rule) {
        if (target.guild.ownerId === target.id) {
            return { removed: false, reason: 'Cannot modify server owner' };
        }

        try {
            const role = await target.guild.roles.fetch(roleId);
            if (role) {
                await target.roles.remove(role);
                return { removed: true, roleId };
            }
            return { removed: false, reason: 'Role not found' };
        } catch (error) {
            return { removed: false, error: error.message };
        }
    }

    async executeDMUser(target, message, rule) {
        try {
            await target.send(message);
            return { sent: true };
        } catch (error) {
            return { sent: false, error: error.message };
        }
    }

    async logRuleTrigger(rule, context, triggerData, actionResults) {
        const logData = {
            ruleId: rule.id,
            ruleName: rule.name,
            triggerType: rule.trigger.type,
            userId: context.userId,
            guildId: context.guildId,
            channelId: context.channelId,
            triggerData,
            actionResults,
            timestamp: Date.now()
        };

        if (this.guildConfigs[context.guildId]?.auditLogChannel) {
            await webhookManager.notify(
                context.guildId,
                'custom',
                {
                    title: `Auto-Mod Rule Triggered: ${rule.name}`,
                    description: `Rule triggered by <@${context.userId}>`,
                    fields: [
                        { name: 'Trigger Type', value: rule.trigger.type, inline: true },
                        { name: 'Actions Executed', value: String(actionResults.filter(r => r.success).length), inline: true },
                        { name: 'Details', value: JSON.stringify(triggerData).substring(0, 500), inline: false }
                    ],
                    color: Colors.Red,
                    timestamp: new Date().toISOString()
                }
            );
        }

        try {
            await databaseManager.moderationLogsCreate(
                context.userId,
                'auto_mod',
                rule.name,
                JSON.stringify(triggerData),
                context.guildId
            );
        } catch (error) {
            console.error('Failed to log to database:', error);
        }
    }

    async processMessage(message, dryRunOnly = false) {
        if (!message?.guild?.id) return { triggered: false };

        const context = {
            guildId: message.guild.id,
            channelId: message.channel.id,
            userId: message.author.id,
            user: message.member,
            messageContent: message.content,
            message: message,
            joinTimestamp: message.member?.joinedAt?.toISOString(),
            dryRunOnly
        };

        const sortedRules = Array.from(this.rules.values())
            .filter(r => r.enabled)
            .sort((a, b) => b.priority - a.priority);

        const triggeredRules = [];

        for (const rule of sortedRules) {
            const evaluation = await this.evaluateRule(rule, context);

            if (evaluation.matched) {
                rule.stats.triggers++;
                this.rules.set(rule.id, rule);
                triggeredRules.push({ rule, evaluation });

                if (!dryRunOnly || rule.dryRun) {
                    await this.executeActions(rule, context, evaluation.triggerData);
                }

                if (rule.actions.some(a => a.type === ActionType.DELETE)) {
                    if (message.deletable) {
                        await message.delete().catch(() => {});
                    }
                }

                if (!rule.continueAfterMatch) break;
            }
        }

        return { triggered: triggeredRules.length > 0, rules: triggeredRules };
    }

    async processMemberJoin(member) {
        const context = {
            guildId: member.guild.id,
            userId: member.id,
            user: member,
            joinTimestamp: member.joinedAt?.toISOString(),
            member
        };

        const sortedRules = Array.from(this.rules.values())
            .filter(r => r.enabled && r.trigger.type === TriggerType.JOIN_PATTERN)
            .sort((a, b) => b.priority - a.priority);

        const triggeredRules = [];

        for (const rule of sortedRules) {
            const evaluation = await this.evaluateRule(rule, context);

            if (evaluation.matched) {
                rule.stats.triggers++;
                this.rules.set(rule.id, rule);
                triggeredRules.push({ rule, evaluation });

                await this.executeActions(rule, context, evaluation.triggerData);

                if (!rule.continueAfterMatch) break;
            }
        }

        return { triggered: triggeredRules.length > 0, rules: triggeredRules };
    }

    addKeywordToList(list, keyword) {
        if (!this.keywordLists[list].includes(keyword)) {
            this.keywordLists[list].push(keyword);
            this.saveData();
            return true;
        }
        return false;
    }

    removeKeywordFromList(list, keyword) {
        const index = this.keywordLists[list].indexOf(keyword);
        if (index > -1) {
            this.keywordLists[list].splice(index, 1);
            this.saveData();
            return true;
        }
        return false;
    }

    importKeywords(list, keywords) {
        const imported = [];
        for (const keyword of keywords) {
            if (this.addKeywordToList(list, keyword)) {
                imported.push(keyword);
            }
        }
        return imported;
    }

    exportKeywords(list) {
        return [...this.keywordLists[list]];
    }

    async analyzeContentWithAI(content, context = {}) {
        if (!this.geminiClient) {
            return { success: false, error: 'AI moderation not available' };
        }

        const cacheKey = `${content.substring(0, 100)}_${Date.now()}`;
        if (this.aiAnalysisCache.has(cacheKey)) {
            return this.aiAnalysisCache.get(cacheKey);
        }

        try {
            const model = this.geminiClient.getGenerativeModel({ model: GEMINI_MODEL_NAME });

            const prompt = `
Analyze the following Discord message for potential violations. Consider context where available.

Message: "${content}"
Context: ${JSON.stringify(context)}

Provide a JSON response with:
- isViolation: boolean
- violationType: string (harassment, spam, explicit, self-harm, illegal, none, or other)
- confidence: number (0-1)
- severity: string (low, medium, high, critical)
- reasoning: string explaining the analysis
- suggestedAction: string (none, warn, delete, mute, kick, ban)
- educationalMessage: string (helpful response if violation detected)
- isFalsePositive: boolean (could this be a false positive given context)
`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
            const analysis = JSON.parse(cleanedResponse);

            const aiResult = {
                success: true,
                analysis: {
                    ...analysis,
                    timestamp: Date.now(),
                    contentPreview: content.substring(0, 200)
                }
            };

            this.aiAnalysisCache.set(cacheKey, aiResult);

            this.aiAnalysisHistory.push({
                content: content.substring(0, 500),
                analysis: analysis,
                timestamp: Date.now()
            });

            if (this.aiAnalysisHistory.length > 1000) {
                this.aiAnalysisHistory = this.aiAnalysisHistory.slice(-1000);
            }

            this.saveData();

            return aiResult;
        } catch (error) {
            console.error('AI analysis failed:', error);
            return { success: false, error: error.message };
        }
    }

    async processAIModeration(message, options = {}) {
        if (!this.geminiClient) return { processed: false, reason: 'AI not available' };

        const content = message.content;
        if (content.length < 5) return { processed: false, reason: 'Content too short' };

        const analysis = await this.analyzeContentWithAI(content, {
            channelId: message.channel.id,
            guildId: message.guild.id,
            authorId: message.author.id
        });

        if (!analysis.success) return { processed: false, error: analysis.error };

        const result = {
            processed: true,
            violation: analysis.analysis.isViolation,
            violationType: analysis.analysis.violationType,
            confidence: analysis.analysis.confidence,
            severity: analysis.analysis.severity,
            suggestedAction: analysis.analysis.suggestedAction
        };

        const threshold = options.confidenceThreshold || 0.8;
        if (analysis.analysis.isViolation && analysis.analysis.confidence >= threshold) {
            if (options.autoDelete && analysis.analysis.severity === 'high') {
                if (message.deletable) {
                    await message.delete().catch(() => {});
                    result.deleted = true;
                }
            }

            if (options.sendEducationalMessage && analysis.analysis.educationalMessage) {
                await message.reply(analysis.analysis.educationalMessage).catch(() => {});
                result.educationalMessageSent = true;
            }

            if (options.warnOnViolation) {
                await moderationSystem.warn(
                    message.guild.members.me,
                    message.member,
                    `AI-detected ${analysis.analysis.violationType}`
                );
                result.warned = true;
            }
        }

        return result;
    }

    reportFalsePositive(analysisId, reason) {
        this.feedbackData.push({
            type: 'false_positive',
            analysisId,
            reason,
            timestamp: Date.now(),
            reviewed: false
        });
        this.saveData();

        const relatedRule = Array.from(this.rules.values()).find(r => 
            r.stats.lastTriggered && Date.now() - r.stats.lastTriggered < 86400000
        );

        if (relatedRule) {
            relatedRule.stats.falsePositives++;
            this.saveData();
        }

        return true;
    }

    reportTruePositive(analysisId) {
        this.feedbackData.push({
            type: 'true_positive',
            analysisId,
            timestamp: Date.now(),
            reviewed: false
        });
        this.saveData();
        return true;
    }

    createRuleFromTemplate(template, guildId, customizations = {}) {
        const templates = {
            [RuleTemplate.SPAM]: {
                name: 'Anti-Spam',
                trigger: { type: TriggerType.MESSAGE_RATE, threshold: 5, timeWindow: 10000 },
                actions: [
                    { type: ActionType.DELETE },
                    { type: ActionType.WARN, message: 'Please avoid spamming.' }
                ],
                conditions: {}
            },
            [RuleTemplate.HARASSMENT]: {
                name: 'Anti-Harassment',
                trigger: { type: TriggerType.KEYWORD_MATCH, keywords: [] },
                actions: [
                    { type: ActionType.DELETE },
                    { type: ActionType.WARN, message: 'Harassment is not tolerated.' }
                ],
                conditions: {}
            },
            [RuleTemplate.INVITE_LINKS]: {
                name: 'Block External Invites',
                trigger: { type: TriggerType.REGEX_MATCH, patterns: ['discord\\.gg/\\w+', 'discord\\.com/invite/\\w+'] },
                actions: [
                    { type: ActionType.DELETE }
                ],
                conditions: {}
            },
            [RuleTemplate.EXPLICIT_CONTENT]: {
                name: 'Filter Explicit Content',
                trigger: { type: TriggerType.KEYWORD_MATCH, keywords: [] },
                actions: [
                    { type: ActionType.DELETE }
                ],
                conditions: {}
            },
            [RuleTemplate.NEW_ACCOUNT]: {
                name: 'New Account Protection',
                trigger: { type: TriggerType.JOIN_PATTERN, maxAccountAge: 86400000 },
                actions: [
                    { type: ActionType.TIMEOUT, duration: '1h' },
                    { type: ActionType.DM_USER, message: 'Your account is too new. You will be able to send messages after 24 hours.' }
                ],
                conditions: {}
            }
        };

        const templateConfig = templates[template];
        if (!templateConfig) return null;

        return this.createRule({
            ...templateConfig,
            ...customizations,
            guildId
        });
    }

    async getRecentJoinCount(guildId) {
        const oneMinuteAgo = Date.now() - 60000;
        return this.userCooldowns.size || 0;
    }

    async getWarningCount(guildId, userId) {
        try {
            const logs = await databaseManager.moderationLogsGetByUserId(userId);
            return logs.filter(l => l.action === 'warn' && l.guild_id === guildId).length;
        } catch {
            return 0;
        }
    }

    async getRuleStats(guildId) {
        const guildRules = Array.from(this.rules.values()).filter(r => 
            !guildId || r.guildId === guildId
        );

        return {
            totalRules: guildRules.length,
            enabledRules: guildRules.filter(r => r.enabled).length,
            totalTriggers: guildRules.reduce((sum, r) => sum + (r.stats?.triggers || 0), 0),
            totalActionsExecuted: guildRules.reduce((sum, r) => sum + (r.stats?.actionsExecuted || 0), 0),
            falsePositives: guildRules.reduce((sum, r) => sum + (r.stats?.falsePositives || 0), 0),
            topRules: guildRules
                .sort((a, b) => (b.stats?.triggers || 0) - (a.stats?.triggers || 0))
                .slice(0, 5)
        };
    }

    configureGuild(guildId, config) {
        this.guildConfigs[guildId] = {
            ...(this.guildConfigs[guildId] || {}),
            ...config,
            updatedAt: Date.now()
        };
        this.saveData();
        return this.guildConfigs[guildId];
    }

    getGuildConfig(guildId) {
        return this.guildConfigs[guildId] || {};
    }

    exportRules(guildId = null) {
        const rules = guildId 
            ? Array.from(this.rules.values()).filter(r => r.guildId === guildId)
            : Array.from(this.rules.values());

        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            rules,
            keywordLists: this.keywordLists,
            guildConfigs: guildId ? { [guildId]: this.guildConfigs[guildId] } : this.guildConfigs
        };
    }

    async importRules(rulesData, guildId, overwrite = false) {
        const imported = [];
        const errors = [];

        if (overwrite) {
            const existingRules = Array.from(this.rules.values()).filter(r => 
                r.guildId === guildId
            );
            for (const rule of existingRules) {
                this.rules.delete(rule.id);
            }
        }

        for (const rule of rulesData.rules || []) {
            try {
                const newRule = this.createRule({
                    ...rule,
                    id: undefined,
                    guildId,
                    stats: undefined,
                    createdAt: undefined,
                    updatedAt: undefined
                });
                imported.push(newRule);
            } catch (error) {
                errors.push({ rule: rule.name, error: error.message });
            }
        }

        if (rulesData.keywordLists) {
            this.keywordLists = {
                ...this.keywordLists,
                ...rulesData.keywordLists
            };
        }

        if (rulesData.guildConfigs?.[guildId]) {
            this.guildConfigs[guildId] = rulesData.guildConfigs[guildId];
        }

        this.saveData();

        return { imported: imported.length, errors };
    }

    async processSpamDetection(guildId, userId, messageCount, timeWindow) {
        const context = {
            guildId,
            userId,
            messageCount,
            timeWindow
        };

        const spamRules = Array.from(this.rules.values())
            .filter(r => r.enabled && r.trigger.type === TriggerType.MESSAGE_RATE)
            .sort((a, b) => b.priority - a.priority);

        for (const rule of spamRules) {
            if (messageCount >= rule.trigger.threshold) {
                const evaluation = await this.evaluateRule(rule, context);
                if (evaluation.matched) {
                    await this.executeActions(rule, context, evaluation.triggerData);
                    return { detected: true, rule: rule.name };
                }
            }
        }

        return { detected: false };
    }
}

export const autoModerationSystem = new AutoModerationSystem();
export default autoModerationSystem;
