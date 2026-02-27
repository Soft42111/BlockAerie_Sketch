/**
 * Shared Command Handlers
 *
 * Single logic path used by BOTH slash commands AND natural language intent routing.
 * Each handler takes a standardized params object and a response adapter.
 *
 * @module src/slashCommands/handlers
 */
import { generateImage, editImage, generateVideo, generate360, checkBalance } from '../../packages/sogni-wrapper/index.js';
import { saveUserMemory, getUserMemory, listUserMemory, deleteUserMemory } from '../../packages/memory/index.js';
import { createReminder, parseTime } from '../../packages/scheduler/index.js';
import { addToContext, getContext } from '../../packages/memory/index.js';
import { GoogleGenAI } from '@google/genai';
import { sharedConfig } from '../../packages/config/index.js';
import { generateDirectPrompt } from '../promptGenerator.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { splitMessage } from '../../packages/utils/discord-tools.js';
import { handleGeneratePfp } from '../commands/generatePfp.js';
import { handleKillInstances } from '../commands/killInstances.js';
import { handleHelp } from '../commands/helpCommand.js';
import { handleModGuide } from '../commands/modGuide.js';
import { handleReport } from '../commands/report.js';
import { handleNote } from '../commands/memberNotes.js';
import {
    handleBan, handleKick, handleTimeout, handleWarn,
    handleUnban, handleRemoveTimeout, handleWarnings, handleClearWarnings,
    handleModLogChannel, handleAutoModRule, handleRaidProtection,
    handleClear, handleLock, handleLockImmunity
} from '../commands/moderationCommands.js';
import { handleAddSlur, handleRemoveSlur, handleListSlurs } from '../commands/manageSlurs.js';
import { handleAdminImmunity } from '../commands/adminCommands.js';
import { handleModelStatus } from '../commands/utilityCommands.js';


const ai = new GoogleGenAI({ apiKey: sharedConfig.gemini.apiKey });

/**
 * Make a plain Map behave like a Discord.js Collection (which has .first())
 * @param {Map} map
 * @returns {Map}
 */
function collectionLike(map) {
    map.first = function () {
        return this.values().next().value;
    };
    return map;
}

/**
 * Helper to determine file extension from mime type
 * @param {string} mime 
 * @returns {string} extension with dot (e.g. .png, .jpg)
 */
function getExtensionFromMime(mime) {
    if (!mime) return '.png'; // default
    if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('gif')) return '.gif';
    return '.png';
}

/**
 * @typedef {Object} ResponseAdapter
 * @property {(msg: string) => Promise<any>} reply — initial reply
 * @property {(msg: string) => Promise<any>} editReply — edit the initial reply
 * @property {(opts: {content?: string, files?: any[]}) => Promise<any>} followUp — follow-up message
 * @property {(msg: string) => Promise<any>} sendInChannel — send in the source channel
 * @property {string} userId
 * @property {string} channelId
 * @property {string} guildId
 */

// ── /ask handler ─────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.prompt
 * @param {ResponseAdapter} res
 */
export async function handleAskCommand(params, res) {
    await res.reply('💭 Thinking...');

    try {
        // Get conversation context for this channel
        const context = getContext(res.channelId);

        const messages = [
            ...context.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
            { role: 'user', parts: [{ text: params.prompt }] },
        ];

        const response = await ai.models.generateContent({
            model: sharedConfig.gemini.model,
            contents: messages,
        });

        const reply = response.text || 'I couldn\'t generate a response.';

        // Save to context
        addToContext(res.channelId, 'user', params.prompt);
        addToContext(res.channelId, 'assistant', reply);

        // Discord has 2000 char limit
        if (reply.length > 1900) {
            await res.editReply(reply.substring(0, 1900) + '...');
            if (reply.length > 1900) {
                await res.followUp({ content: '...' + reply.substring(1900, 3800) });
            }
        } else {
            await res.editReply(reply);
        }
    } catch (err) {
        console.error('[Handler:ask] Error:', err.message);
        await res.editReply(`❌ AI error: ${err.message}`);
    }
}

// ── /imagine handler ─────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} [params.model]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @param {number} [params.count]
 * @param {ResponseAdapter} res
 */
export async function handleImagineCommand(params, res) {
    await res.reply('🎨 **Architecting Visual Mastery...**');

    try {
        // Enhance prompt via Gemini
        let enhancedPrompt;
        try {
            enhancedPrompt = await generateDirectPrompt(params.prompt);
        } catch (_) {
            enhancedPrompt = params.prompt; // Fallback to raw prompt
        }

        await res.editReply(`🎨 **Generating:** \`${enhancedPrompt.substring(0, 100)}${enhancedPrompt.length > 100 ? '...' : ''}\`...`);

        const result = await generateImage({
            prompt: enhancedPrompt,
            model: params.model,
            width: params.width,
            height: params.height,
            count: params.count,
        });

        const statusText = `✅ **Generated Mastery**\n🤖 Model: \`${result.model || 'default'}\`\n\n**Blueprint:**\n${enhancedPrompt}`;
        const chunks = splitMessage(statusText);

        // Send all chunks
        for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
                await res.editReply(chunks[i]);
            } else {
                await res.followUp({ content: chunks[i] });
            }
        }

        // Final Image — Separate message without prompt text as requested
        const imageSource = result.url || result.output;
        if (imageSource) {
            await res.followUp({ files: [imageSource] });
        }
    } catch (err) {
        console.error('[Handler:imagine] Error:', err.message);
        await res.editReply(`❌ Generation failed: ${err.message}`);
    }
}

// ── /edit handler ────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.imageUrl — URL of the attached image
 * @param {string} [params.model]
 * @param {ResponseAdapter} res
 */
export async function handleEditCommand(params, res) {
    await res.reply('✏️ **Preparing edit...**');

    try {
        // Download attachment to temp file
        const tmpDir = path.join(os.tmpdir(), 'blockaerie-edit');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const response = await fetch(params.imageUrl);
        const contentType = response.headers.get('content-type');
        const ext = getExtensionFromMime(contentType);
        const tmpPath = path.join(tmpDir, `edit_${Date.now()}${ext}`);

        const fileStream = fs.createWriteStream(tmpPath);
        await pipeline(response.body, fileStream);

        await res.editReply('✏️ **Applying edit...**');

        const result = await editImage({
            prompt: params.prompt,
            contextPath: tmpPath,
            model: params.model,
        });

        await res.editReply(`✅ **Edit complete:** \`${params.prompt}\``);

        const imageSource = result.url || result.output;
        if (imageSource) {
            await res.followUp({ files: [imageSource] });
        }

        // Cleanup temp file
        fs.unlink(tmpPath, () => { });
    } catch (err) {
        console.error('[Handler:edit] Error:', err.message);
        await res.editReply(`❌ Edit failed: ${err.message}`);
    }
}

// ── /video handler ───────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} [params.workflow]
 * @param {string} [params.refImageUrl]
 * @param {number} [params.duration]
 * @param {number} [params.fps]
 * @param {ResponseAdapter} res
 */
export async function handleVideoCommand(params, res) {
    await res.reply('🎬 **Queued for video generation...**');

    try {
        let refImagePath = null;

        // Download ref image if provided
        if (params.refImageUrl) {
            const tmpDir = path.join(os.tmpdir(), 'blockaerie-video');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const response = await fetch(params.refImageUrl);
            const contentType = response.headers.get('content-type');
            const ext = getExtensionFromMime(contentType);

            refImagePath = path.join(tmpDir, `ref_${Date.now()}${ext}`);
            const fileStream = fs.createWriteStream(refImagePath);
            await pipeline(response.body, fileStream);
        }

        await res.editReply('🎬 **Generating video...** This may take a few minutes.');

        const result = await generateVideo({
            prompt: params.prompt,
            workflow: params.workflow,
            refImage: refImagePath,
            duration: params.duration,
            fps: params.fps,
        });

        await res.editReply(`✅ **Video generated:** \`${params.prompt}\``);

        const videoSource = result.url || result.output;
        if (videoSource) {
            // Check file size for Discord limits (25MB for non-Nitro)
            try {
                if (videoSource.startsWith('http')) {
                    await res.followUp({ files: [videoSource] });
                } else {
                    const stats = fs.statSync(videoSource);
                    if (stats.size > 25 * 1024 * 1024) {
                        await res.followUp({ content: `📎 Video too large for Discord. Download: ${videoSource}` });
                    } else {
                        await res.followUp({ files: [videoSource] });
                    }
                }
            } catch (_) {
                await res.followUp({ files: [videoSource] });
            }
        }

        // Cleanup
        if (refImagePath) fs.unlink(refImagePath, () => { });
    } catch (err) {
        console.error('[Handler:video] Error:', err.message);
        await res.editReply(`❌ Video generation failed: ${err.message}`);
    }
}

// ── /angles360 handler ───────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.imageUrl
 * @param {boolean} [params.makeVideo]
 * @param {ResponseAdapter} res
 */
export async function handleAngles360Command(params, res) {
    await res.reply('🔄 **Starting 360° multi-angle generation...**');

    try {
        // Download subject image
        const tmpDir = path.join(os.tmpdir(), 'blockaerie-360');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const response = await fetch(params.imageUrl);
        const contentType = response.headers.get('content-type');
        const ext = getExtensionFromMime(contentType);

        const subjectPath = path.join(tmpDir, `subject_${Date.now()}${ext}`);
        const videoPath = params.makeVideo ? path.join(tmpDir, `360_${Date.now()}.mp4`) : undefined;

        const fileStream = fs.createWriteStream(subjectPath);
        await pipeline(response.body, fileStream);

        await res.editReply('🔄 **Generating 8 angles...**');

        const result = await generate360({
            prompt: params.prompt,
            contextPath: subjectPath,
            makeVideo: params.makeVideo || false,
            outputVideoPath: videoPath,
        });

        if (result.partial) {
            await res.editReply(`⚠️ **360° Partial Success:** Images generated, but video assembly failed (${result.error}).`);
        } else {
            await res.editReply('✅ **360° generation complete!**');
        }

        // Send angle images
        if (result.images && result.images.length > 0) {
            const files = result.images.slice(0, 10); // Discord max 10 attachments
            await res.followUp({ content: '📸 **Angle images:**', files });
        }

        // Send video if generated
        if (result.videoPath || videoPath) {
            const vPath = result.videoPath || videoPath;
            if (fs.existsSync(vPath)) {
                await res.followUp({ content: '🎥 **360° Loop:**', files: [vPath] });
            }
        }

        // Cleanup
        fs.unlink(subjectPath, () => { });
        if (videoPath && fs.existsSync(videoPath)) fs.unlink(videoPath, () => { });
    } catch (err) {
        console.error('[Handler:angles360] Error:', err.message);
        await res.editReply(`❌ 360° generation failed: ${err.message}`);
    }
}

// ── /remind handler ──────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.message
 * @param {string} params.when — natural language or ISO time
 * @param {ResponseAdapter} res
 */
export async function handleRemindCommand(params, res) {
    const fireAt = parseTime(params.when);

    if (!fireAt) {
        await res.reply(`❌ Couldn't understand the time: "${params.when}"\n💡 Try: "in 5 minutes", "tomorrow at 9am", or an ISO date.`);
        return;
    }

    if (fireAt <= new Date()) {
        await res.reply('❌ That time is in the past! Please set a future time.');
        return;
    }

    try {
        const reminder = createReminder({
            userId: res.userId,
            channelId: res.channelId,
            guildId: res.guildId || '',
            message: params.message,
            fireAt,
        });

        const timeStr = fireAt.toLocaleString();
        await res.reply(`⏰ **Reminder set!**\n📝 "${params.message}"\n🕐 **When:** ${timeStr}\n🆔 Reminder #${reminder.id}`);
    } catch (err) {
        console.error('[Handler:remind] Error:', err.message);
        await res.reply(`❌ Failed to set reminder: ${err.message}`);
    }
}

// ── /memory handler ──────────────────────────────────────────────

/**
 * @param {object} params
 * @param {'save'|'get'|'list'|'delete'} params.action
 * @param {string} [params.key]
 * @param {string} [params.value]
 * @param {ResponseAdapter} res
 */
export async function handleMemoryCommand(params, res) {
    try {
        switch (params.action) {
            case 'save':
                saveUserMemory(res.userId, params.key, params.value);
                await res.reply(`💾 **Saved:** \`${params.key}\` = \`${params.value}\``);
                break;

            case 'get': {
                const value = getUserMemory(res.userId, params.key);
                if (value !== null) {
                    await res.reply(`🧠 **${params.key}:** \`${value}\``);
                } else {
                    await res.reply(`❓ No memory found for key \`${params.key}\`. Use \`/memory save\` to store one.`);
                }
                break;
            }

            case 'list': {
                const memories = listUserMemory(res.userId);
                if (memories.length === 0) {
                    await res.reply('🧠 You have no saved memories yet. Use `/memory save key:<key> value:<value>` to store one.');
                } else {
                    const list = memories.map(m => `• **${m.key}:** \`${m.value}\``).join('\n');
                    await res.reply(`🧠 **Your Memories:**\n${list}`);
                }
                break;
            }

            case 'delete': {
                const deleted = deleteUserMemory(res.userId, params.key);
                if (deleted) {
                    await res.reply(`🗑️ **Deleted:** \`${params.key}\``);
                } else {
                    await res.reply(`❓ No memory found for key \`${params.key}\`.`);
                }
                break;
            }
        }
    } catch (err) {
        console.error('[Handler:memory] Error:', err.message);
        await res.reply(`❌ Memory operation failed: ${err.message}`);
    }
}

// ── /bot-status handler ──────────────────────────────────────────

/**
 * @param {object} _params — (unused)
 * @param {ResponseAdapter} res
 * @param {{ client: import('discord.js').Client }} extra
 */
export async function handleBotStatusCommand(_params, res, extra = {}) {
    try {
        const uptime = process.uptime();
        const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
        const memUsage = process.memoryUsage();
        const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);

        let balanceInfo = '';
        try {
            const bal = await checkBalance();
            if (bal.success) {
                balanceInfo = `\n💰 SPARK: ${bal.spark || 'N/A'} | SOGNI: ${bal.sogni || 'N/A'}`;
            }
        } catch (_) {
            balanceInfo = '\n💰 Balance: unavailable';
        }

        const guilds = extra.client ? extra.client.guilds.cache.size : '?';

        await res.reply(
            `📊 **Bot Status**\n` +
            `🟢 **Status:** Online\n` +
            `⏱️ **Uptime:** ${uptimeStr}\n` +
            `🖥️ **Memory:** ${memMB} MB\n` +
            `🌐 **Servers:** ${guilds}\n` +
            `🤖 **AI Model:** \`${sharedConfig.gemini.model}\`\n` +
            `🎨 **Image Model:** \`${sharedConfig.sogniGen.defaultImageModel}\`` +
            balanceInfo
        );
    } catch (err) {
        console.error('[Handler:bot-status] Error:', err.message);
        await res.reply(`❌ Status check failed: ${err.message}`);
    }
}
// ── /generate-pfp handler ───────────────────────────────────────

/**
 * @param {object} _params
 * @param {ResponseAdapter} res
 */
export async function handleGeneratePfpCommand(_params, res) {
    // Create a mock message object for compatibility
    const mockMessage = {
        author: { id: res.userId },
        channel: {
            id: res.channelId,
            send: (opts) => res.sendInChannel(opts)
        },
        reply: (opts) => res.reply(opts),
        member: { permissions: { has: () => true } } // Permissions checked at interaction level
    };

    await handleGeneratePfp(mockMessage);
}

// ── /kill-instances handler ──────────────────────────────────────

/**
 * @param {object} _params
 * @param {ResponseAdapter} res
 */
export async function handleKillInstancesCommand(_params, res, extra = {}) {
    // Create a mock message object for compatibility
    const mockMessage = {
        author: { id: res.userId },
        channel: {
            id: res.channelId,
            send: (opts) => res.sendInChannel(opts)
        },
        reply: (opts) => res.reply(opts),
        member: { permissions: { has: (perm) => extra.memberPermissions?.has(perm) || false } }
    };

    await handleKillInstances(mockMessage);
}

// ── Utility Handlers ─────────────────────────────────────────────

export async function handleHelpCommand(_params, res) {
    const mockMessage = {
        author: { id: res.userId },
        channel: { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: { id: res.guildId },
        member: { permissions: { has: () => true } }
    };
    await handleHelp(mockMessage);
}

export async function handlePingCommand(_params, res, extra = {}) {
    const latency = extra.interaction ? Date.now() - extra.interaction.createdTimestamp : 'unknown';
    await res.reply(`Pong! 🏓 Latency: ${latency}ms`);
}

export async function handleModGuideCommand(_params, res) {
    const mockMessage = {
        author: { id: res.userId },
        channel: { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts)
    };
    await handleModGuide(mockMessage);
}

export async function handleReportCommand(params, res) {
    const mockMessage = {
        author: { id: res.userId },
        channel: { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: { users: collectionLike(new Map([[params.user.id, params.user]])), members: collectionLike(new Map([[params.user.id, params.user]])) },
        guild: { id: res.guildId }
    };
    await handleReport(mockMessage, [params.user.id, params.reason]);
}

export async function handleNoteCommand(params, res) {
    const mockMessage = {
        author: { id: res.userId },
        channel: { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: { users: collectionLike(new Map([[params.user.id, params.user]])), members: collectionLike(new Map([[params.user.id, params.user]])) }
    };
    if (params.action === 'add') {
        await handleNote(mockMessage, [params.user.id, ...params.content.split(' ')]);
    } else {
        await handleNote(mockMessage, [params.user.id]);
    }
}

// ── Moderation Handlers ──────────────────────────────────────────

export async function handleUntimeoutCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: { members: collectionLike(new Map([[params.user.id, params.user]])) },
        member: extra.member || { permissions: { has: () => true } },
        guild: extra.guild || { id: res.guildId }
    };
    await handleRemoveTimeout(mockMessage, [params.reason]);
}

export async function handleWarningsCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: { members: collectionLike(new Map(params.user ? [[params.user.id, params.user]] : [])) },
        member: extra.member || { permissions: { has: () => true } },
        guild: extra.guild || { id: res.guildId }
    };
    if (params.action === 'list') {
        await handleWarnings(mockMessage, params.user ? [params.user.id] : []);
    } else {
        await handleClearWarnings(mockMessage, [params.user.id]);
    }
}

export async function handleLockCommand(_params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    await handleLock(mockMessage);
}

export async function handleLockImmunityCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId, roles: { cache: { get: (id) => id === params.role.id ? params.role : null } } },
        mentions: { roles: collectionLike(new Map([[params.role.id, params.role]])) },
        member: extra.member || { permissions: { has: () => true } }
    };
    await handleLockImmunity(mockMessage, [params.role.id]);
}

/**
 * @param {object} params
 * @param {'create'|'add'|'remove'|'delete'} params.subcommand
 * @param {ResponseAdapter} res
 * @param {import('discord.js').ChatInputCommandInteraction} [interaction]
 */
export async function handleRoleCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    await handleRoleCommandV2(params, res, mockMessage.guild, mockMessage.member);
}

/**
 * @param {object} params
 * @param {'create'|'delete'|'execute'} params.subcommand
 * @param {ResponseAdapter} res
 */
export async function handleWebhookCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    await handleWebhookCommandV2(params, res, mockMessage.guild, mockMessage.member);
}

// Internal version that uses direct objects
async function handleRoleCommandV2(params, res, guild, moderator) {
    // Ported from moderationHandlers.js
    const { subcommand, name, color, userId, roleId, reason } = params;
    try {
        const { moderationManager } = await import('../utils/moderationManager.js');
        const { createErrorEmbed, createSuccessEmbed } = await import('../utils/messageFormatter.js');

        switch (subcommand) {
            case 'create': {
                const result = await moderationManager.createRole(moderator, guild, {
                    name,
                    color: color ? parseInt(color.replace('#', ''), 16) : undefined,
                    reason
                });
                if (result.success) {
                    await res.reply({ embeds: [createSuccessEmbed('Role Created', `Successfully created role **${result.role.name}**\n**Case ID:** ${result.caseId}`)] });
                } else {
                    await res.reply({ embeds: [createErrorEmbed('Failed', result.error)] });
                }
                break;
            }
            case 'delete': {
                const result = await moderationManager.deleteRole(moderator, guild, roleId, reason);
                if (result.success) {
                    await res.reply({ embeds: [createSuccessEmbed('Role Deleted', `Successfully deleted role ID: \`${roleId}\`\n**Case ID:** ${result.caseId}`)] });
                } else {
                    await res.reply({ embeds: [createErrorEmbed('Failed', result.error)] });
                }
                break;
            }
            case 'add': {
                if (!guild.members) throw new Error('Guild member cache is not available (guild.members undefined)');
                const target = await guild.members.fetch(userId).catch(() => null);
                const role = guild.roles.cache.get(roleId);
                if (!target) return res.reply({ embeds: [createErrorEmbed('Failed', 'User not found')] });
                if (!role) return res.reply({ embeds: [createErrorEmbed('Failed', 'Role not found')] });

                const result = await moderationManager.addRoleToMember(moderator, target, role, reason);
                if (result.success) {
                    await res.reply({ embeds: [createSuccessEmbed('Role Added', `Successfully added **${role.name}** to **${target.user.tag}**\n**Case ID:** ${result.caseId}`)] });
                } else {
                    await res.reply({ embeds: [createErrorEmbed('Failed', result.error)] });
                }
                break;
            }
            case 'remove': {
                if (!guild.members) throw new Error('Guild member cache is not available (guild.members undefined)');
                const target = await guild.members.fetch(userId).catch(() => null);
                const role = guild.roles.cache.get(roleId);
                if (!target) return res.reply({ embeds: [createErrorEmbed('Failed', 'User not found')] });
                if (!role) return res.reply({ embeds: [createErrorEmbed('Failed', 'Role not found')] });

                const result = await moderationManager.removeRoleFromMember(moderator, target, role, reason);
                if (result.success) {
                    await res.reply({ embeds: [createSuccessEmbed('Role Removed', `Successfully removed **${role.name}** from **${target.user.tag}**\n**Case ID:** ${result.caseId}`)] });
                } else {
                    await res.reply({ embeds: [createErrorEmbed('Failed', result.error)] });
                }
                break;
            }
            // ... add others if needed, but these cover the basics
        }
    } catch (err) {
        await res.reply({ content: `❌ Role operation failed: ${err.message}` });
    }
}

async function handleWebhookCommandV2(params, res, guild, moderator) {
    // Ported from moderationHandlers.js
    const { subcommand, name, channelId, webhookId, token, content, reason } = params;
    try {
        const { moderationManager } = await import('../utils/moderationManager.js');
        const { createErrorEmbed, createSuccessEmbed } = await import('../utils/messageFormatter.js');

        switch (subcommand) {
            case 'create': {
                if (!guild.channels) throw new Error('Guild channel cache is not available (guild.channels undefined)');
                const channel = await guild.channels.fetch(channelId).catch(() => null);
                if (!channel) return res.reply({ embeds: [createErrorEmbed('Failed', 'Channel not found')] });

                const result = await moderationManager.createWebhook(moderator, channel, { name, reason });
                if (result.success) {
                    await res.reply({ embeds: [createSuccessEmbed('Webhook Created', `Successfully created webhook **${result.webhook.name}** in <#${channel.id}>\n**Case ID:** ${result.caseId}`)] });
                } else {
                    await res.reply({ embeds: [createErrorEmbed('Failed', result.error)] });
                }
                break;
            }
            case 'execute': {
                const webhook = await guild.client.fetchWebhook(webhookId, token).catch(() => null);
                if (!webhook) return res.reply({ embeds: [createErrorEmbed('Failed', 'Invalid Webhook ID or Token')] });
                await webhook.send({ content });
                await res.reply({ embeds: [createSuccessEmbed('Executed', 'Webhook executed successfully.')] });
                break;
            }
            // ... add others
        }
    } catch (err) {
        await res.reply({ content: `❌ Webhook operation failed: ${err.message}` });
    }
}

/**
 * @param {object} params
 * @param {import('discord.js').User|{id:string}} params.user
 * @param {string} [params.reason]
 * @param {number} [params.delete_messages]
 * @param {ResponseAdapter} res
 */
export async function handleBanCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: {
            members: collectionLike(new Map([[params.user.id, params.user]])),
            users: collectionLike(new Map([[params.user.id, params.user]]))
        },
        member: extra.member || { permissions: { has: () => true } },
        guild: extra.guild || { id: res.guildId }
    };
    await handleBan(mockMessage, [params.user.id, params.reason, params.delete_messages?.toString()]);
}

/**
 * @param {object} params
 * @param {import('discord.js').User|{id:string}} params.user
 * @param {string} [params.reason]
 * @param {ResponseAdapter} res
 */
export async function handleKickCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: { members: collectionLike(new Map([[params.user.id, params.user]])) },
        member: extra.member || { permissions: { has: () => true } },
        guild: extra.guild || { id: res.guildId }
    };
    await handleKick(mockMessage, [params.user.id, params.reason]);
}

/**
 * @param {object} params
 * @param {import('discord.js').User|{id:string}} params.user
 * @param {string} params.duration
 * @param {string} [params.reason]
 * @param {ResponseAdapter} res
 */
export async function handleTimeoutCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: { members: collectionLike(new Map([[params.user.id, params.user]])) },
        member: extra.member || { permissions: { has: () => true } },
        guild: extra.guild || { id: res.guildId }
    };
    await handleTimeout(mockMessage, [params.user.id, params.duration, params.reason]);
}

/**
 * @param {object} params
 * @param {import('discord.js').User|{id:string}} params.user
 * @param {string} [params.reason]
 * @param {ResponseAdapter} res
 */
export async function handleWarnCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: { members: collectionLike(new Map([[params.user.id, params.user]])) },
        member: extra.member || { permissions: { has: () => true } },
        guild: extra.guild || { id: res.guildId }
    };
    await handleWarn(mockMessage, [params.user.id, params.reason]);
}

// ── Administration Handlers ──────────────────────────────────────

export async function handleModLogCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        mentions: { channels: collectionLike(new Map(params.channel ? [[params.channel.id, params.channel]] : [])) },
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    await handleModLogChannel(mockMessage, params.channel ? [params.channel.id] : []);
}

export async function handleAutoModCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    if (params.action === 'list') {
        await handleAutoModRule(mockMessage, ['list']);
    } else if (params.action === 'add') {
        await handleAutoModRule(mockMessage, ['add', 'warns', params.threshold.toString(), params.action_type, params.duration]);
    } else {
        await handleAutoModRule(mockMessage, ['remove', params.rule_id]);
    }
}

export async function handleRaidCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    if (params.action === 'status') {
        await handleRaidProtection(mockMessage, []);
    } else if (params.action === 'on' || params.action === 'off') {
        await handleRaidProtection(mockMessage, [params.action]);
    } else {
        await handleRaidProtection(mockMessage, ['config', params.threshold.toString(), params.seconds.toString()]);
    }
}

export async function handleSlursCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    if (params.action === 'list') {
        await handleListSlurs(mockMessage);
    } else if (params.action === 'add') {
        await handleAddSlur(mockMessage, [params.word]);
    } else {
        await handleRemoveSlur(mockMessage, [params.word]);
    }
}

export async function handleAdminImmunityCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    await handleAdminImmunity(mockMessage, [params.enabled ? 'on' : 'off']);
}

/**
 * @param {object} params
 * @param {number} params.count
 * @param {ResponseAdapter} res
 */
export async function handleClearCommand(params, res, extra = {}) {
    const channel = extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) };
    const mockMessage = {
        author: { id: res.userId },
        channel,
        reply: (opts) => res.reply(opts),
        delete: async () => { },  // Slash command message can't be deleted
        member: extra.member || { permissions: { has: () => true } },
        guild: extra.guild || { id: res.guildId }
    };
    await handleClear(mockMessage, [params.count.toString()]);
}

/**
 * @param {object} params
 * @param {string} params.user_id
 * @param {string} [params.reason]
 * @param {ResponseAdapter} res
 */
export async function handleUnbanCommand(params, res, extra = {}) {
    const mockMessage = {
        author: { id: res.userId },
        channel: extra.channel || { id: res.channelId, send: (opts) => res.sendInChannel(opts) },
        reply: (opts) => res.reply(opts),
        guild: extra.guild || { id: res.guildId },
        member: extra.member || { permissions: { has: () => true } }
    };
    await handleUnban(mockMessage, [params.user_id, params.reason]);
}

// End of unified handlers
