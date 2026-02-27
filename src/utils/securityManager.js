import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { geminiFallbackManager } from './geminiFallbackManager.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const MOD_CONFIG_FILE = path.join(process.cwd(), 'memory', 'mod-config.md');
const USERS_FILE = path.join(process.cwd(), 'memory', 'users.md');
const SLURS_FILE = path.join(process.cwd(), 'memory', 'slurs.md');
const ADMIN_CONFIG_FILE = path.join(process.cwd(), 'memory', 'admin-config.md');

class SecurityManager {
    constructor() {
        this.ensureDataDir();
        this.loadSecurityData();
        this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
        this.admins = this.loadAdmins();
        this.slurs = this.loadSlurs();
        this.adminImmunity = this.loadAdminImmunity();
    }

    ensureDataDir() {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        if (!fs.existsSync(path.join(process.cwd(), 'memory'))) fs.mkdirSync(path.join(process.cwd(), 'memory'));

        if (!fs.existsSync(SECURITY_FILE)) {
            fs.writeFileSync(SECURITY_FILE, JSON.stringify({ allowlist: [], pairingRequests: {} }, null, 2));
        }
    }

    loadSecurityData() {
        try {
            this.data = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf8'));
        } catch (error) {
            console.error('❌ Failed to load security data', error);
            this.data = { allowlist: [], pairingRequests: {} };
        }
    }

    loadAdmins() {
        if (!fs.existsSync(USERS_FILE)) return [];
        try {
            const content = fs.readFileSync(USERS_FILE, 'utf8');
            // Extract IDs from the markdown table
            const matches = content.matchAll(/\|\s*([0-9]{17,20})\s*\|/g);
            return Array.from(matches, m => m[1]);
        } catch (error) {
            console.error('❌ Failed to load admins from users.md', error);
            return [];
        }
    }

    loadSlurs() {
        if (!fs.existsSync(SLURS_FILE)) return [];
        try {
            const content = fs.readFileSync(SLURS_FILE, 'utf8');
            // Extract bullet points from the markdown
            const matches = content.matchAll(/^- (.*)$/gm);
            return Array.from(matches, m => m[1].trim())
                .filter(s => s && !s.includes('[ADMIN:'));
        } catch (error) {
            console.error('❌ Failed to load slurs from slurs.md', error);
            return [];
        }
    }

    loadAdminImmunity() {
        if (!fs.existsSync(ADMIN_CONFIG_FILE)) return true;
        try {
            const content = fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8');
            const match = content.match(/ADMIN_IMMUNITY:\s*(true|false)/);
            return match ? match[1] === 'true' : true;
        } catch (error) {
            return true;
        }
    }

    saveSecurityData() {
        try {
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('❌ Failed to save security data', error);
        }
    }

    /**
     * Check if a user is an administrator
     * @param {Object} member - The Discord member/user object
     */
    isAdmin(member) {
        if (!member) return false;
        const userId = member.id || member;

        console.log(`[Security] Checking admin status for ${userId}...`);

        // 1. Check Bot Owner (.env) - Priority 1
        const botOwnerId = process.env.BOT_OWNER_ID;
        if (botOwnerId && userId === botOwnerId) {
            console.log(`[Security] ${userId} allowed via BOT_OWNER_ID`);
            return true;
        }

        // 2. Check Admin (.env) - Priority 2
        if (config.security.adminUserId && userId === config.security.adminUserId) {
            console.log(`[Security] ${userId} allowed via ADMIN_USER_ID`);
            return true;
        }

        // 3. Check Discord Native Permissions - Priority 3
        if (member.permissions && typeof member.permissions.has === 'function') {
            if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                console.log(`[Security] ${userId} allowed via Discord Administrator permission`);
                return true;
            }
        }

        // 4. Reload admins from file to get latest updates - Fallback
        this.admins = this.loadAdmins();

        // 5. Check users.md registry
        const isRegistryAdmin = this.admins.includes(userId);
        if (isRegistryAdmin) {
            console.log(`[Security] ${userId} allowed via users.md registry`);
        } else {
            console.log(`[Security] ${userId} denied access (not an admin)`);
        }

        return isRegistryAdmin;
    }

    /**
     * Get list of admin IDs
     */
    getAdmins() {
        return this.admins || [];
    }

    getAdminImmunity() {
        return this.adminImmunity;
    }

    setAdminImmunity(value) {
        this.adminImmunity = value === true;
        const content = `# Admin Configuration\n\nADMIN_IMMUNITY: ${this.adminImmunity}\nLAST_UPDATED: ${new Date().toISOString()}`;
        fs.writeFileSync(ADMIN_CONFIG_FILE, content);
        return true;
    }

    /**
     * Add a slur to the blacklist
     */
    addSlur(word) {
        const cleanWord = word.trim().toLowerCase();
        if (!cleanWord || this.slurs.includes(cleanWord)) return false;

        this.slurs.push(cleanWord);

        // Ensure file exists with proper structure
        if (!fs.existsSync(SLURS_FILE)) {
            fs.writeFileSync(SLURS_FILE, `# Forbidden Keywords (Slurs & Profanity)

## Slurs
## Hard Profanity

`);
        }

        const content = fs.readFileSync(SLURS_FILE, 'utf8');

        // Find the right section to add the slur
        let updatedContent;
        if (content.includes('## Slurs')) {
            // Add after the Slurs section header
            updatedContent = content.replace(
                /## Slurs\n*/,
                `## Slurs\n- ${cleanWord}\n`
            );
        } else {
            // If no Slurs section, add one
            updatedContent = `${content}\n## Slurs\n- ${cleanWord}\n`;
        }

        fs.writeFileSync(SLURS_FILE, updatedContent);
        console.log(`✅ Added slur "${cleanWord}" to ${SLURS_FILE}`);
        return true;
    }

    /**
     * Remove a slur from the blacklist
     */
    removeSlur(word) {
        const cleanWord = word.trim().toLowerCase();
        if (!cleanWord || !this.slurs.includes(cleanWord)) return false;

        this.slurs = this.slurs.filter(slur => slur !== cleanWord);

        try {
            if (!fs.existsSync(SLURS_FILE)) return true;

            const content = fs.readFileSync(SLURS_FILE, 'utf8');
            const lines = content.split('\n');
            const filteredLines = lines.filter(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('- ')) {
                    const slur = trimmed.substring(2).trim();
                    return slur !== cleanWord;
                }
                return true;
            });
            fs.writeFileSync(SLURS_FILE, filteredLines.join('\n'));
            console.log(`✅ Removed slur "${cleanWord}" from ${SLURS_FILE}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to remove slur from file', error);
            return false;
        }
    }

    /**
     * Get the list of forbidden keywords
     */
    listSlurs() {
        return this.slurs || [];
    }

    /**
     * Report moderation violation to mod channel
     */
    async reportViolation(message, reason, isSlur = false, client) {
        const modChannelId = this.getModChannel();
        if (!modChannelId) return false;

        try {
            const modChannel = await client.channels.fetch(modChannelId).catch(() => null);
            if (!modChannel) return false;

            const embed = {
                color: isSlur ? 0xFF0000 : 0xFFAA00,
                title: `🚨 ${isSlur ? 'Slur Detection' : 'Content Violation'}`,
                description: `**User:** ${message.author.tag} (${message.author.id})\n**Channel:** ${message.channel.name} (${message.channel.id})\n**Reason:** ${reason}`,
                fields: [
                    {
                        name: 'Message Content',
                        value: message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content,
                        inline: false
                    },
                    {
                        name: 'Action Taken',
                        value: 'Message deleted',
                        inline: true
                    },
                    {
                        name: 'Timestamp',
                        value: new Date().toISOString(),
                        inline: true
                    }
                ],
                footer: {
                    text: 'BlockAerie Sketch Auto-Moderation'
                }
            };

            await modChannel.send({ embeds: [embed] });
            console.log(`🚨 MODERATION ALERT: ${message.author.tag} (${message.author.id}): ${reason}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to report violation to mod channel', error);
            return false;
        }
    }

    /**
     * Bulk add multiple slurs
     */
    addMultipleSlurs(words) {
        const results = { added: 0, duplicates: 0 };

        for (const word of words) {
            const cleanWord = word.trim().toLowerCase();
            if (!cleanWord) continue;

            if (this.addSlur(cleanWord)) {
                results.added++;
            } else {
                results.duplicates++;
            }
        }

        return results;
    }

    /**
     * Get the configured mod channel ID
     */
    getModChannel() {
        if (!fs.existsSync(MOD_CONFIG_FILE)) return null;
        const content = fs.readFileSync(MOD_CONFIG_FILE, 'utf8');
        const match = content.match(/CHANNEL_ID:\s*([0-9]+)/);
        return match ? match[1] : null;
    }

    /**
     * Set the mod channel ID
     */
    setModChannel(channelId) {
        const content = `# Mod Channel Configuration\n\nCHANNEL_ID: ${channelId}\nUPDATED: ${new Date().toISOString()}`;
        fs.writeFileSync(MOD_CONFIG_FILE, content);
        return true;
    }

    /**
     * Check if content contains forbidden keywords (Slurs/Profanity)
     */
    checkKeywords(content, userId) {
        if (!config.security.moderationEnabled) return { safe: true };

        // Respect Admin Immunity if enabled
        if (this.adminImmunity && this.isAdmin(userId)) {
            return { safe: true };
        }

        const cleanContent = content.toLowerCase();

        for (const slur of this.slurs) {
            // Skip empty strings
            if (!slur) continue;

            // Use word boundary to avoid partial matches (e.g. "scrapping" would match "crap" without boundaries)
            const escapedSlur = slur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedSlur}\\b`, 'i');

            if (regex.test(cleanContent)) {
                console.log(`[Security] Blocked word match: "${slur}" in "${content}"`);
                return { safe: false, reason: `Keyword Match: "${slur}"`, isSlur: true };
            }
        }
        return { safe: true };
    }

    /**
     * Check if a user is allowed to use the bot (Pairing Logic)
     * @param {Object} member - Member object or userId
     */
    isUserAllowed(member) {
        if (this.isAdmin(member)) return true;
        const userId = member.id || member;
        if (config.security.dmPolicy === 'open') return true;
        return this.data.allowlist.includes(userId);
    }

    /**
     * Generate a pairing code for a user
     */
    requestPairing(userId) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.data.pairingRequests[userId] = { code, timestamp: Date.now() };
        this.saveSecurityData();
        return code;
    }

    /**
     * Approve a pairing request
     */
    approvePairing(userId, code) {
        const request = this.data.pairingRequests[userId];
        if (request && request.code === code) {
            if (!this.data.allowlist.includes(userId)) this.data.allowlist.push(userId);
            delete this.data.pairingRequests[userId];
            this.saveSecurityData();
            return true;
        }
        return false;
    }

    /**
     * AI-based content moderation (for conversational responses)
     */
    async isContentSafe(content, member = null) {
        if (!config.security.moderationEnabled) return { safe: true };

        // Skip AI moderation for admins to save API calls
        if (member && this.isAdmin(member)) return { safe: true };

        try {
            const { result, modelUsed } = await geminiFallbackManager.generateContent(`Analyze this: "${content}"`, {
                systemInstruction: "You are the 'BlockAerie Sketch Watchdog'. Your job is to aggressively detect slurs, hate speech, and hard profanity. Respond with a JSON object: { \"safe\": boolean, \"reason\": \"brief reason\", \"isSlur\": boolean }."
            });

            let responseText = result.response.text().trim();
            console.log(`🤖 Raw Watchdog Response (${modelUsed}): ${responseText}`);

            // Handle markdown code blocks if AI wraps JSON
            if (responseText.startsWith('```json')) {
                responseText = responseText.replace(/```json\n?|\n?```/g, '');
            }

            const analysis = JSON.parse(responseText);
            return {
                safe: analysis.safe,
                reason: analysis.reason,
                isSlur: analysis.isSlur === true || analysis.isSlur === "true",
                modelUsed
            };
        } catch (error) {
            console.error('❌ Moderation check failed', error);
            return { safe: true, isSlur: false, error: true };
        }
    }
}

export const securityManager = new SecurityManager();
