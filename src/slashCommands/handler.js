/**
 * Slash Command Interaction Handler
 *
 * Routes Discord interactions to shared command handlers.
 * Wired into the bot via a single `client.on('interactionCreate', ...)` line.
 *
 * @module src/slashCommands/handler
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import {
    handleAskCommand,
    handleImagineCommand,
    handleEditCommand,
    handleVideoCommand,
    handleAngles360Command,
    handleRemindCommand,
    handleMemoryCommand,
    handleBotStatusCommand,
    handleGeneratePfpCommand,
    handleKillInstancesCommand,
    handleHelpCommand,
    handlePingCommand,
    handleModGuideCommand,
    handleReportCommand,
    handleNoteCommand,
    handleUntimeoutCommand,
    handleWarningsCommand,
    handleLockCommand,
    handleLockImmunityCommand,
    handleAutoModCommand,
    handleRaidCommand,
    handleSlursCommand,
    handleAdminImmunityCommand,
    handleRoleCommand,
    handleWebhookCommand,
    handleBanCommand,
    handleKickCommand,
    handleTimeoutCommand,
    handleWarnCommand,
    handleClearCommand,
    handleUnbanCommand,
} from './handlers.js';
import { moderationManager } from '../utils/moderationManager.js';
import { handleSafetyCommand } from '../commands/safetyCommands.js';
import { handleServerCommand } from '../commands/serverCommands.js';
import { handleLevelCommand } from '../commands/levelCommands.js';
import { handleLoggingCommand } from '../commands/loggingCommands.js';
import performanceMonitor from '../utils/performanceMonitor.js';
import { pendingGenManager } from '../utils/pendingGenManager.js';
import { executeGeneration } from '../chatHandler.js';

/** Per-user cooldown map: userId -> last command timestamp */
const cooldowns = new Map();
const COOLDOWN_MS = 3000;

/**
 * Build a response adapter from a Discord ChatInputCommandInteraction.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {import('./handlers.js').ResponseAdapter}
 */
function buildAdapter(interaction) {
    return {
        userId: interaction.user.id,
        channelId: interaction.channelId,
        guildId: interaction.guildId || '',

        reply: async (msg) => {
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply(typeof msg === 'string' ? { content: msg } : msg);
            }
            return interaction.reply(typeof msg === 'string' ? { content: msg } : msg);
        },
        editReply: async (msg) => interaction.editReply(typeof msg === 'string' ? { content: msg } : msg),
        followUp: async (opts) => interaction.followUp(typeof opts === 'string' ? { content: opts } : opts),
        sendInChannel: async (msg) => {
            const channel = interaction.channel;
            if (channel) return channel.send(typeof msg === 'string' ? { content: msg } : msg);
        },
    };
}

/**
 * Handle all slash command interactions.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleInteraction(interaction, client) {
    if (interaction.isButton()) {
        const [prefix, action, genId] = interaction.customId.split('_');
        if (prefix !== 'gen') return;

        const data = pendingGenManager.get(genId);
        if (!data) {
            return interaction.reply({ content: '❌ This confirmation has expired or is invalid.', ephemeral: true });
        }

        if (interaction.user.id !== data.userId) {
            return interaction.reply({ content: '❌ Only the requester can confirm this generation.', ephemeral: true });
        }

        if (action === 'cancel') {
            pendingGenManager.remove(genId);
            return interaction.update({ content: '🚫 **Generation cancelled.**', embeds: [], components: [] });
        }

        if (action === 'confirm') {
            pendingGenManager.remove(genId);
            await interaction.update({ content: '⚙️ **Initializing render...**', embeds: [], components: [] });

            const adapter = {
                userId: interaction.user.id,
                channelId: interaction.channelId,
                guildId: interaction.guildId || '',
                reply: async (msg) => interaction.followUp(typeof msg === 'string' ? { content: msg } : msg),
                editReply: async (msg) => interaction.editReply(typeof msg === 'string' ? { content: msg } : msg),
                followUp: async (opts) => interaction.followUp(typeof opts === 'string' ? { content: opts } : opts),
                sendInChannel: async (msg) => interaction.channel?.send(typeof msg === 'string' ? { content: msg } : msg)
            };

            await executeGeneration(data, adapter);
            return;
        }
    }

    if (!interaction.isChatInputCommand()) return;

    // ── Per-user cooldown ──────────────────────────────────────────
    const userId = interaction.user.id;
    const now = Date.now();
    const lastUsed = cooldowns.get(userId) || 0;
    if (now - lastUsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 1000);
        return interaction.reply({
            content: `⏳ Cooldown: please wait ${remaining}s before using another command.`,
            ephemeral: true,
        });
    }
    cooldowns.set(userId, now);

    // ── Global Deferral ──────────────────────────────────────────
    // Every command is potentially long-running (AI, API, etc.)
    // Defer immediately to prevent "Application did not respond" errors.
    const isEphemeral = ['report'].includes(interaction.commandName);
    await interaction.deferReply({ ephemeral: isEphemeral });

    const adapter = buildAdapter(interaction);
    const commandName = interaction.commandName;

    const cmdStart = Date.now();
    try {
        switch (commandName) {
            case 'ask':
                await handleAskCommand(
                    { prompt: interaction.options.getString('prompt') },
                    adapter
                );
                break;

            case 'imagine':
                await handleImagineCommand(
                    {
                        prompt: interaction.options.getString('prompt'),
                        model: interaction.options.getString('model'),
                        width: interaction.options.getInteger('width'),
                        height: interaction.options.getInteger('height'),
                        count: interaction.options.getInteger('count'),
                    },
                    adapter
                );
                break;

            case 'edit': {
                const attachment = interaction.options.getAttachment('image');
                await handleEditCommand(
                    {
                        prompt: interaction.options.getString('prompt'),
                        imageUrl: attachment?.url,
                        model: interaction.options.getString('model'),
                    },
                    adapter
                );
                break;
            }

            case 'video': {
                const refImage = interaction.options.getAttachment('ref_image');
                await handleVideoCommand(
                    {
                        prompt: interaction.options.getString('prompt'),
                        workflow: interaction.options.getString('workflow'),
                        refImageUrl: refImage?.url,
                        duration: interaction.options.getInteger('duration'),
                        fps: interaction.options.getInteger('fps'),
                    },
                    adapter
                );
                break;
            }

            case 'angles360': {
                const img = interaction.options.getAttachment('image');
                await handleAngles360Command(
                    {
                        prompt: interaction.options.getString('prompt'),
                        imageUrl: img?.url,
                        makeVideo: interaction.options.getBoolean('make_video') || false,
                    },
                    adapter
                );
                break;
            }

            case 'remind':
                await handleRemindCommand(
                    {
                        message: interaction.options.getString('me'),
                        when: interaction.options.getString('when'),
                    },
                    adapter
                );
                break;

            case 'memory': {
                const subcommand = interaction.options.getSubcommand();
                await handleMemoryCommand(
                    {
                        action: subcommand,
                        key: interaction.options.getString('key'),
                        value: interaction.options.getString('value'),
                    },
                    adapter
                );
                break;
            }

            case 'bot-status':
                await handleBotStatusCommand({}, adapter, { client });
                break;

            case 'generate-pfp':
            case 'pfp':
                await handleGeneratePfpCommand({}, adapter);
                break;

            case 'kill-instances':
                await handleKillInstancesCommand({}, adapter, { memberPermissions: interaction.member.permissions });
                break;

            // ── Moderation Commands ───────────────────────────────────

            case 'ban': {
                await handleBanCommand(
                    {
                        user: interaction.options.getUser('user'),
                        reason: interaction.options.getString('reason') || 'No reason provided',
                        delete_messages: interaction.options.getInteger('delete_messages') || 0,
                    },
                    adapter,
                    { guild: interaction.guild, member: interaction.member, channel: interaction.channel }
                );
                break;
            }

            case 'kick': {
                await handleKickCommand(
                    {
                        user: interaction.options.getUser('user'),
                        reason: interaction.options.getString('reason') || 'No reason provided',
                    },
                    adapter,
                    { guild: interaction.guild, member: interaction.member, channel: interaction.channel }
                );
                break;
            }

            case 'timeout': {
                await handleTimeoutCommand(
                    {
                        user: interaction.options.getUser('user'),
                        duration: interaction.options.getString('duration'),
                        reason: interaction.options.getString('reason') || 'No reason provided',
                    },
                    adapter,
                    { guild: interaction.guild, member: interaction.member, channel: interaction.channel }
                );
                break;
            }

            case 'warn': {
                await handleWarnCommand(
                    {
                        user: interaction.options.getUser('user'),
                        reason: interaction.options.getString('reason') || 'No reason provided',
                    },
                    adapter,
                    { guild: interaction.guild, member: interaction.member, channel: interaction.channel }
                );
                break;
            }

            case 'clear': {
                await handleClearCommand(
                    {
                        count: interaction.options.getInteger('count'),
                    },
                    adapter,
                    { guild: interaction.guild, member: interaction.member, channel: interaction.channel }
                );
                break;
            }

            case 'unban': {
                await handleUnbanCommand(
                    {
                        user_id: interaction.options.getString('user_id'),
                        reason: interaction.options.getString('reason') || 'No reason provided',
                    },
                    adapter,
                    { guild: interaction.guild, member: interaction.member, channel: interaction.channel }
                );
                break;
            }

            // ── Automation & Roles ────────────────────────────────────

            case 'role': {
                const subcommand = interaction.options.getSubcommand();
                const params = {
                    subcommand,
                    name: interaction.options.getString('name'),
                    color: interaction.options.getString('color'),
                    userId: interaction.options.getUser('user')?.id,
                    roleId: interaction.options.getRole('role')?.id,
                    reason: interaction.options.getString('reason') || 'No reason provided'
                };
                // Pass as extra object to match the parameter signature in handlers.js
                await handleRoleCommand(params, adapter, { guild: interaction.guild, member: interaction.member });
                break;
            }

            case 'webhook': {
                const subcommand = interaction.options.getSubcommand();
                const params = {
                    subcommand,
                    name: interaction.options.getString('name'),
                    channelId: interaction.options.getChannel('channel')?.id,
                    webhookId: interaction.options.getString('id'),
                    token: interaction.options.getString('token'),
                    content: interaction.options.getString('content'),
                    reason: interaction.options.getString('reason') || 'No reason provided'
                };
                await handleWebhookCommand(params, adapter, { guild: interaction.guild, member: interaction.member });
                break;
            }

            // ── New Unified Commands ──────────────────────────────────

            case 'help':
                await handleHelpCommand({}, adapter);
                break;

            case 'ping':
                await handlePingCommand({}, adapter, { interaction });
                break;

            case 'mod-guide':
                await handleModGuideCommand({}, adapter);
                break;

            case 'report':
                await handleReportCommand({
                    user: interaction.options.getUser('user'),
                    reason: interaction.options.getString('reason')
                }, adapter);
                break;

            case 'note':
                await handleNoteCommand({
                    action: interaction.options.getSubcommand(),
                    user: interaction.options.getUser('user'),
                    content: interaction.options.getString('content')
                }, adapter);
                break;

            case 'untimeout':
                await handleUntimeoutCommand({
                    user: interaction.options.getUser('user'),
                    reason: interaction.options.getString('reason')
                }, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'warnings':
                await handleWarningsCommand({
                    action: interaction.options.getSubcommand(),
                    user: interaction.options.getUser('user')
                }, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'lock':
                await handleLockCommand({}, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'lock-immunity':
                await handleLockImmunityCommand({
                    role: interaction.options.getRole('role')
                }, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'modlog':
                await handleModLogCommand({
                    channel: interaction.options.getChannel('channel')
                }, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'automod':
                await handleAutoModCommand({
                    action: interaction.options.getSubcommand(),
                    threshold: interaction.options.getInteger('threshold'),
                    action_type: interaction.options.getString('action'),
                    duration: interaction.options.getString('duration'),
                    rule_id: interaction.options.getString('rule_id')
                }, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'raid':
                await handleRaidCommand({
                    action: interaction.options.getSubcommand(),
                    threshold: interaction.options.getInteger('threshold'),
                    seconds: interaction.options.getInteger('seconds')
                }, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'slurs':
                await handleSlursCommand({
                    action: interaction.options.getSubcommand(),
                    word: interaction.options.getString('word')
                }, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'admin-immunity':
                await handleAdminImmunityCommand({
                    enabled: interaction.options.getBoolean('enabled')
                }, adapter, { guild: interaction.guild, member: interaction.member, channel: interaction.channel });
                break;

            case 'safety':
                await handleSafetyCommand({
                    subcommandGroup: interaction.options.getSubcommandGroup(),
                    subcommand: interaction.options.getSubcommand(),
                    user: interaction.options.getUser('user'),
                    role: interaction.options.getRole('role'),
                    scanner: interaction.options.getBoolean('scanner')
                }, adapter);
                break;

            case 'server':
                await handleServerCommand({
                    subcommandGroup: interaction.options.getSubcommandGroup(),
                    subcommand: interaction.options.getSubcommand(),
                    backupId: interaction.options.getString('id')
                }, adapter, interaction.guild);
                break;

            case 'rank':
                await handleLevelCommand({
                    commandName: 'rank',
                    user: interaction.options.getUser('user')
                }, adapter, interaction.guild);
                break;

            case 'leaderboard':
                await handleLevelCommand({
                    commandName: 'leaderboard'
                }, adapter, interaction.guild);
                break;

            case 'logging':
                await handleLoggingCommand({
                    subcommand: interaction.options.getSubcommand()
                }, adapter, interaction.guild);
                break;

            default:
                await adapter.reply(`❓ Unknown command: ${commandName}`);
        }
        performanceMonitor.trackCommandExecution(commandName, Date.now() - cmdStart, { userId: interaction.user.id });
    } catch (err) {
        performanceMonitor.trackCommandExecution(commandName, Date.now() - cmdStart, { success: false, error: err.message, userId: interaction.user.id });
        console.error(`[SlashHandler] Error in /${commandName}:`, err);
        const reply = { content: `❌ An error occurred: ${err.message}`, ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(reply).catch(() => { });
        } else {
            await interaction.reply(reply).catch(() => { });
        }
    }
}
