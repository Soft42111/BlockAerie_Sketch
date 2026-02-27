/**
 * Natural Language Router
 *
 * Integrates with the existing chatHandler to route natural language
 * messages to the same shared handlers used by slash commands.
 *
 * Called from the chat handler when a user @mentions or replies to the bot.
 * If the message matches a known intent (image gen, video, remind, etc.),
 * it executes the handler directly. Otherwise, falls through to general chat.
 *
 * @module src/slashCommands/naturalLanguageRouter
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import {
    classifyIntent,
    INTENTS,
    isHighCostAction,
    buildConfirmation,
} from '../../packages/agent-core/index.js';
import {
    handleImagineCommand,
    handleEditCommand,
    handleVideoCommand,
    handleAngles360Command,
    handleRemindCommand,
    handleMemoryCommand,
    handleBotStatusCommand,
    handleBanCommand,
    handleKickCommand,
    handleTimeoutCommand,
    handleWarnCommand,
    handleClearCommand,
    handleUnbanCommand,
    handleReportCommand,
    handleNoteCommand,
    handleLockCommand,
    handleModLogCommand,
    handleAutoModCommand,
    handleRaidCommand,
    handleSlursCommand,
    handleAdminImmunityCommand,
    handleKillInstancesCommand,
} from './handlers.js';

/**
 * Build a response adapter from a Discord Message object.
 * @param {import('discord.js').Message} message
 * @returns {import('./handlers.js').ResponseAdapter}
 */
function buildMessageAdapter(message) {
    /** @type {import('discord.js').Message|null} */
    let statusMsg = null;

    return {
        userId: message.author.id,
        channelId: message.channel.id,
        guildId: message.guild?.id || '',

        reply: async (msg) => {
            statusMsg = await message.reply(typeof msg === 'string' ? { content: msg } : msg);
            return statusMsg;
        },
        editReply: async (msg) => {
            if (statusMsg) {
                return statusMsg.edit(typeof msg === 'string' ? { content: msg } : msg);
            }
            return message.reply(typeof msg === 'string' ? { content: msg } : msg);
        },
        followUp: async (opts) => {
            return message.channel.send(typeof opts === 'string' ? { content: opts } : opts);
        },
        sendInChannel: async (msg) => {
            return message.channel.send(typeof msg === 'string' ? { content: msg } : msg);
        },
    };
}

/**
 * Try to route a natural language message to a command handler.
 *
 * @param {import('discord.js').Message} message — the Discord message
 * @param {string} content — cleaned message text (mentions removed)
 * @param {import('discord.js').Client} client
 * @returns {Promise<boolean>} — true if handled (caller should stop), false if general chat
 */
export async function routeNaturalLanguage(message, content, client) {
    // Check for attachments (images) on current message
    let attachment = message.attachments.find(a => a.contentType?.startsWith('image/'));

    // If no attachment, check if it's a reply to a message with an image
    if (!attachment && message.reference) {
        try {
            const referencedMessage = await message.fetchReference();
            attachment = referencedMessage.attachments.find(a => a.contentType?.startsWith('image/'));
        } catch (err) {
            console.log('[NLRouter] Failed to fetch referenced message:', err.message);
        }
    }

    const hasAttachment = !!attachment;

    // Classify intent
    const parsed = await classifyIntent(content, hasAttachment);

    // Log for observability
    console.log(`[NLRouter] Intent: ${parsed.intent} (confidence: ${parsed.confidence}) for: "${content.substring(0, 80)}"`);

    // Stricter threshold for image generation (0.8) vs others (0.7) to prevent aggressive routing
    const threshold = parsed.intent === INTENTS.GENERATE_IMAGE ? 0.8 : 0.7;

    if (parsed.confidence < threshold && parsed.intent !== INTENTS.GENERAL_CHAT) {
        if (parsed.suggestedCommand) {
            await message.reply({
                content: `🤔 I'm not sure if you wanted to generate an image. Did you mean to use: \`${parsed.suggestedCommand}\`?\n\nOtherwise, I'll just chat with you!`,
            });
        }
        return false; // Fall through to general chat
    }

    // If it's general chat or unknown, fall through
    if (parsed.intent === INTENTS.GENERAL_CHAT || parsed.intent === INTENTS.UNKNOWN) {
        return false;
    }

    const adapter = buildMessageAdapter(message);

    // ── High-cost action confirmation ──────────────────────────────
    if (isHighCostAction(parsed.intent)) {
        const confirmEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('🔍 Confirmation Required')
            .setDescription(buildConfirmation(parsed));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('nl_confirm')
                .setLabel('Proceed')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('nl_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

        const confirmMsg = await message.reply({
            embeds: [confirmEmbed],
            components: [row]
        });

        try {
            const filter = (i) => ['nl_confirm', 'nl_cancel'].includes(i.customId) && i.user.id === message.author.id;
            const interaction = await confirmMsg.awaitMessageComponent({ filter, time: 30000 });

            if (interaction.customId === 'nl_cancel') {
                await interaction.update({ content: '🚫 **Cancelled.**', embeds: [], components: [] });
                return true;
            }

            // User confirmed
            await interaction.update({ content: '⚙️ **Processing request...**', embeds: [], components: [] });
            // Let the flow continue to the switch statement
        } catch (_) {
            await confirmMsg.edit({ content: '⏰ **Confirmation timed out. Cancelled.**', embeds: [], components: [] }).catch(() => { });
            return true;
        }
    }

    // ── Route to handler ───────────────────────────────────────────
    try {
        switch (parsed.intent) {
            case INTENTS.GENERATE_IMAGE:
                await handleImagineCommand(
                    { prompt: parsed.params.prompt, model: parsed.params.model },
                    adapter
                );
                return true;

            case INTENTS.EDIT_IMAGE:
                if (!attachment) {
                    await message.reply('🖼️ Please attach an image to edit, or reply to a message with an image.');
                    return true;
                }
                await handleEditCommand(
                    { prompt: parsed.params.prompt, imageUrl: attachment.url, model: parsed.params.model },
                    adapter
                );
                return true;

            case INTENTS.GENERATE_VIDEO:
                await handleVideoCommand(
                    {
                        prompt: parsed.params.prompt,
                        workflow: parsed.params.workflow,
                        refImageUrl: attachment?.url,
                        duration: parsed.params.duration,
                        fps: parsed.params.fps,
                    },
                    adapter
                );
                return true;

            case INTENTS.ANGLES_360:
                if (!attachment) {
                    await message.reply('🖼️ Please attach a subject image for 360° generation.');
                    return true;
                }
                await handleAngles360Command(
                    {
                        prompt: parsed.params.prompt,
                        imageUrl: attachment.url,
                        makeVideo: parsed.params.make_video || false,
                    },
                    adapter
                );
                return true;

            case INTENTS.REMIND:
                await handleRemindCommand(
                    { message: parsed.params.message, when: parsed.params.when },
                    adapter
                );
                return true;

            case INTENTS.MEMORY_SAVE:
                await handleMemoryCommand(
                    { action: 'save', key: parsed.params.key, value: parsed.params.value },
                    adapter
                );
                return true;

            case INTENTS.MEMORY_GET:
                await handleMemoryCommand(
                    { action: 'get', key: parsed.params.key },
                    adapter
                );
                return true;

            case INTENTS.BOT_STATUS:
                await handleBotStatusCommand({}, adapter, { client });
                return true;

            case INTENTS.BAN:
                await handleBanCommand({ user: { id: parsed.params.user_id }, reason: parsed.params.reason }, adapter);
                return true;

            case INTENTS.KICK:
                await handleKickCommand({ user: { id: parsed.params.user_id }, reason: parsed.params.reason }, adapter);
                return true;

            case INTENTS.TIMEOUT:
                await handleTimeoutCommand({ user: { id: parsed.params.user_id }, duration: parsed.params.duration, reason: parsed.params.reason }, adapter);
                return true;

            case INTENTS.WARN:
                await handleWarnCommand({ user: { id: parsed.params.user_id }, reason: parsed.params.reason }, adapter);
                return true;

            case INTENTS.CLEAR:
                await handleClearCommand({ count: parsed.params.count }, adapter);
                return true;

            case INTENTS.REPORT:
                await handleReportCommand({ user: { id: parsed.params.user_id }, reason: parsed.params.reason }, adapter);
                return true;

            case INTENTS.NOTE:
                await handleNoteCommand({ action: parsed.params.action, user: { id: parsed.params.user_id }, content: parsed.params.content }, adapter);
                return true;

            case INTENTS.LOCK:
                await handleLockCommand({}, adapter);
                return true;

            case INTENTS.RAID:
                await handleRaidCommand({ action: parsed.params.action }, adapter);
                return true;

            case INTENTS.GLOBAL_KILL:
                await handleKillInstancesCommand({}, adapter, { memberPermissions: message.member.permissions });
                return true;

            case INTENTS.UNBAN:
                await handleUnbanCommand({ user_id: parsed.params.user_id, reason: parsed.params.reason }, adapter);
                return true;

            case INTENTS.SLURS:
                await handleSlursCommand({ action: parsed.params.action, word: parsed.params.word }, adapter);
                return true;

            case INTENTS.AUTOMOD:
                await handleAutoModCommand({ action: parsed.params.action, rule_id: parsed.params.rule_id, threshold: parsed.params.threshold, action_type: parsed.params.action_type, duration: parsed.params.duration }, adapter);
                return true;

            case INTENTS.MODLOG:
                await handleModLogCommand({ channel: { id: parsed.params.channel_id } }, adapter);
                return true;
        }
    } catch (err) {
        console.error(`[NLRouter] Handler error for ${parsed.intent}:`, err);
        await message.reply(`❌ Something went wrong: ${err.message}`);
        return true;
    }

    return false;
}
