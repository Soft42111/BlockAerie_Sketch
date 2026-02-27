/**
 * Agent Core — Intent Router + Planner/Executor
 *
 * Maps both natural language and structured inputs to the same handlers.
 * Pattern: OpenClaw Pi agent RPC with tool streaming + Sogni plugin boundaries.
 *
 * @module packages/agent-core
 */
import { GoogleGenAI } from '@google/genai';
import { sharedConfig } from '../config/index.js';

const ai = new GoogleGenAI({ apiKey: sharedConfig.gemini.apiKey });

// ── Intent Definitions ──────────────────────────────────────────

/**
 * @typedef {Object} ParsedIntent
 * @property {string} intent — one of the INTENT_* constants
 * @property {number} confidence — 0.0 to 1.0
 * @property {Record<string, any>} params — extracted parameters
 * @property {string} [suggestedCommand] — slash command suggestion for low confidence
 */

export const INTENTS = {
    GENERATE_IMAGE: 'generate_image',
    EDIT_IMAGE: 'edit_image',
    GENERATE_VIDEO: 'generate_video',
    ANGLES_360: 'angles_360',
    REMIND: 'remind',
    MEMORY_SAVE: 'memory_save',
    MEMORY_GET: 'memory_get',
    BOT_STATUS: 'bot_status',
    // Moderation
    BAN: 'ban',
    KICK: 'kick',
    TIMEOUT: 'timeout',
    WARN: 'warn',
    CLEAR: 'clear',
    UNBAN: 'unban',
    REPORT: 'report',
    NOTE: 'note',
    LOCK: 'lock',
    // Admin
    SLURS: 'slurs',
    RAID: 'raid',
    AUTOMOD: 'automod',
    MODLOG: 'modlog',
    GLOBAL_KILL: 'global_kill',
    GENERAL_CHAT: 'general_chat',
    UNKNOWN: 'unknown',
};

const INTENT_EXAMPLES = `You are an intent classifier for a Discord bot. Given a user message, determine the intent and extract parameters.

INTENTS:
- generate_image: Create/draw an image. Params: prompt, model?
- edit_image: Edit/modify image. Params: prompt, model?
- generate_video: Create video/animate. Params: prompt, workflow?
- angles_360: Multi-angle turntable. Params: prompt, make_video?
- remind: Set a reminder. Params: message, when
- memory_save: Save preference. Params: key, value
- memory_get: Recall preference. Params: key
- bot_status: Check health/uptime
- ban: Ban a user. Params: user_id, reason?
- kick: Kick a user. Params: user_id, reason?
- timeout: Timeout/mute user. Params: user_id, duration, reason?
- warn: Warn a user. Params: user_id, reason?
- clear: Purge messages. Params: count
- report: Report a user. Params: user_id, reason
- note: Member notes. Params: action(add/list), user_id, content?
- lock: Lockdown channel. Params: none
- slurs: Manage slurs. Params: action(add/remove/list), word?
- raid: Anti-raid control. Params: action(on/off/status/config)
- automod: Auto-mod rules. Params: action(add/remove/list)
- global_kill: Emergency process kill. Params: none
- general_chat: Greetings/Talk
- unknown: Cannot determine

EXAMPLES:
"ban <@123> for spamming" -> {"intent":"ban","confidence":0.95,"params":{"user_id":"123","reason":"spamming"}}
"can you timeout @user for 10m" -> {"intent":"timeout","confidence":0.95,"params":{"user_id":"@user","duration":"10m"}}
"clear 50 messages" -> {"intent":"clear","confidence":0.95,"params":{"count":50}}
"report @badguy for being mean" -> {"intent":"report","confidence":0.95,"params":{"user_id":"@badguy","reason":"being mean"}}
"save that my birthday is July 4" -> {"intent":"memory_save","confidence":0.9,"params":{"key":"birthday","value":"July 4"}}
"make a cat image" -> {"intent":"generate_image","confidence":0.95,"params":{"prompt":"cat"}}
"how long have you been up?" -> {"intent":"bot_status","confidence":0.8,"params":{}}

Respond with ONLY a JSON object. No markdown.`;

/**
 * Classify a natural language message into an intent with extracted params.
 * @param {string} userMessage
 * @param {boolean} hasAttachment — whether the message includes an image/file
 * @returns {Promise<ParsedIntent>}
 */
export async function classifyIntent(userMessage, hasAttachment = false) {
    // Fast-path: regex-based intent detection for obvious cases
    const fastResult = fastClassify(userMessage, hasAttachment);
    if (fastResult && fastResult.confidence >= 0.85) {
        return fastResult;
    }

    // AI-based classification for ambiguous messages
    try {
        const contextHint = hasAttachment ? ' (user has attached an image)' : '';
        const response = await ai.models.generateContent({
            model: sharedConfig.gemini.model,
            contents: [
                { role: 'user', parts: [{ text: INTENT_EXAMPLES }] },
                { role: 'user', parts: [{ text: `Classify this message${contextHint}: "${userMessage}"` }] },
            ],
        });

        const text = response.text.trim();
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        const parsed = JSON.parse(cleaned);

        const result = {
            intent: parsed.intent || INTENTS.UNKNOWN,
            confidence: parsed.confidence || 0.5,
            params: parsed.params || {},
        };

        if (result.confidence < 0.7) {
            result.suggestedCommand = getSuggestedCommand(result.intent);
        }

        return result;
    } catch (err) {
        console.error('[Agent] Intent classification error:', err.message);
        return { intent: INTENTS.GENERAL_CHAT, confidence: 0.5, params: {} };
    }
}

/**
 * Analyze a message for safety violations using AI.
 * @param {string} userMessage
 * @returns {Promise<{safe: boolean, category?: string, reason?: string}>}
 */
/**
 * Analyze a message for safety violations using AI.
 * @param {string} userMessage
 * @param {Buffer} [imageBuffer] - Optional image buffer
 * @returns {Promise<{safe: boolean, category?: string, reason?: string}>}
 */
export async function analyzeSafety(userMessage, imageBuffer = null) {
    try {
        const prompt = `Analyze this message and/or image for safety violations. Categories:
- HATE_SPEECH: Slurs, dehumanization, promotion of hate groups
- HARASSMENT: Bullying, threats, doxxing, severe insults
- SEXUALLY_EXPLICIT: Pornography, sexual violence, solicitation
- DANGEROUS_CONTENT: Self-harm, terrorism, illegal acts guidance

Message: "${userMessage}"

Respond with ONLY a JSON object: {"safe": boolean, "category": string|null, "reason": string|null}`;

        const parts = [{ text: prompt }];

        if (imageBuffer) {
            parts.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: imageBuffer.toString("base64")
                }
            });
        }

        const response = await ai.models.generateContent({
            model: sharedConfig.gemini.model,
            contents: [{ role: 'user', parts }]
        });

        const text = response.text().trim();
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        return JSON.parse(cleaned);
    } catch (err) {
        console.error('[Agent] Safety analysis error:', err.message);
        // Fail open (safe) on error to prevent blocking legimate chat during outages
        return { safe: true };
    }
}

/**
 * Fast regex-based classification for obvious intents.
 * @param {string} msg
 * @param {boolean} hasAttachment
 * @returns {ParsedIntent|null}
 */
function fastClassify(msg, hasAttachment) {
    const lower = msg.toLowerCase().trim();

    // Moderation Fast-path
    if (lower.startsWith('ban ')) {
        return { intent: INTENTS.BAN, confidence: 0.9, params: { user_id: lower.split(' ')[1] } };
    }
    if (lower.startsWith('kick ')) {
        return { intent: INTENTS.KICK, confidence: 0.9, params: { user_id: lower.split(' ')[1] } };
    }
    if (lower.startsWith('timeout ') || lower.startsWith('mute ')) {
        const parts = lower.split(' ');
        return { intent: INTENTS.TIMEOUT, confidence: 0.9, params: { user_id: parts[1], duration: parts[2] || '10m' } };
    }
    if (lower.startsWith('warn ')) {
        return { intent: INTENTS.WARN, confidence: 0.9, params: { user_id: lower.split(' ')[1] } };
    }
    if (lower.startsWith('clear ') || lower.startsWith('purge ')) {
        const count = parseInt(lower.split(' ')[1]);
        if (!isNaN(count)) return { intent: INTENTS.CLEAR, confidence: 0.9, params: { count } };
    }

    // General Chat / Greetings
    const greetings = /^(?:hi|hello|hey|yo|greetings|morning|afternoon|evening|hola|hallo|ola|salut|howdy|sup|whats?up|heyy+)/i;
    if (greetings.test(lower) && lower.split(/\s+/).length < 5) {
        return { intent: INTENTS.GENERAL_CHAT, confidence: 0.95, params: {} };
    }

    // Edit image (needs attachment context)
    if (hasAttachment && /^(?:edit|modify|change|update|fix|add|remove)\s+/i.test(lower)) {
        const prompt = msg.replace(/^(?:edit|modify|change|update|fix)\s+(?:this\s+(?:image\s+)?)?(?:to\s+)?/i, '').trim();
        return { intent: INTENTS.EDIT_IMAGE, confidence: 0.88, params: { prompt } };
    }

    // Video generation
    if (/^(?:animate|make\s+(?:a\s+)?video|create\s+(?:a\s+)?video|turn\s+(?:this\s+)?(?:into\s+)?(?:a\s+)?video)/i.test(lower)) {
        const prompt = msg.replace(/^(?:animate|make\s+(?:a\s+)?video\s+(?:of\s+)?|create\s+(?:a\s+)?video\s+(?:of\s+)?|turn\s+(?:this\s+)?image\s+into\s+(?:a\s+)?video\s*(?:with\s+)?|turn\s+(?:this\s+)?(?:into\s+)?(?:a\s+)?video\s*(?:with\s+)?)/i, '').trim();
        return {
            intent: INTENTS.GENERATE_VIDEO,
            confidence: 0.88,
            params: { prompt: prompt || 'animate', workflow: hasAttachment ? 'i2v' : 't2v' },
        };
    }

    // 360
    if (/(?:360|turntable|spin\s+around|multi.?angle)/i.test(lower)) {
        const prompt = msg.replace(/(?:360|turntable|spin\s+around|multi.?angle)\s*(?:of\s+)?/i, '').trim();
        return {
            intent: INTENTS.ANGLES_360,
            confidence: 0.88,
            params: { prompt: prompt || 'turntable', make_video: /video|spin|rotate/i.test(lower) },
        };
    }

    // Reminder
    if (lower.startsWith('remind me ')) {
        return { intent: INTENTS.REMIND, confidence: 0.7, params: {} }; // Let AI extract properly
    }

    // Image generation
    const imgMatch = lower.match(/^(?:make|create|generate|draw|paint|design|render)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:image\s+(?:of\s+)?|picture\s+(?:of\s+)?|photo\s+(?:of\s+)?)?(.+?)(?:\s+image|\s+picture|\s+photo)?$/i);
    if (imgMatch) {
        const subject = imgMatch[1].trim();
        const isGeneric = /^(hello|hi|hey|please|thanks|help|stuff|thing|something)$/i.test(subject);
        if (subject.length > 3 && !isGeneric) {
            return { intent: INTENTS.GENERATE_IMAGE, confidence: 0.9, params: { prompt: subject } };
        }
    }

    return null;
}

/**
 * Get the suggested slash command for an intent.
 * @param {string} intent
 * @returns {string}
 */
function getSuggestedCommand(intent) {
    const map = {
        [INTENTS.GENERATE_IMAGE]: '/imagine prompt:<text>',
        [INTENTS.EDIT_IMAGE]: '/edit prompt:<text> image:<attachment>',
        [INTENTS.GENERATE_VIDEO]: '/video prompt:<text>',
        [INTENTS.ANGLES_360]: '/angles360 prompt:<text> image:<attachment>',
        [INTENTS.REMIND]: '/remind me:<text> when:<time>',
        [INTENTS.MEMORY_SAVE]: '/memory save key:<text> value:<text>',
        [INTENTS.MEMORY_GET]: '/memory get key:<text>',
        [INTENTS.BOT_STATUS]: '/bot-status',
        [INTENTS.BAN]: '/ban user:<user> reason:<text>',
        [INTENTS.KICK]: '/kick user:<user> reason:<text>',
        [INTENTS.TIMEOUT]: '/timeout user:<user> duration:<time>',
        [INTENTS.CLEAR]: '/clear count:<number>',
    };
    return map[intent] || '/help';
}

/**
 * Check if an action is "high cost" or sensitive and needs confirmation.
 * @param {string} intent
 * @returns {boolean}
 */
export function isHighCostAction(intent) {
    const sensitive = [
        INTENTS.GENERATE_IMAGE, INTENTS.EDIT_IMAGE,
        INTENTS.GENERATE_VIDEO, INTENTS.ANGLES_360,
        INTENTS.BAN, INTENTS.KICK, INTENTS.TIMEOUT, INTENTS.WARN,
        INTENTS.CLEAR, INTENTS.UNBAN, INTENTS.ROLE_MANAGE,
        INTENTS.LOCK, INTENTS.SLURS, INTENTS.RAID, INTENTS.AUTOMOD,
        INTENTS.GLOBAL_KILL
    ];
    return sensitive.includes(intent);
}

/**
 * Build a human-readable confirmation message for high-cost actions.
 * @param {ParsedIntent} parsed
 * @returns {string}
 */
export function buildConfirmation(parsed) {
    const p = parsed.params;
    const cmdMap = {
        [INTENTS.GENERATE_IMAGE]: `🎨 I'll generate an **image** with prompt: "${p.prompt}"`,
        [INTENTS.EDIT_IMAGE]: `✏️ I'll **edit** the image with prompt: "${p.prompt}"`,
        [INTENTS.GENERATE_VIDEO]: `🎬 I'll generate a **video** with prompt: "${p.prompt}"`,
        [INTENTS.ANGLES_360]: `🔄 I'll generate a **360° turntable**${p.make_video ? ' with video' : ''}: "${p.prompt}"`,
        [INTENTS.BAN]: `🔨 **BAN** user \`${p.user_id}\`${p.reason ? ` for: "${p.reason}"` : ''}?`,
        [INTENTS.KICK]: `👢 **KICK** user \`${p.user_id}\`${p.reason ? ` for: "${p.reason}"` : ''}?`,
        [INTENTS.TIMEOUT]: `⏳ **TIMEOUT** user \`${p.user_id}\` for **${p.duration || '10m'}**?`,
        [INTENTS.WARN]: `⚠️ **WARN** user \`${p.user_id}\`${p.reason ? ` for: "${p.reason}"` : ''}?`,
        [INTENTS.CLEAR]: `🧹 **CLEAR** ${p.count} messages from this channel?`,
        [INTENTS.LOCK]: `🔒 **LOCK** this channel?`,
        [INTENTS.RAID]: `🛡️ Change **Raid Protection** status to: \`${p.action}\`?`,
        [INTENTS.GLOBAL_KILL]: `💀 **EMERGENCY KILL** all bot instances?`,
    };
    return (cmdMap[parsed.intent] || `I'll execute action: **${parsed.intent}**`);
}
