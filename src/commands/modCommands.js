import { PermissionFlagsBits, EmbedBuilder, Colors } from 'discord.js';
import { moderationSystem } from '../utils/moderationCore.js';
import { memberManager } from '../utils/memberManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/messageFormatter.js';

function parseDurationNaturalLanguage(input) {
    const patterns = [
        { regex: /(\d+)\s*(?:seconds?|secs?|s)\s*(?:for)?/i, multiplier: 1000 },
        { regex: /(\d+)\s*(?:minutes?|mins?|m)\s*(?:for)?/i, multiplier: 60 * 1000 },
        { regex: /(\d+)\s*(?:hours?|hrs?|h)\s*(?:for)?/i, multiplier: 60 * 60 * 1000 },
        { regex: /(\d+)\s*(?:days?|d)\s*(?:for)?/i, multiplier: 24 * 60 * 60 * 1000 },
        { regex: /(\d+)\s*(?:weeks?|wks?|w)\s*(?:for)?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
        { regex: /(\d+)\s*(?:months?|mos?|m)\s*(?:for)?/i, multiplier: 30 * 24 * 60 * 60 * 1000 }
    ];

    for (const { regex, multiplier } of patterns) {
        const match = input.match(regex);
        if (match) {
            return parseInt(match[1]) * multiplier;
        }
    }

    const standardMatch = input.match(/^(\d+)([smhdw])$/i);
    if (standardMatch) {
        const value = parseInt(standardMatch[1]);
        const unit = standardMatch[2].toLowerCase();
        const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
        return value * multipliers[unit];
    }

    return null;
}

function extractReason(args, startIndex = 0) {
    const reasonParts = args.slice(startIndex);
    return reasonParts.join(' ') || 'No reason provided';
}

async function checkPermissions(message, requiredPermission, commandName) {
    if (!message.member.permissions.has(requiredPermission)) {
        return { allowed: false, error: `You need **${requiredPermission.toLowerCase().replace(/([A-Z])/g, ' $1').trim()}** permission to use \`!${commandName}\`.` };
    }
    return { allowed: true };
}

function checkHierarchy(moderator, target) {
    if (moderator.id === target.id) {
        return { allowed: false, reason: 'You cannot moderate yourself.' };
    }
    if (target.id === target.guild.ownerId) {
        return { allowed: false, reason: 'Cannot moderate the server owner.' };
    }
    if (target.roles.highest.position >= moderator.roles.highest.position) {
        return { allowed: false, reason: 'Target has equal or higher role than you.' };
    }
    const botMember = target.guild.members.me;
    if (target.roles.highest.position >= botMember.roles.highest.position) {
        return { allowed: false, reason: 'Cannot moderate - target role is too high for me.' };
    }
    return { allowed: true };
}

export async function handleBan(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.BanMembers, 'ban');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!ban @user [duration] [reason]`\nDuration examples: `7d`, `24h`, `1w`, `permanent`\nReason examples: `spam`, `for 7 days`, `permanent ban`')] 
        });
    }

    const hierarchyCheck = checkHierarchy(message.member, target);
    if (!hierarchyCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)] });
    }

    let duration = null;
    let reason = extractReason(args, 1);
    let deleteMessages = '1d';

    const naturalDurationMatch = reason.match(/(?:for|ban(?:ned|ned for)?)\s*(\d+\s*(?:s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:our)?s?|d(?:ay)?s?|w(?:eek)?s?|month)s?)/i);
    if (naturalDurationMatch) {
        const extractedDuration = parseDurationNaturalLanguage(naturalDurationMatch[0]);
        if (extractedDuration) {
            duration = extractedDuration;
            reason = reason.replace(naturalDurationMatch[0], '').trim() || 'No reason provided';
        }
    } else {
        const standardDurationMatch = args.find(arg => /^\d+[smhdw]$/i.test(arg));
        if (standardDurationMatch) {
            duration = parseDurationNaturalLanguage(standardDurationMatch);
            reason = reason.replace(standardDurationMatch, '').trim() || 'No reason provided';
        }
    }

    const deleteMatch = reason.match(/delete(?:ed)?\s*(\d+)\s*(?:days?|d|hours?|h|minutes?|m|seconds?|s)?/i);
    if (deleteMatch) {
        const days = parseInt(deleteMatch[1]) || 7;
        deleteMessages = `${Math.min(days, 7)}d`;
        reason = reason.replace(deleteMatch[0], '').trim() || 'No reason provided';
    }

    if (reason.toLowerCase().includes('permanent') || reason.toLowerCase().includes('forever')) {
        duration = null;
        reason = reason.replace(/permanent(?:ly)?|forever/gi, '').trim() || 'No reason provided';
    }

    const result = await moderationSystem.ban(message.member, target, {
        reason,
        duration,
        deleteMessages
    });

    if (result.success) {
        const durationStr = duration ? moderationSystem.formatDuration(duration) : 'Permanent';
        return message.reply({ 
            embeds: [createSuccessEmbed('User Banned', `**Target:** ${target.user.tag}\n**Reason:** ${reason}\n**Duration:** ${durationStr}\n**Messages Deleted:** ${deleteMessages}\n**Case:** ${result.caseData.caseNumber}`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Ban Failed', result.error)] });
    }
}

export async function handleUnban(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.BanMembers, 'unban');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const userId = args[0];
    if (!userId || !/^\d{17,20}$/.test(userId)) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!unban <user_id> [reason]`')] });
    }

    const reason = extractReason(args, 1);
    const result = await moderationSystem.unban(message.member, message.guild, userId, reason);

    if (result.success) {
        return message.reply({ 
            embeds: [createSuccessEmbed('User Unbanned', `**User ID:** ${userId}\n**Reason:** ${reason}\n**Case:** ${result.caseData.caseNumber}`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Unban Failed', result.error)] });
    }
}

export async function handleKick(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.KickMembers, 'kick');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!kick @user [reason]`')] });
    }

    const hierarchyCheck = checkHierarchy(message.member, target);
    if (!hierarchyCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)] });
    }

    const reason = extractReason(args, 1);
    const result = await moderationSystem.kick(message.member, target, { reason });

    if (result.success) {
        return message.reply({ 
            embeds: [createSuccessEmbed('User Kicked', `**Target:** ${target.user.tag}\n**Reason:** ${reason}\n**Case:** ${result.caseData.caseNumber}`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Kick Failed', result.error)] });
    }
}

export async function handleMute(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ModerateMembers, 'mute');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!mute @user [duration] [reason]`\nDuration examples: `10m`, `1h`, `7d`, `1w`, `indefinite`')] 
        });
    }

    const hierarchyCheck = checkHierarchy(message.member, target);
    if (!hierarchyCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)] });
    }

    let duration = null;
    let reason = extractReason(args, 1);

    if (!reason.toLowerCase().includes('no reason')) {
        const naturalDurationMatch = reason.match(/(?:for|muted?)\s*(\d+\s*(?:s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:our)?s?|d(?:ay)?s?|w(?:eek)?s?))/i);
        if (naturalDurationMatch) {
            const extractedDuration = parseDurationNaturalLanguage(naturalDurationMatch[0]);
            if (extractedDuration) {
                duration = extractedDuration;
                reason = reason.replace(naturalDurationMatch[0], '').trim();
                if (!reason) reason = 'No reason provided';
            }
        } else {
            const standardDurationMatch = args.find(arg => /^\d+[smhdw]$/i.test(arg));
            if (standardDurationMatch) {
                duration = parseDurationNaturalLanguage(standardDurationMatch);
                reason = reason.replace(standardDurationMatch, '').trim() || 'No reason provided';
            }
        }
    }

    if (reason.toLowerCase().includes('indefinite') || reason.toLowerCase().includes('forever')) {
        duration = null;
        reason = reason.replace(/indefinite|forever/gi, '').trim() || 'No reason provided';
    }

    const result = await moderationSystem.mute(message.member, target, { reason, duration });

    if (result.success) {
        const durationStr = duration ? moderationSystem.formatDuration(duration) : 'Indefinite';
        return message.reply({ 
            embeds: [createSuccessEmbed('User Muted', `**Target:** ${target.user.tag}\n**Reason:** ${reason}\n**Duration:** ${durationStr}\n**Case:** ${result.caseData.caseNumber}`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Mute Failed', result.error)] });
    }
}

export async function handleUnmute(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ModerateMembers, 'unmute');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!unmute @user [reason]`')] });
    }

    const reason = extractReason(args, 1);
    const result = await moderationSystem.unmute(message.member, target, reason);

    if (result.success) {
        return message.reply({ 
            embeds: [createSuccessEmbed('User Unmuted', `**Target:** ${target.user.tag}\n**Reason:** ${reason}\n**Case:** ${result.caseData.caseNumber}`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Unmute Failed', result.error)] });
    }
}

export async function handleTimeout(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ModerateMembers, 'timeout');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!timeout @user <duration> [reason]`\nDuration examples: `10m`, `1h`, `7d`, `for 2 hours`')] 
        });
    }

    const hierarchyCheck = checkHierarchy(message.member, target);
    if (!hierarchyCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)] });
    }

    let duration = null;
    let durationArg = args[1];
    let reason = extractReason(args, 2);

    if (!durationArg) {
        const naturalDurationMatch = args.join(' ').match(/(?:for|timed? out?)\s*(\d+\s*(?:s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:our)?s?|d(?:ay)?s?|w(?:eek)?s?))/i);
        if (naturalDurationMatch) {
            duration = parseDurationNaturalLanguage(naturalDurationMatch[0]);
            reason = args.join(' ').replace(naturalDurationMatch[0], '').replace(/<@!?\d+>/, '').trim() || 'No reason provided';
        } else {
            return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Please provide a duration.\nUsage: `!timeout @user <duration> [reason]`')] });
        }
    } else {
        duration = parseDurationNaturalLanguage(durationArg);
        if (!duration) {
            return message.reply({ embeds: [createErrorEmbed('Invalid Duration', 'Invalid duration format. Use: `1s`, `1m`, `1h`, `1d`, `1w` or natural language like `for 2 hours`')] });
        }
    }

    if (duration > 28 * 24 * 60 * 60 * 1000) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Duration', 'Timeout cannot exceed 28 days.')] });
    }

    const result = await moderationSystem.timeout(message.member, target, duration, reason);

    if (result.success) {
        return message.reply({ 
            embeds: [createSuccessEmbed('User Timed Out', `**Target:** ${target.user.tag}\n**Duration:** ${moderationSystem.formatDuration(duration)}\n**Reason:** ${reason}\n**Case:** ${result.caseData.caseNumber}`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Timeout Failed', result.error)] });
    }
}

export async function handleUntimeout(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ModerateMembers, 'untimeout');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!untimeout @user [reason]`')] });
    }

    const reason = extractReason(args, 1);
    const result = await moderationSystem.untimeout(message.member, target, reason);

    if (result.success) {
        return message.reply({ 
            embeds: [createSuccessEmbed('Timeout Removed', `**Target:** ${target.user.tag}\n**Reason:** ${reason}\n**Case:** ${result.caseData.caseNumber}`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Untimeout Failed', result.error)] });
    }
}

export async function handleWarn(message, args) {
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!warn @user [reason]`')] });
    }

    const hierarchyCheck = checkHierarchy(message.member, target);
    if (!hierarchyCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)] });
    }

    const reason = extractReason(args, 1);
    const result = await moderationSystem.warn(message.member, target, reason);

    if (result.success) {
        let responseText = `**Target:** ${target.user.tag}\n**Reason:** ${reason}\n**Case:** ${result.caseData.caseNumber}\n**Total Warnings:** ${result.warnCount}`;
        
        if (result.autoAction?.executed) {
            const actionText = result.autoAction.action.charAt(0).toUpperCase() + result.autoAction.action.slice(1);
            responseText += `\n\n⚠️ **Auto-action triggered:** User was ${actionText}${result.autoAction.duration ? ` for ${moderationSystem.formatDuration(result.autoAction.duration)}` : ''}`;
        }

        return message.reply({ embeds: [createSuccessEmbed('User Warned', responseText)] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Warning Failed', result.error)] });
    }
}

export async function handleWarnings(message, args) {
    let target = message.mentions.members.first();
    
    if (!target && args[0]) {
        try {
            target = await message.guild.members.fetch(args[0]);
        } catch {
            return message.reply({ embeds: [createErrorEmbed('User Not Found', 'Could not find that user.')] });
        }
    }
    
    if (!target) target = message.member;

    const warnings = moderationSystem.getWarnings(message.guild.id, target.id);
    
    if (warnings.length === 0) {
        return message.reply({ embeds: [createInfoEmbed('Warnings', `${target.user.tag} has no warnings.`)] });
    }

    const warningList = warnings.map((w, i) => 
        `**#${i + 1}** • Case: ${w.caseNumber}\n📝 Reason: ${w.reason}\n📅 <t:${Math.floor(w.timestamp / 1000)}:R>\n👮 Moderator: ${w.moderatorTag}`
    ).join('\n\n');

    return message.reply({ 
        embeds: [createInfoEmbed(`Warnings for ${target.user.tag} (${warnings.length})`, warningList)] 
    });
}

export async function handleSoftban(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.BanMembers, 'softban');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!softban @user [reason]`')] });
    }

    const hierarchyCheck = checkHierarchy(message.member, target);
    if (!hierarchyCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)] });
    }

    const reason = extractReason(args, 1) || 'Softban - message cleanup';
    const result = await moderationSystem.softban(message.member, target, reason);

    if (result.success) {
        return message.reply({ 
            embeds: [createSuccessEmbed('User Softbanned', `**Target:** ${target.user.tag}\n**Reason:** ${reason}\n**Case:** ${result.caseData.caseNumber}\n\nNote: User can rejoin immediately.`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Softban Failed', result.error)] });
    }
}

export async function handleCase(message, args) {
    const caseNumber = args[0];
    if (!caseNumber) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!case <case_number>`')] });
    }

    const caseData = moderationSystem.getCase(caseNumber.startsWith('#') ? caseNumber : `#${caseNumber}`);
    
    if (!caseData) {
        return message.reply({ embeds: [createErrorEmbed('Case Not Found', 'No case found with that number.')] });
    }

    const actionColors = {
        ban: Colors.Red,
        unban: Colors.Green,
        kick: Colors.Orange,
        mute: Colors.Yellow,
        unmute: Colors.Green,
        timeout: Colors.Purple,
        untimeout: Colors.Green,
        warn: Colors.Orange,
        softban: Colors.Red
    };

    const caseEmbed = new EmbedBuilder()
        .setColor(actionColors[caseData.type] || Colors.Grey)
        .setTitle(`Case ${caseData.caseNumber}`)
        .addFields(
            { name: 'Action', value: caseData.type.toUpperCase(), inline: true },
            { name: 'Target', value: `${caseData.targetTag}`, inline: true },
            { name: 'Moderator', value: caseData.moderatorTag, inline: true },
            { name: 'Reason', value: caseData.reason || 'No reason provided' },
            { name: 'Date', value: `<t:${Math.floor(caseData.timestamp / 1000)}:F>` }
        )
        .setTimestamp(caseData.timestamp);

    if (caseData.duration) {
        caseEmbed.addFields({ name: 'Duration', value: caseData.duration, inline: true });
    }

    if (caseData.undone) {
        caseEmbed.addFields({ name: 'Status', value: `❌ Undone: ${caseData.undoReason}` });
    }

    return message.reply({ embeds: [caseEmbed] });
}

export async function handleModlog(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.Administrator, 'modlog');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const channel = message.mentions.channels.first();
    
    if (!channel) {
        const currentChannelId = moderationSystem.getLogChannel(message.guild.id);
        const currentChannel = currentChannelId ? `<#${currentChannelId}>` : 'Not set';
        return message.reply({ 
            embeds: [createInfoEmbed('Mod Log Channel', `Current: ${currentChannel}\n\nUsage: \`!modlog #channel\` to set the moderation log channel.`)] 
        });
    }

    moderationSystem.setLogChannel(message.guild.id, channel.id);
    return message.reply({ 
        embeds: [createSuccessEmbed('Log Channel Set', `Moderation logs will be sent to ${channel}`)] 
    });
}

export async function handleSlowmode(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
        const currentRateLimit = message.channel.rateLimitPerUser;
        return message.reply({ 
            embeds: [createInfoEmbed('Slowmode', `Current: ${currentRateLimit} seconds\n\nUsage: \`!slowmode <seconds>\`\nMax: 21600 seconds (6 hours)\nUse 0 to disable.`)] 
        });
    }

    await message.channel.setRateLimitPerUser(seconds);
    
    if (seconds === 0) {
        return message.reply({ embeds: [createSuccessEmbed('Slowmode Disabled', 'Slowmode has been disabled for this channel.')] });
    } else {
        return message.reply({ 
            embeds: [createSuccessEmbed('Slowmode Set', `Slowmode set to **${seconds} seconds** for this channel.`)] 
        });
    }
}

export async function handleLock(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const reason = extractReason(args) || 'Channel locked';
    
    await message.channel.permissionOverwrites.edit(message.guild.id, {
        SendMessages: false
    });

    const lockEmbed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('🔒 Channel Locked')
        .setDescription(reason)
        .setTimestamp();

    return message.reply({ embeds: [lockEmbed] });
}

export async function handleUnlock(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const reason = extractReason(args) || 'Channel unlocked';
    
    await message.channel.permissionOverwrites.edit(message.guild.id, {
        SendMessages: null
    });

    const unlockEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('🔓 Channel Unlocked')
        .setDescription(reason)
        .setTimestamp();

    return message.reply({ embeds: [unlockEmbed] });
}

export async function handlePurge(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ManageMessages, 'purge');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!purge <amount>`\nMax: 100 messages')] 
        });
    }

    const fetchedMessages = await message.channel.messages.fetch({ limit: amount + 1 });
    const messagesToDelete = fetchedMessages.filter(msg => !msg.pinned);
    
    const deletedCount = messagesToDelete.size;
    await message.channel.bulkDelete(messagesToDelete);

    return message.reply({ 
        embeds: [createSuccessEmbed('Messages Purged', `Deleted **${deletedCount}** messages from this channel.`)] 
    });
}

export async function handleClean(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ManageMessages, 'clean');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const amount = parseInt(args[0]) || 10;
    if (amount < 1 || amount > 100) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!clean <number>`\nMax: 100 messages')] 
        });
    }

    const fetchedMessages = await message.channel.messages.fetch({ limit: amount });
    const botMessages = fetchedMessages.filter(msg => msg.author.bot && !msg.pinned);
    
    const deletedCount = botMessages.size;
    await message.channel.bulkDelete(botMessages);

    return message.reply({ 
        embeds: [createSuccessEmbed('Bot Messages Cleaned', `Deleted **${deletedCount}** bot messages from this channel.`)] 
    });
}

export async function handleHistory(message, args) {
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!history @user`')] });
    }

    const history = memberManager.getHistory(target.id, message.guild.id, 50);
    
    if (history.length === 0) {
        return message.reply({ 
            embeds: [createInfoEmbed('Member History', `${target.user.tag} has no recorded history.`)] 
        });
    }

    const historyList = history.slice(0, 10).map((h, i) => {
        const actionEmoji = h.action.includes('ban') ? '🔨' : 
                           h.action.includes('kick') ? '🦶' : 
                           h.action.includes('mute') || h.action.includes('timeout') ? '🔇' : 
                           h.action.includes('warn') ? '⚠️' : 
                           h.action.includes('note') ? '📝' : '📋';
        return `**#${i + 1}** ${actionEmoji} ${h.action.replace(/_/g, ' ')}\n📅 <t:${Math.floor(h.timestamp / 1000)}:R>`;
    }).join('\n\n');

    return message.reply({ 
        embeds: [createInfoEmbed(`History for ${target.user.tag} (${history.length} entries)`, historyList)] 
    });
}

export async function handleNotes(message, args) {
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!notes @user`')] });
    }

    const notes = memberManager.getNotes(target.id, message.guild.id);
    
    if (notes.length === 0) {
        return message.reply({ 
            embeds: [createInfoEmbed('Member Notes', `${target.user.tag} has no notes.`)] 
        });
    }

    const notesList = notes.map((n, i) => {
        return `**#${n.id}** • ${n.type.toUpperCase()}\n📝 ${n.content}\n📅 <t:${Math.floor(n.timestamp / 1000)}:R>`;
    }).join('\n\n');

    return message.reply({ 
        embeds: [createInfoEmbed(`Notes for ${target.user.tag} (${notes.length})`, notesList)] 
    });
}

export async function handleStrike(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ModerateMembers, 'strike');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!strike @user <count> [reason]`')] });
    }

    const count = parseInt(args[1]);
    if (!count || count < 1 || count > 10) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!strike @user <count> [reason]`\nStrike count must be between 1 and 10.')] 
        ]);
    }

    const hierarchyCheck = checkHierarchy(message.member, target);
    if (!hierarchyCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)] });
    }

    const reason = extractReason(args, 2) || 'No reason provided';
    let totalStrikes = 0;

    for (let i = 0; i < count; i++) {
        const result = await moderationSystem.warn(message.member, target, `${reason} (Strike ${i + 1}/${count})`);
        if (result.success) {
            totalStrikes++;
        }
    }

    return message.reply({ 
        embeds: [createSuccessEmbed('Strikes Added', `**Target:** ${target.user.tag}\n**Strikes Added:** ${totalStrikes}\n**Reason:** ${reason}`)] 
    });
}

export async function handleStrikes(message, args) {
    let target = message.mentions.members.first();
    
    if (!target && args[0]) {
        try {
            target = await message.guild.members.fetch(args[0]);
        } catch {
            return message.reply({ embeds: [createErrorEmbed('User Not Found', 'Could not find that user.')] });
        }
    }
    
    if (!target) target = message.member;

    const warnings = moderationSystem.getWarnings(message.guild.id, target.id);
    const strikeCount = warnings.length;

    return message.reply({ 
        embeds: [createInfoEmbed('Strikes', `**${target.user.tag}** has **${strikeCount}** strike(s) (warnings).`)] 
    });
}

export async function handleMassmute(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ModerateMembers, 'massmute');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const role = message.mentions.roles.first();
    if (!role) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!massmute @role [duration]`')] 
        });
    }

    let duration = null;
    if (args[1]) {
        duration = parseDurationNaturalLanguage(args[1]);
        if (!duration) {
            return message.reply({ 
                embeds: [createErrorEmbed('Invalid Duration', 'Invalid duration format. Use: `1m`, `1h`, `1d`')] 
            });
        }
    }

    const reason = extractReason(args, 2) || 'Mass mute';
    const members = role.members.filter(m => !m.user.bot && m.moderatable);
    
    if (members.size === 0) {
        return message.reply({ embeds: [createInfoEmbed('Mass Mute', 'No mutable members found with that role.')] });
    }

    let muted = 0;
    let failed = 0;

    for (const member of members.values()) {
        const hierarchyCheck = checkHierarchy(message.member, member);
        if (!hierarchyCheck.allowed) {
            failed++;
            continue;
        }

        const result = await moderationSystem.mute(message.member, member, { reason, duration });
        if (result.success) {
            muted++;
        } else {
            failed++;
        }
    }

    return message.reply({ 
        embeds: [createSuccessEmbed('Mass Mute Complete', `**Role:** ${role.name}\n**Muted:** ${muted}\n**Failed:** ${failed}\n**Duration:** ${duration ? moderationSystem.formatDuration(duration) : 'Indefinite'}`)] 
    });
}

export async function handleMassban(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.BanMembers, 'massban');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const role = message.mentions.roles.first();
    if (!role) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!massban @role [reason]`')] 
        });
    }

    const reason = extractReason(args, 2) || 'Mass ban';
    const members = role.members.filter(m => !m.user.bot && m.bannable);
    
    if (members.size === 0) {
        return message.reply({ embeds: [createInfoEmbed('Mass Ban', 'No bannable members found with that role.')] });
    }

    let banned = 0;
    let failed = 0;

    for (const member of members.values()) {
        const hierarchyCheck = checkHierarchy(message.member, member);
        if (!hierarchyCheck.allowed) {
            failed++;
            continue;
        }

        const result = await moderationSystem.ban(message.member, member, { reason });
        if (result.success) {
            banned++;
        } else {
            failed++;
        }
    }

    return message.reply({ 
        embeds: [createSuccessEmbed('Mass Ban Complete', `**Role:** ${role.name}\n**Banned:** ${banned}\n**Failed:** ${failed}\n**Reason:** ${reason}`)] 
    });
}

export async function handleNoteAdd(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ModerateMembers, 'note add');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!note add @user <text>`')] 
        });
    }

    const noteContent = args.slice(1).join(' ');
    if (!noteContent) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Please provide note content.\nUsage: `!note add @user <text>`')] 
        });
    }

    const note = memberManager.addNote(message.guild.id, target.id, message.member.id, noteContent, 'general');

    return message.reply({ 
        embeds: [createSuccessEmbed('Note Added', `**Target:** ${target.user.tag}\n**Note ID:** ${note.id}\n**Content:** ${noteContent}`)] 
    });
}

export async function handleNoteList(message, args) {
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!note list @user`')] });
    }

    const notes = memberManager.getNotes(target.id, message.guild.id);
    
    if (notes.length === 0) {
        return message.reply({ 
            embeds: [createInfoEmbed('Notes', `${target.user.tag} has no notes.`)] 
        });
    }

    const notesList = notes.map((n, i) => {
        return `**#${n.id}** • <t:${Math.floor(n.timestamp / 1000)}:R>\n📝 ${n.content}`;
    }).join('\n\n');

    return message.reply({ 
        embeds: [createInfoEmbed(`Notes for ${target.user.tag} (${notes.length})`, notesList)] 
    });
}

export async function handleNoteDelete(message, args) {
    const permCheck = await checkPermissions(message, PermissionFlagsBits.ModerateMembers, 'note delete');
    if (!permCheck.allowed) {
        return message.reply({ embeds: [createErrorEmbed('Permission Denied', permCheck.error)] });
    }

    const noteId = parseInt(args[0]);
    if (!noteId) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!note delete <note_id>`')] 
        });
    }

    const target = message.mentions.members.first();
    const userId = target ? target.id : null;

    if (!userId) {
        const allNotes = JSON.parse(require('fs').readFileSync('./data/member_notes.json', 'utf8'));
        for (const [uid, notes] of Object.entries(allNotes.notes || {})) {
            const found = notes.find(n => n.id === noteId);
            if (found) {
                const result = memberManager.deleteNote(uid, noteId, message.member.id);
                if (result) {
                    return message.reply({ 
                        embeds: [createSuccessEmbed('Note Deleted', `Note **#${noteId}** has been deleted.`)] 
                    });
                }
            }
        }
        return message.reply({ embeds: [createErrorEmbed('Note Not Found', 'Could not find a note with that ID.')] });
    }

    const result = memberManager.deleteNote(userId, noteId, message.member.id);
    
    if (result) {
        return message.reply({ 
            embeds: [createSuccessEmbed('Note Deleted', `Note **#${noteId}** has been deleted.`)] 
        });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Note Not Found', 'Could not find that note for this user.')] });
    }
}

export const modCommands = {
    ban: handleBan,
    unban: handleUnban,
    kick: handleKick,
    mute: handleMute,
    unmute: handleUnmute,
    timeout: handleTimeout,
    untimeout: handleUntimeout,
    warn: handleWarn,
    warnings: handleWarnings,
    softban: handleSoftban,
    case: handleCase,
    modlog: handleModlog,
    slowmode: handleSlowmode,
    lock: handleLock,
    unlock: handleUnlock,
    purge: handlePurge,
    clean: handleClean,
    history: handleHistory,
    notes: handleNotes,
    strike: handleStrike,
    strikes: handleStrikes,
    massmute: handleMassmute,
    massban: handleMassban,
    'note-add': handleNoteAdd,
    'note-list': handleNoteList,
    'note-delete': handleNoteDelete
};
