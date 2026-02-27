/**
 * Safety Scanner Middleware
 * 
 * Scans messages for safety violations using AI.
 * Integated with whitelistManager to skip VIPs.
 */
import { analyzeSafety } from '../../packages/agent-core/index.js';
import { whitelistManager } from './whitelistManager.js';
import { moderationManager } from './moderationManager.js';
import { createErrorEmbed } from './messageFormatter.js';
import crypto from 'crypto';

// Cache recent scans to save AI tokens (LRU-like)
const scanCache = new Map();
const CACHE_SIZE = 1000;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

export const safetyScanner = {
    /**
     * Scan a message and take action if unsafe.
     * @param {import('discord.js').Message} message 
     * @returns {Promise<boolean>} true if message was deleted/unsafe, false if safe
     */
    async scanMessage(message) {
        // Ignore bots and whitelisted users
        if (message.author.bot) return false;
        if (whitelistManager.isWhitelisted(message.member)) return false;

        const content = message.content.trim();
        if (!content || content.length < 5) return false;

        // Check cache
        const hash = getHash(content + (message.attachments.size > 0 ? message.attachments.first().url : ''));
        const cached = scanCache.get(hash);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            if (!cached.result.safe) {
                await this.handleViolation(message, cached.result);
                return true;
            }
            return false; // Safely cached
        }

        // Handle Image Attachments
        let imageBuffer = null;
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                try {
                    const response = await fetch(attachment.url);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        imageBuffer = Buffer.from(arrayBuffer);
                    }
                } catch (e) {
                    console.error('[SafetyScanner] Failed to download attachment:', e.message);
                }
            }
        }

        // AI Analysis
        const result = await analyzeSafety(content, imageBuffer);

        // Update cache
        if (scanCache.size >= CACHE_SIZE) {
            const firstKey = scanCache.keys().next().value;
            scanCache.delete(firstKey);
        }
        scanCache.set(hash, { timestamp: Date.now(), result });

        if (!result.safe) {
            await this.handleViolation(message, result);
            return true;
        }

        return false;
    },

    async handleViolation(message, result) {
        try {
            // Delete message
            if (message.deletable) {
                await message.delete();
            }

            // Log violation
            const reason = `[AutoMod] ${result.category}: ${result.reason}`;
            console.log(`🚨 Violation detected from ${message.author.tag}: ${reason}`);

            // Warn user in DM or Channel
            const warningEmbed = createErrorEmbed(
                'Safety Violation Detected',
                `Your message was removed for violating our safety policy.\n**Category:** ${result.category}\n**Reason:** ${result.reason}`
            );

            await message.channel.send({
                content: `<@${message.author.id}>`,
                embeds: [warningEmbed]
            }).then(m => setTimeout(() => m.delete().catch(() => { }), 10000));

            // Log to mod channel via moderationManager
            // We use a simplified mock adapter since we don't have a full Interaction here
            const modLogAdapter = {
                guildId: message.guild.id,
                channelId: message.channel.id,
                sendInChannel: async () => { }, // Silent
                reply: async () => { }
            };

            // Optionally issue a formal warning
            // await moderationManager.warn(modLogAdapter, message.guild, message.member, reason);

        } catch (err) {
            console.error('Failed to handle safety violation:', err);
        }
    }
};
