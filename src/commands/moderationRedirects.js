/**
 * Moderation Prefix Command Redirects
 * 
 * Bridges legacy prefix commands (!) to the shared moderation handlers.
 */
import {
    handleRoleCommand,
    handleWebhookCommand,
    handleBanCommand,
    handleKickCommand,
    handleTimeoutCommand,
    handleWarnCommand,
    handleClearCommand,
    handleUnbanCommand
} from '../slashCommands/handlers.js';
import { moderationManager } from '../utils/moderationManager.js';
import { createErrorEmbed } from '../utils/messageFormatter.js';

/**
 * Build a response adapter from a Discord Message.
 * @param {import('discord.js').Message} message
 * @returns {import('../slashCommands/handlers.js').ResponseAdapter}
 */
function buildMessageAdapter(message) {
    return {
        userId: message.author.id,
        channelId: message.channel.id,
        guildId: message.guild.id,

        reply: async (msg) => message.reply(typeof msg === 'string' ? { content: msg } : msg),
        editReply: async (msg) => { /* Not applicable to messages in the same way */ },
        followUp: async (opts) => message.channel.send(typeof opts === 'string' ? { content: opts } : opts),
        sendInChannel: async (msg) => message.channel.send(typeof msg === 'string' ? { content: msg } : msg),
    };
}

export async function handlePrefixRole(message, args) {
    const adapter = buildMessageAdapter(message);
    const subcommand = args[0]?.toLowerCase();

    // Usage: !role add @user @role [reason]
    const user = message.mentions.members.first() || (args[1] ? await message.guild.members.fetch(args[1]).catch(() => null) : null);
    const role = message.mentions.roles.first() || (args[2] ? message.guild.roles.cache.get(args[2]) : null);

    const params = {
        subcommand,
        name: subcommand === 'create' ? args[1] : undefined,
        color: subcommand === 'create' ? args[2] : undefined,
        userId: user?.id,
        roleId: role?.id,
        reason: args.slice(subcommand === 'create' ? 3 : 3).join(' ') || 'No reason provided'
    };

    if (subcommand === 'delete') params.roleId = args[1]; // Overwrite for delete case

    await handleRoleCommand(params, adapter, { guild: message.guild, member: message.member });
}

export async function handlePrefixWebhook(message, args) {
    const adapter = buildMessageAdapter(message);
    const subcommand = args[0]?.toLowerCase();

    const params = {
        subcommand,
        name: subcommand === 'create' ? args[1] : undefined,
        channelId: message.mentions.channels.first()?.id,
        webhookId: subcommand !== 'create' ? args[1] : undefined,
        token: subcommand === 'execute' ? args[2] : undefined,
        content: subcommand === 'execute' ? args.slice(3).join(' ') : undefined,
        reason: args.slice(2).join(' ') || 'No reason provided'
    };

    await handleWebhookCommand(params, adapter, { guild: message.guild, member: message.member });
}

// ── Overwriting Legacy Moderation with standardized logic ─────

export async function handlePrefixBan(message, args) {
    const adapter = buildMessageAdapter(message);
    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply({ embeds: [createErrorEmbed('Failed', 'User not found.')] });

    const reason = args.slice(1).join(' ') || 'No reason provided';
    await handleBanCommand({ user: targetUser, reason }, adapter);
}

export async function handlePrefixKick(message, args) {
    const adapter = buildMessageAdapter(message);
    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply({ embeds: [createErrorEmbed('Failed', 'User not found.')] });

    const reason = args.slice(1).join(' ') || 'No reason provided';
    await handleKickCommand({ user: targetUser, reason }, adapter);
}

export async function handlePrefixTimeout(message, args) {
    const adapter = buildMessageAdapter(message);
    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply({ embeds: [createErrorEmbed('Failed', 'User not found.')] });

    const duration = args[1];
    const reason = args.slice(2).join(' ') || 'No reason provided';

    if (!duration) return message.reply({ embeds: [createErrorEmbed('Failed', 'Duration required (e.g. 10m, 1h).')] });

    await handleTimeoutCommand({ user: targetUser, duration, reason }, adapter);
}

export async function handlePrefixWarn(message, args) {
    const adapter = buildMessageAdapter(message);
    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply({ embeds: [createErrorEmbed('Failed', 'User not found.')] });

    const reason = args.slice(1).join(' ') || 'No reason provided';
    await handleWarnCommand({ user: targetUser, reason }, adapter);
}

export async function handlePrefixUnban(message, args) {
    const adapter = buildMessageAdapter(message);
    const userId = args[0];
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await handleUnbanCommand({ user_id: userId, reason }, adapter);
}
