import { moderationManager } from '../utils/moderationManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/messageFormatter.js';
import { PermissionFlagsBits } from 'discord.js';

export async function handleBan(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Ban Members** permission to use this command.')] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!ban @user [reason]`')] });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const result = await moderationManager.ban(message.member, target, { reason });

    if (result.success) {
        return await message.reply({
            embeds: [createSuccessEmbed('User Banned', `Successfully banned ${target.user.tag}\n**Reason:** ${reason}\n**Case ID:** ${result.caseId}`)]
        });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Ban Failed', result.error)] });
    }
}

export async function handleKick(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Kick Members** permission to use this command.')] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!kick @user [reason]`')] });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const result = await moderationManager.kick(message.member, target, reason);

    if (result.success) {
        return await message.reply({
            embeds: [createSuccessEmbed('User Kicked', `Successfully kicked ${target.user.tag}\n**Reason:** ${reason}\n**Case ID:** ${result.caseId}`)]
        });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Kick Failed', result.error)] });
    }
}

export async function handleTimeout(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Moderate Members** permission to use this command.')] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!timeout @user <duration> [reason]`\nDuration format: `1d`, `2h`, `30m`, `60s`')] });
    }

    const durationStr = args[1];
    if (!durationStr) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Please provide a duration.\nUsage: `!timeout @user <duration> [reason]`')] });
    }

    const durationMs = moderationManager.parseDuration(durationStr);
    if (!durationMs) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Duration', 'Invalid duration format. Use: `1d`, `2h`, `30m`, `60s`')] });
    }

    // Max timeout is 28 days
    if (durationMs > 28 * 24 * 60 * 60 * 1000) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Duration', 'Timeout cannot exceed 28 days.')] });
    }

    const reason = args.slice(2).join(' ') || 'No reason provided';
    const result = await moderationManager.timeout(message.member, target, durationMs, reason);

    if (result.success) {
        return await message.reply({
            embeds: [createSuccessEmbed('User Timed Out', `Successfully timed out ${target.user.tag}\n**Duration:** ${moderationManager.formatDuration(durationMs)}\n**Reason:** ${reason}\n**Case ID:** ${result.caseId}`)]
        });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Timeout Failed', result.error)] });
    }
}

export async function handleRemoveTimeout(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Moderate Members** permission to use this command.')] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!unmute @user [reason]`')] });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const result = await moderationManager.removeTimeout(message.member, target, reason);

    if (result.success) {
        return await message.reply({
            embeds: [createSuccessEmbed('Timeout Removed', `Successfully removed timeout from ${target.user.tag}\n**Reason:** ${reason}\n**Case ID:** ${result.caseId}`)]
        });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Failed', result.error)] });
    }
}

export async function handleWarn(message, args) {
    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!warn @user [reason]`')] });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const result = await moderationManager.warn(message.member, target, reason);

    if (result.success) {
        let responseText = `Successfully warned ${target.user.tag}\n**Reason:** ${reason}\n**Case ID:** ${result.caseId}\n**Total Warnings:** ${result.warnCount}`;

        if (result.autoAction.executed) {
            responseText += `\n\n⚠️ **Auto-action triggered:** User was ${result.autoAction.action}${result.autoAction.duration ? ` for ${moderationManager.formatDuration(result.autoAction.duration)}` : ''}`;
        }

        return await message.reply({ embeds: [createSuccessEmbed('User Warned', responseText)] });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Warning Failed', result.error)] });
    }
}

export async function handleWarnings(message, args) {
    let target = message.mentions.members.first();
    if (!target && args[0]) {
        // Try to fetch by ID
        try {
            target = await message.guild.members.fetch(args[0]);
        } catch {
            return await message.reply({ embeds: [createErrorEmbed('User Not Found', 'Could not find user.')] });
        }
    }

    if (!target) target = message.member;

    const warnings = moderationManager.getWarnings(message.guild.id, target.id);

    if (warnings.length === 0) {
        return await message.reply({ embeds: [createInfoEmbed('Warnings', `${target.user.tag} has no warnings.`)] });
    }

    const warningList = warnings.map((w, i) =>
        `**#${i + 1}** - Case: ${w.id}\nReason: ${w.reason}\nDate: <t:${Math.floor(w.timestamp / 1000)}:R>`
    ).join('\n\n');

    return await message.reply({
        embeds: [createInfoEmbed(`Warnings for ${target.user.tag} (${warnings.length})`, warningList)]
    });
}

export async function handleClearWarnings(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Moderate Members** permission to use this command.')] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!clearwarnings @user`')] });
    }

    const result = moderationManager.clearWarnings(message.member, message.guild.id, target.id);

    if (result.success) {
        return await message.reply({
            embeds: [createSuccessEmbed('Warnings Cleared', `Successfully cleared all warnings for ${target.user.tag}`)]
        });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Failed', result.error)] });
    }
}

export async function handleUnban(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Ban Members** permission to use this command.')] });
    }

    const userId = args[0];
    if (!userId || !/^\d{17,20}$/.test(userId)) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!unban <user_id> [reason]`')] });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const result = await moderationManager.unban(message.member, message.guild, userId, reason);

    if (result.success) {
        return await message.reply({
            embeds: [createSuccessEmbed('User Unbanned', `Successfully unbanned user\n**ID:** ${userId}\n**Reason:** ${reason}\n**Case ID:** ${result.caseId}`)]
        });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Unban Failed', result.error)] });
    }
}

export async function handleModLogChannel(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Administrator** permission to use this command.')] });
    }

    const channel = message.mentions.channels.first();
    if (!channel) {
        const currentChannel = moderationManager.data.logChannelId ? `<#${moderationManager.data.logChannelId}>` : 'Not set';
        return await message.reply({
            embeds: [createInfoEmbed('Mod Log Channel', `Current: ${currentChannel}\n\nUsage: \`!modlog #channel\``)]
        });
    }

    moderationManager.setLogChannel(message.guild.id, channel.id);
    return await message.reply({
        embeds: [createSuccessEmbed('Log Channel Set', `Moderation logs will be sent to ${channel}`)]
    });
}

export async function handleAutoModRule(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Administrator** permission to use this command.')] });
    }

    const subcommand = args[0]?.toLowerCase();

    if (!subcommand || subcommand === 'list') {
        const rules = moderationManager.data.autoModRules;
        if (rules.length === 0) {
            return await message.reply({ embeds: [createInfoEmbed('Auto-Mod Rules', 'No rules configured.\n\nUsage: `!automod add <warns> <threshold> <action> [duration]`')] });
        }

        const ruleList = rules.map(r =>
            `${r.enabled ? '✅' : '❌'} **${r.id}** - ${r.threshold}+ warns → ${r.action}${r.duration ? ` (${moderationManager.formatDuration(r.duration)})` : ''}`
        ).join('\n');

        return await message.reply({ embeds: [createInfoEmbed('Auto-Mod Rules', ruleList)] });
    }

    if (subcommand === 'add') {
        const trigger = args[1];
        const threshold = parseInt(args[2]);
        const action = args[3];
        const durationStr = args[4];

        if (!trigger || !threshold || !action) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!automod add warns <threshold> <action> [duration]`\nActions: timeout, kick, ban\nDuration (for timeout): 1d, 2h, 30m')]
            });
        }

        const rule = {
            trigger,
            threshold,
            action,
            duration: durationStr ? moderationManager.parseDuration(durationStr) : null,
            enabled: true
        };

        const created = moderationManager.addAutoModRule(message.guild.id, rule);
        return await message.reply({
            embeds: [createSuccessEmbed('Rule Added', `Auto-mod rule created!\n**ID:** ${created.id}\n**Trigger:** ${threshold}+ warnings\n**Action:** ${action}${rule.duration ? `\n**Duration:** ${durationStr}` : ''}`)]
        });
    }

    if (subcommand === 'remove') {
        const ruleId = args[1];
        if (!ruleId) {
            return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!automod remove <rule_id>`')] });
        }

        const result = moderationManager.removeAutoModRule(message.guild.id, ruleId);
        if (result) {
            return await message.reply({ embeds: [createSuccessEmbed('Rule Removed', 'Auto-mod rule removed successfully.')] });
        } else {
            return await message.reply({ embeds: [createErrorEmbed('Not Found', 'Rule ID not found.')] });
        }
    }

    return await message.reply({ embeds: [createErrorEmbed('Invalid Subcommand', 'Available: `list`, `add`, `remove`')] });
}

export async function handleRaidProtection(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Administrator** permission to use this command.')] });
    }

    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
        const config = moderationManager.data.raidProtection;
        const status = config.enabled ? '✅ Enabled' : '❌ Disabled';
        return await message.reply({
            embeds: [createInfoEmbed('Raid Protection',
                `Status: ${status}\n` +
                `Join Threshold: ${config.joinThreshold} users\n` +
                `Time Window: ${config.timeWindow / 1000}s\n` +
                `Action: ${config.action}\n\n` +
                `Usage: \`!raid on/off\` or \`!raid config <threshold> <seconds>\``
            )]
        });
    }

    if (subcommand === 'on' || subcommand === 'enable') {
        moderationManager.setRaidProtection(message.guild.id, true);
        return await message.reply({ embeds: [createSuccessEmbed('Raid Protection Enabled', 'Raid protection is now active.')] });
    }

    if (subcommand === 'off' || subcommand === 'disable') {
        moderationManager.setRaidProtection(message.guild.id, false);
        return await message.reply({ embeds: [createSuccessEmbed('Raid Protection Disabled', 'Raid protection is now disabled.')] });
    }

    if (subcommand === 'config') {
        const threshold = parseInt(args[1]);
        const seconds = parseInt(args[2]);

        if (!threshold || !seconds) {
            return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!raid config <threshold> <seconds>`')] });
        }

        moderationManager.setRaidProtection(message.guild.id, true, { joinThreshold: threshold, timeWindow: seconds * 1000 });
        return await message.reply({
            embeds: [createSuccessEmbed('Raid Protection Configured',
                `Threshold: ${threshold} users\n` +
                `Time Window: ${seconds} seconds`
            )]
        });
    }

    return await message.reply({ embeds: [createErrorEmbed('Invalid Subcommand', 'Available: `on`, `off`, `config`')] });
}

/**
 * Clear/purge messages from the channel
 * Usage: !clear <number>
 */
export async function handleClear(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Messages** permission to use this command.')] });
    }

    const count = parseInt(args[0]);

    if (!count || isNaN(count)) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!clear <number>`\nExample: `!clear 10`')] });
    }

    if (count < 1 || count > 100) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Count', 'Please provide a number between 1 and 100.')] });
    }

    try {
        // Delete the command message first
        await message.delete().catch(() => { });

        // Fetch and delete messages (+1 to account for command message if still exists)
        const deleted = await message.channel.bulkDelete(count, true);

        // Send confirmation (auto-delete after 3 seconds)
        const confirmMsg = await message.channel.send({
            embeds: [createSuccessEmbed('Messages Cleared', `🗑️ Successfully deleted **${deleted.size}** messages.`)]
        });

        setTimeout(() => confirmMsg.delete().catch(() => { }), 3000);

    } catch (error) {
        console.error('[Clear] Error:', error.message);
        return await message.channel.send({
            embeds: [createErrorEmbed('Clear Failed', `Failed to delete messages: ${error.message}\n\nNote: Cannot delete messages older than 14 days.`)]
        });
    }
}

/**
 * Toggle lock for the current channel
 * Usage: !lock
 */
export async function handleLock(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Administrator** permission to use this command.')] });
    }

    const isLocked = moderationManager.toggleLock(message.guild.id, message.channel.id);

    if (isLocked) {
        return await message.reply({
            embeds: [createSuccessEmbed('Channel Locked', `🔒 This channel has been locked. Only admins and immune roles can send messages.`)]
        });
    } else {
        return await message.reply({
            embeds: [createSuccessEmbed('Channel Unlocked', `🔓 This channel has been unlocked. Everyone can send messages again.`)]
        });
    }
}

/**
 * Toggle lock immunity for a role
 * Usage: !lock-immunity @role
 */
export async function handleLockImmunity(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need **Administrator** permission to use this command.')] });
    }

    const role = message.mentions.roles.first() || (args[0] ? message.guild.roles.cache.get(args[0]) : null);

    if (!role) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!lock-immunity @role` or `!lock-immunity <role_id>`')] });
    }

    const isImmune = moderationManager.toggleLockImmunity(message.guild.id, role.id);

    if (isImmune) {
        return await message.reply({
            embeds: [createSuccessEmbed('Immunity Granted', `✨ Members with the **${role.name}** role are now immune to channel locks.`)]
        });
    } else {
        return await message.reply({
            embeds: [createSuccessEmbed('Immunity Removed', `🚫 Members with the **${role.name}** role are no longer immune to channel locks.`)]
        });
    }
}
