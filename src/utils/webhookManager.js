import { logInfo, logWarning, logError } from './errorHandler.js';

const WEBHOOK_CACHE_TTL = 300000;
const MAX_RETRY_ATTEMPTS = 3;
const BATCH_DELAY_MS = 1000;
const RATE_LIMIT_WINDOW = 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

export const NotificationPriority = {
    URGENT: 'urgent',
    NORMAL: 'normal',
    LOW: 'low'
};

export const NotificationType = {
    MODERATION_BAN: 'moderation_ban',
    MODERATION_KICK: 'moderation_kick',
    MODERATION_MUTE: 'moderation_mute',
    MODERATION_WARN: 'moderation_warn',
    SECURITY_SPAM: 'security_spam',
    SECURITY_RAID: 'security_raid',
    USER_JOIN: 'user_join',
    USER_LEAVE: 'user_leave',
    CONFIG_CHANGE: 'config_change',
    DAILY_SUMMARY: 'daily_summary',
    CUSTOM: 'custom'
};

class WebhookManager {
    constructor() {
        this.webhooks = new Map();
        this.webhookCache = new Map();
        this.retryQueue = [];
        this.rateLimitTracker = new Map();
        this.deliveryConfirmations = new Map();
        this.isProcessing = false;
        this.batchQueue = new Map();
        this.processBatch();
    }

    validateWebhookUrl(url) {
        try {
            const urlObj = new URL(url);
            if (!urlObj.hostname.includes('discord')) {
                return { valid: false, error: 'URL must be a Discord webhook URL' };
            }
            if (!urlObj.pathname.match(/^\/api\/webhooks\/\d+\/[\w-]+$/)) {
                return { valid: false, error: 'Invalid Discord webhook format' };
            }
            return { valid: true };
        } catch (e) {
            return { valid: false, error: 'Invalid URL format' };
        }
    }

    async testWebhook(guildId, webhookUrl) {
        const validation = this.validateWebhookUrl(webhookUrl);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        try {
            const testPayload = {
                content: '✅ Webhook connection test successful!',
                embeds: [{
                    title: 'Webhook Test',
                    description: 'Your webhook is properly configured and ready to receive notifications.',
                    color: 0x00FF88,
                    timestamp: new Date().toISOString()
                }]
            };

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testPayload)
            });

            if (response.ok) {
                return { success: true, status: response.status };
            } else {
                const errorText = await response.text();
                return { success: false, error: `HTTP ${response.status}: ${errorText}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    setWebhook(guildId, webhookUrl, isBackup = false, settings = {}) {
        if (!this.webhooks.has(guildId)) {
            this.webhooks.set(guildId, { primary: null, backup: null, settings: this.getDefaultSettings() });
        }

        const guildWebhooks = this.webhooks.get(guildId);
        if (isBackup) {
            guildWebhooks.backup = webhookUrl;
        } else {
            guildWebhooks.primary = webhookUrl;
        }

        if (settings) {
            guildWebhooks.settings = { ...guildWebhooks.settings, ...settings };
        }

        this.webhookCache.set(guildId, {
            timestamp: Date.now(),
            webhooks: { ...guildWebhooks }
        });

        logInfo(`Webhook ${isBackup ? 'backup' : 'primary'} set for guild ${guildId}`);
        return true;
    }

    getDefaultSettings() {
        return {
            enabledEvents: {
                [NotificationType.MODERATION_BAN]: true,
                [NotificationType.MODERATION_KICK]: true,
                [NotificationType.MODERATION_MUTE]: true,
                [NotificationType.MODERATION_WARN]: true,
                [NotificationType.SECURITY_SPAM]: true,
                [NotificationType.SECURITY_RAID]: true,
                [NotificationType.USER_JOIN]: true,
                [NotificationType.USER_LEAVE]: true,
                [NotificationType.CONFIG_CHANGE]: false,
                [NotificationType.DAILY_SUMMARY]: true,
                [NotificationType.CUSTOM]: true
            },
            notificationChannel: null,
            priority: NotificationPriority.NORMAL,
            customTemplate: null,
            includeEmbeds: true,
            batchNotifications: true,
            batchIntervalMs: 5000
        };
    }

    getWebhook(guildId) {
        const cached = this.webhookCache.get(guildId);
        if (cached && Date.now() - cached.timestamp < WEBHOOK_CACHE_TTL) {
            return cached.webhooks;
        }

        const stored = this.webhooks.get(guildId);
        if (stored) {
            this.webhookCache.set(guildId, {
                timestamp: Date.now(),
                webhooks: { ...stored }
            });
            return stored;
        }

        return null;
    }

    deleteWebhook(guildId, isBackup = false) {
        if (!this.webhooks.has(guildId)) return false;

        const guildWebhooks = this.webhooks.get(guildId);
        if (isBackup) {
            guildWebhooks.backup = null;
        } else {
            guildWebhooks.primary = null;
        }

        this.webhookCache.delete(guildId);
        logInfo(`Webhook ${isBackup ? 'backup' : 'primary'} deleted for guild ${guildId}`);
        return true;
    }

    deleteAllWebhooks(guildId) {
        this.webhooks.delete(guildId);
        this.webhookCache.delete(guildId);
        logInfo(`All webhooks deleted for guild ${guildId}`);
    }

    updateSettings(guildId, newSettings) {
        if (!this.webhooks.has(guildId)) {
            this.webhooks.set(guildId, { primary: null, backup: null, settings: this.getDefaultSettings() });
        }

        this.webhooks.get(guildId).settings = {
            ...this.webhooks.get(guildId).settings,
            ...newSettings
        };
        this.webhookCache.delete(guildId);
        logInfo(`Settings updated for guild ${guildId}`);
        return true;
    }

    getSettings(guildId) {
        const guildWebhooks = this.webhooks.get(guildId);
        return guildWebhooks ? guildWebhooks.settings : this.getDefaultSettings();
    }

    checkRateLimit(guildId) {
        const now = Date.now();
        const guildLimits = this.rateLimitTracker.get(guildId) || { requests: [], windowStart: now };

        guildLimits.requests = guildLimits.requests.filter(time => now - time < RATE_LIMIT_WINDOW);

        if (guildLimits.requests.length >= MAX_REQUESTS_PER_WINDOW) {
            const retryAfter = RATE_LIMIT_WINDOW - (now - guildLimits.windowStart);
            return { limited: true, retryAfter };
        }

        guildLimits.requests.push(now);
        this.rateLimitTracker.set(guildId, guildLimits);
        return { limited: false };
    }

    async sendWebhook(guildId, payload, priority = NotificationPriority.NORMAL) {
        const guildWebhooks = this.getWebhook(guildId);
        if (!guildWebhooks?.primary) {
            logWarning(`No webhook configured for guild ${guildId}`);
            return { success: false, error: 'No webhook configured' };
        }

        const rateLimit = this.checkRateLimit(guildId);
        if (rateLimit.limited) {
            if (priority === NotificationPriority.URGENT) {
                return this.addToRetryQueue(guildId, payload, priority);
            }
            return { success: false, error: 'Rate limited', retryAfter: rateLimit.retryAfter };
        }

        const result = await this.deliverWebhook(guildWebhooks.primary, payload);

        if (!result.success && guildWebhooks.backup) {
            logWarning(`Primary webhook failed for guild ${guildId}, trying backup`);
            return await this.deliverWebhook(guildWebhooks.backup, payload);
        }

        return result;
    }

    async deliverWebhook(url, payload, attempt = 1) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000)
            });

            if (response.ok) {
                const messageId = response.headers.get('x-message-id');
                logInfo(`Webhook delivered successfully`);
                return { success: true, messageId };
            }

            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('retry-after')) || 5000;
                logWarning(`Webhook rate limited, retry after ${retryAfter}ms`);
                return { success: false, error: 'Rate limited', retryAfter, isRetryable: true };
            }

            if (response.status >= 500) {
                if (attempt < MAX_RETRY_ATTEMPTS) {
                    return { success: false, error: 'Server error', isRetryable: true };
                }
            }

            const errorText = await response.text();
            return { success: false, error: `HTTP ${response.status}`, details: errorText };
        } catch (error) {
            if (attempt < MAX_RETRY_ATTEMPTS) {
                return { success: false, error: error.message, isRetryable: true };
            }
            return { success: false, error: error.message };
        }
    }

    addToRetryQueue(guildId, payload, priority = NotificationPriority.NORMAL, attempt = 1) {
        const retryEntry = {
            guildId,
            payload,
            priority,
            attempt,
            scheduledFor: Date.now() + Math.min(1000 * Math.pow(2, attempt), 30000)
        };
        this.retryQueue.push(retryEntry);
        this.retryQueue.sort((a, b) => {
            const priorityOrder = { urgent: 0, normal: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority] || a.scheduledFor - b.scheduledFor;
        });
        logInfo(`Added to retry queue: guild ${guildId}, attempt ${attempt}`);
        return { success: false, queued: true };
    }

    async processRetryQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.retryQueue.length > 0) {
            const now = Date.now();
            const entry = this.retryQueue[0];

            if (entry.scheduledFor > now) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            const guildWebhooks = this.getWebhook(entry.guildId);
            if (!guildWebhooks?.primary) {
                this.retryQueue.shift();
                continue;
            }

            const rateLimit = this.checkRateLimit(entry.guildId);
            if (rateLimit.limited) {
                await new Promise(resolve => setTimeout(resolve, rateLimit.retryAfter || 1000));
                continue;
            }

            this.retryQueue.shift();

            const result = await this.deliverWebhook(guildWebhooks.primary, entry.payload, entry.attempt);

            if (result.isRetryable && entry.attempt < MAX_RETRY_ATTEMPTS) {
                this.addToRetryQueue(entry.guildId, entry.payload, entry.priority, entry.attempt + 1);
            } else if (!result.success && guildWebhooks.backup) {
                const backupResult = await this.deliverWebhook(guildWebhooks.backup, entry.payload);
                if (!backupResult.success && entry.attempt < MAX_RETRY_ATTEMPTS) {
                    this.addToRetryQueue(entry.guildId, entry.payload, entry.priority, entry.attempt + 1);
                }
            }
        }

        this.isProcessing = false;
    }

    formatModerationEmbed(type, data) {
        const colors = {
            ban: 0xFF0055,
            kick: 0xFFAA00,
            mute: 0x8B5CF6,
            warn: 0xFFAA00
        };

        const icons = {
            ban: '🔨',
            kick: '👢',
            mute: '🔇',
            warn: '⚠️'
        };

        return {
            title: `${icons[type]} ${type.charAt(0).toUpperCase() + type.slice(1)} Action`,
            description: data.reason || 'No reason provided',
            color: colors[type] || 0xFFAA00,
            fields: [
                { name: 'Target', value: data.target ? `<@${data.target}>` : 'Unknown', inline: true },
                { name: 'Moderator', value: data.moderator ? `<@${data.moderator}>` : 'Unknown', inline: true },
                { name: 'Duration', value: data.duration || 'Permanent', inline: true }
            ].filter(f => f.value !== 'Unknown'),
            timestamp: new Date().toISOString(),
            footer: { text: `Case ID: ${data.caseId || 'N/A'}` }
        };
    }

    formatSecurityEmbed(type, data) {
        const colors = {
            spam: 0xFF0055,
            raid: 0xFF0000
        };

        const icons = {
            spam: '🛡️',
            raid: '🚨'
        };

        return {
            title: `${icons[type]} ${type === 'spam' ? 'Spam Detected' : 'Raid Alert'}`,
            description: data.description || 'Security alert triggered',
            color: colors[type] || 0xFF0000,
            fields: [
                { name: 'Channel', value: data.channel ? `<#${data.channel}>` : 'Multiple', inline: true },
                { name: 'Users Affected', value: String(data.affectedUsers || 'Unknown'), inline: true },
                { name: 'Severity', value: data.severity || 'Medium', inline: true },
                ...(data.evidence ? [{ name: 'Evidence', value: data.evidence.substring(0, 1000), inline: false }] : [])
            ],
            timestamp: new Date().toISOString()
        };
    }

    formatUserActivityEmbed(type, data) {
        const isJoin = type === 'join';
        const color = isJoin ? 0x00FF88 : 0xFF0055;
        const icon = isJoin ? '👋' : '🚪';

        return {
            title: `${icon} ${isJoin ? 'User Joined' : 'User Left'}`,
            color: color,
            fields: [
                { name: 'User', value: data.user ? `<@${data.user}>` : 'Unknown', inline: true },
                { name: 'Account Age', value: data.accountAge || 'Unknown', inline: true },
                { name: 'Member Count', value: String(data.memberCount || 'N/A'), inline: true }
            ],
            thumbnail: data.avatarUrl ? { url: data.avatarUrl } : undefined,
            timestamp: new Date().toISOString(),
            footer: { text: `User ID: ${data.userId || 'Unknown'}` }
        };
    }

    formatConfigChangeEmbed(data) {
        return {
            title: '⚙️ Server Configuration Changed',
            description: `Configuration setting updated by <@${data.moderator || 'Unknown'}>`,
            color: 0x8B5CF6,
            fields: [
                { name: 'Setting', value: data.setting || 'Unknown', inline: true },
                { name: 'Old Value', value: data.oldValue || 'N/A', inline: true },
                { name: 'New Value', value: data.newValue || 'N/A', inline: true }
            ],
            timestamp: new Date().toISOString()
        };
    }

    formatDailySummaryEmbed(data) {
        return {
            title: '📊 Daily Activity Summary',
            description: `Summary for ${data.date || new Date().toLocaleDateString()}`,
            color: 0x00D9FF,
            fields: [
                { name: '👥 New Members', value: String(data.newMembers || 0), inline: true },
                { name: '🚪 Members Left', value: String(data.membersLeft || 0), inline: true },
                { name: '🔨 Bans', value: String(data.bans || 0), inline: true },
                { name: '⚠️ Warns', value: String(data.warnings || 0), inline: true },
                { name: '💬 Messages', value: String(data.messageCount || 0), inline: true },
                { name: '🛡️ Spam Detections', value: String(data.spamDetections || 0), inline: true }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: `Server: ${data.guildName || 'Unknown'}` }
        };
    }

    formatCustomEmbed(data) {
        return {
            title: data.title || 'Custom Notification',
            description: data.description || '',
            color: data.color || 0x00D9FF,
            fields: data.fields || [],
            thumbnail: data.thumbnail ? { url: data.thumbnail } : undefined,
            image: data.image ? { url: data.image } : undefined,
            timestamp: new Date().toISOString(),
            footer: data.footer ? { text: data.footer } : undefined
        };
    }

    createPayload(notificationType, data, settings = {}) {
        const basePayload = {
            username: data.username || 'BlockAerie Bot',
            avatar_url: data.avatarUrl || 'https://i.imgur.com/4M34hi2.png',
            timestamp: new Date().toISOString()
        };

        if (!settings.includeEmbeds) {
            basePayload.content = this.formatPlainText(notificationType, data);
            return basePayload;
        }

        let embed;
        switch (notificationType) {
            case NotificationType.MODERATION_BAN:
                embed = this.formatModerationEmbed('ban', data);
                break;
            case NotificationType.MODERATION_KICK:
                embed = this.formatModerationEmbed('kick', data);
                break;
            case NotificationType.MODERATION_MUTE:
                embed = this.formatModerationEmbed('mute', data);
                break;
            case NotificationType.MODERATION_WARN:
                embed = this.formatModerationEmbed('warn', data);
                break;
            case NotificationType.SECURITY_SPAM:
                embed = this.formatSecurityEmbed('spam', data);
                break;
            case NotificationType.SECURITY_RAID:
                embed = this.formatSecurityEmbed('raid', data);
                break;
            case NotificationType.USER_JOIN:
                embed = this.formatUserActivityEmbed('join', data);
                break;
            case NotificationType.USER_LEAVE:
                embed = this.formatUserActivityEmbed('leave', data);
                break;
            case NotificationType.CONFIG_CHANGE:
                embed = this.formatConfigChangeEmbed(data);
                break;
            case NotificationType.DAILY_SUMMARY:
                embed = this.formatDailySummaryEmbed(data);
                break;
            case NotificationType.CUSTOM:
                embed = this.formatCustomEmbed(data);
                break;
            default:
                embed = this.formatCustomEmbed({ title: notificationType, description: JSON.stringify(data) });
        }

        if (settings.customTemplate) {
            Object.assign(embed, this.applyTemplate(settings.customTemplate, data));
        }

        basePayload.embeds = [embed];

        return basePayload;
    }

    formatPlainText(type, data) {
        const textMap = {
            [NotificationType.MODERATION_BAN]: `🔨 **Ban**: ${data.target ? `<@${data.target}>` : 'Unknown'} - ${data.reason || 'No reason'}`,
            [NotificationType.MODERATION_KICK]: `👢 **Kick**: ${data.target ? `<@${data.target}>` : 'Unknown'} - ${data.reason || 'No reason'}`,
            [NotificationType.MODERATION_MUTE]: `🔇 **Mute**: ${data.target ? `<@${data.target}>` : 'Unknown'} - ${data.reason || 'No reason'}`,
            [NotificationType.MODERATION_WARN]: `⚠️ **Warn**: ${data.target ? `<@${data.target}>` : 'Unknown'} - ${data.reason || 'No reason'}`,
            [NotificationType.SECURITY_SPAM]: `🛡️ **Spam Detected**: ${data.description || 'Suspicious activity detected'}`,
            [NotificationType.SECURITY_RAID]: `🚨 **Raid Alert**: ${data.description || 'Possible raid detected'}`,
            [NotificationType.USER_JOIN]: `👋 **Join**: ${data.user ? `<@${data.user}>` : 'Unknown'} joined the server`,
            [NotificationType.USER_LEAVE]: `🚪 **Leave**: ${data.user ? `<@${data.user}>` : 'Unknown'} left the server`,
            [NotificationType.CONFIG_CHANGE]: `⚙️ **Config Change**: ${data.setting || 'Unknown'} updated`,
            [NotificationType.DAILY_SUMMARY]: `📊 **Daily Summary** for ${new Date().toLocaleDateString()}`,
            [NotificationType.CUSTOM]: data.description || 'Custom notification'
        };
        return textMap[type] || `Notification: ${type}`;
    }

    applyTemplate(template, data) {
        let result = { ...template };
        for (const [key, value] of Object.entries(template)) {
            if (typeof value === 'string') {
                result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, prop) => data[prop] || '');
            }
        }
        return result;
    }

    async notify(guildId, notificationType, data, options = {}) {
        const settings = this.getSettings(guildId);

        if (!settings.enabledEvents[notificationType]) {
            logInfo(`Notification ${notificationType} disabled for guild ${guildId}`);
            return { success: false, reason: 'Event disabled' };
        }

        const priority = options.priority || settings.priority || NotificationPriority.NORMAL;
        const payload = this.createPayload(notificationType, data, settings);

        if (settings.batchNotifications && priority !== NotificationPriority.URGENT) {
            return this.addToBatch(guildId, payload, priority);
        }

        return this.sendWebhook(guildId, payload, priority);
    }

    addToBatch(guildId, payload, priority) {
        if (!this.batchQueue.has(guildId)) {
            this.batchQueue.set(guildId, { payloads: [], priority });
        }

        const batch = this.batchQueue.get(guildId);
        batch.payloads.push(payload);

        const settings = this.getSettings(guildId);
        const batchInterval = settings.batchIntervalMs || 5000;

        if (!batch.timeout) {
            batch.timeout = setTimeout(() => {
                this.flushBatch(guildId);
            }, batchInterval);
        }

        return { success: true, batched: true };
    }

    async flushBatch(guildId) {
        const batch = this.batchQueue.get(guildId);
        if (!batch || batch.payloads.length === 0) return;

        clearTimeout(batch.timeout);
        this.batchQueue.delete(guildId);

        if (batch.payloads.length === 1) {
            return this.sendWebhook(guildId, batch.payloads[0], batch.priority);
        }

        const combinedEmbeds = batch.payloads
            .filter(p => p.embeds)
            .flatMap(p => p.embeds);

        const combinedPayload = {
            username: 'BlockAerie Bot',
            avatar_url: 'https://i.imgur.com/4M34hi2.png',
            embeds: combinedEmbeds.slice(0, 10)
        };

        return this.sendWebhook(guildId, combinedPayload, batch.priority);
    }

    async processBatch() {
        setInterval(() => {
            for (const [guildId] of this.batchQueue) {
                this.flushBatch(guildId);
            }
        }, 60000);
    }

    async notifyModerationAction(guildId, action, target, moderator, reason, options = {}) {
        return this.notify(guildId, `moderation_${action}`, {
            target,
            moderator,
            reason,
            duration: options.duration,
            caseId: options.caseId
        }, options);
    }

    async notifySecurityAlert(guildId, alertType, data, options = {}) {
        return this.notify(guildId, `security_${alertType}`, data, options);
    }

    async notifyUserActivity(guildId, activityType, userId, data = {}, options = {}) {
        return this.notify(guildId, `user_${activityType}`, {
            user: userId,
            userId,
            ...data
        }, options);
    }

    async notifyConfigChange(guildId, setting, oldValue, newValue, moderator, options = {}) {
        return this.notify(guildId, NotificationType.CONFIG_CHANGE, {
            setting,
            oldValue: String(oldValue),
            newValue: String(newValue),
            moderator
        }, options);
    }

    async notifyDailySummary(guildId, summaryData, options = {}) {
        return this.notify(guildId, NotificationType.DAILY_SUMMARY, summaryData, options);
    }

    async sendCustomNotification(guildId, notificationData, options = {}) {
        return this.notify(guildId, NotificationType.CUSTOM, notificationData, options);
    }

    setEventEnabled(guildId, eventType, enabled) {
        const settings = this.getSettings(guildId);
        if (settings.enabledEvents.hasOwnProperty(eventType)) {
            settings.enabledEvents[eventType] = enabled;
            this.updateSettings(guildId, settings);
            return true;
        }
        return false;
    }

    getEnabledEvents(guildId) {
        const settings = this.getSettings(guildId);
        return { ...settings.enabledEvents };
    }

    getAllGuildWebhooks() {
        const result = {};
        for (const [guildId, data] of this.webhooks) {
            result[guildId] = {
                hasPrimary: !!data.primary,
                hasBackup: !!data.backup,
                settings: data.settings
            };
        }
        return result;
    }

    clearRetryQueue() {
        this.retryQueue = [];
        logInfo('Retry queue cleared');
    }

    getQueueStats() {
        return {
            retryQueueSize: this.retryQueue.length,
            batchQueueSize: this.batchQueue.size,
            rateLimitedGuilds: this.rateLimitTracker.size
        };
    }
}

export const webhookManager = new WebhookManager();
export default webhookManager;
