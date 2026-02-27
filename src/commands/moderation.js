import { 
    EmbedBuilder, 
    Colors, 
    PermissionFlagsBits 
} from 'discord.js';
import { moderationSystem } from '../utils/moderationCore.js';

const MODERATOR_ROLE_NAME = 'Moderator';

async function checkModeratorPermission(message, requireRole = true) {
    if (message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return { allowed: true, reason: 'Administrator' };
    }
    
    if (requireRole) {
        const modRole = message.guild.roles.cache.find(r => 
            r.name.toLowerCase() === MODERATOR_ROLE_NAME.toLowerCase()
        );
        
        if (modRole && message.member.roles.cache.has(modRole.id)) {
            return { allowed: true, reason: 'Moderator role' };
        }
        
        if (message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return { allowed: true, reason: 'Moderate Members permission' };
        }
    }
    
    return { allowed: false, reason: 'Moderator role or permission required' };
}

function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(`${title}`)
        .setDescription(description)
        .setTimestamp();
}

function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle(`${title}`)
        .setDescription(description)
        .setTimestamp();
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`${title}`)
        .setDescription(description)
        .setTimestamp();
}

export async function handleBan(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                `Usage: \`!ban @user [duration] [reason]\`\n` +
                `Examples:\n` +
                ` - \`!ban @user\` - Permanent ban\n` +
                ` - \`!ban @user 7d\` - Ban for 7 days\n` +
                ` - \`!ban @user Violation of rules\``)] 
        });
    }
    
    let duration = null;
    let reasonStartIndex = 1;
    
    const durationMatch = args[1]?.match(/^\d+[smhdw]$/i);
    if (durationMatch) {
        duration = args[1];
        reasonStartIndex = 2;
    }
    
    const reason = args.slice(reasonStartIndex).join(' ') || 'No reason provided';
    const evidence = extractEvidence(args);
    
    const result = await moderationSystem.ban(message.member, target, {
        reason,
        duration,
        evidence
    });
    
    if (result.success) {
        const dmStatus = 'DM sent';
        
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('User Banned')
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
                { name: 'User', value: `${target.user.tag}\n(${target.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Case', value: result.caseData.caseNumber, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Duration', value: duration ? moderationSystem.formatDuration(moderationSystem.parseDuration(duration)) : 'Permanent', inline: true },
                { name: 'Notification', value: dmStatus, inline: true }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Ban Failed', result.error)] });
    }
}

export async function handleUnban(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const userId = args[0];
    if (!userId || !/^\d{17,20}$/.test(userId)) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                `Usage: \`!unban <user_id> [reason]\`\n` +
                `Example: \`!unban 123456789012345678 Appeal granted\``)] 
        });
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    const result = await moderationSystem.unban(message.member, message.guild, userId, reason);
    
    if (result.success) {
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('User Unbanned')
            .addFields(
                { name: 'User ID', value: userId, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Case', value: result.caseData.caseNumber, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Unban Failed', result.error)] });
    }
}

export async function handleKick(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                `Usage: \`!kick @user [reason]\`\n` +
                `Example: \`!kick @user Spamming\``)] 
        });
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const evidence = extractEvidence(args);
    
    const result = await moderationSystem.kick(message.member, target, { reason, evidence });
    
    if (result.success) {
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('User Kicked')
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
                { name: 'User', value: `${target.user.tag}\n(${target.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Case', value: result.caseData.caseNumber, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Kick Failed', result.error)] });
    }
}

export async function handleMute(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                `Usage: \`!mute @user [duration] [reason]\`\n` +
                `Examples:\n` +
                ` - \`!mute @user 30m Spamming\``)] 
        });
    }
    
    let duration = null;
    let reasonStartIndex = 1;
    
    const durationMatch = args[1]?.match(/^\d+[smhdw]$/i);
    if (durationMatch) {
        duration = args[1];
        reasonStartIndex = 2;
    }
    
    const reason = args.slice(reasonStartIndex).join(' ') || 'No reason provided';
    const evidence = extractEvidence(args);
    
    const result = await moderationSystem.mute(message.member, target, { reason, duration, evidence });
    
    if (result.success) {
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('User Muted')
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
                { name: 'User', value: `${target.user.tag}\n(${target.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Case', value: result.caseData.caseNumber, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Duration', value: duration ? moderationSystem.formatDuration(moderationSystem.parseDuration(duration)) : 'Indefinite', inline: true }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Mute Failed', result.error)] });
    }
}

export async function handleUnmute(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!unmute @user [reason]`')] 
        });
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    const result = await moderationSystem.unmute(message.member, target, reason);
    
    if (result.success) {
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('User Unmuted')
            .addFields(
                { name: 'User', value: `${target.user.tag}\n(${target.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Case', value: result.caseData.caseNumber, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Unmute Failed', result.error)] });
    }
}

export async function handleTimeout(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                `Usage: \`!timeout @user <duration> [reason]\`\n` +
                `Duration examples: \`1m\`, \`1h\`, \`1d\`, \`1w\``)] 
        });
    }
    
    const duration = args[1];
    if (!duration) {
        return message.reply({ 
            embeds: [createErrorEmbed('Missing Duration', 'Please provide a duration (e.g., 1h, 30m)')] 
        });
    }
    
    const reason = args.slice(2).join(' ') || 'No reason provided';
    
    const result = await moderationSystem.timeout(message.member, target, duration, reason);
    
    if (result.success) {
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Purple)
            .setTitle('User Timed Out')
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
                { name: 'User', value: `${target.user.tag}\n(${target.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Case', value: result.caseData.caseNumber, inline: true },
                { name: 'Duration', value: moderationSystem.formatDuration(moderationSystem.parseDuration(duration)), inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Timeout Failed', result.error)] });
    }
}

export async function handleUntimeout(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!untimeout @user [reason]`')] 
        });
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    const result = await moderationSystem.untimeout(message.member, target, reason);
    
    if (result.success) {
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('Timeout Removed')
            .addFields(
                { name: 'User', value: `${target.user.tag}\n(${target.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Case', value: result.caseData.caseNumber, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Failed', result.error)] });
    }
}

export async function handleWarn(message, args) {
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                `Usage: \`!warn @user [reason]\`\n` +
                `Example: \`!warn @user Posting spam links\``)] 
        });
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const evidence = extractEvidence(args);
    
    const result = await moderationSystem.warn(message.member, target, reason, evidence);
    
    if (result.success) {
        let description = `Successfully warned ${target.user.tag}\n\n` +
                         `Case: ${result.caseData.caseNumber}\n` +
                         `Reason: ${reason}\n` +
                         `Total Warnings: ${result.warnCount}`;
        
        if (result.autoAction && result.autoAction.executed) {
            description += `\n\nAuto-escalation triggered: ${result.autoAction.action}` +
                          (result.autoAction.duration ? ` for ${result.autoAction.duration}` : '');
        }
        
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('Warning Issued')
            .setThumbnail(target.user.displayAvatarURL())
            .setDescription(description)
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Warning Failed', result.error)] });
    }
}

export async function handleWarnings(message, args) {
    let target = message.mentions.members.first();
    
    if (!target && args[0]) {
        const userId = args[0].replace(/[<@!>]/g, '');
        try {
            target = await message.guild.members.fetch(userId);
        } catch {
            return message.reply({ embeds: [createErrorEmbed('User Not Found', 'Could not find that user.')] });
        }
    }
    
    if (!target) {
        target = message.member;
    }
    
    const warnings = moderationSystem.getWarnings(message.guild.id, target.id);
    
    const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle(`Warnings for ${target.user.tag}`)
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
            { name: 'Total Warnings', value: String(warnings.length), inline: true }
        )
        .setTimestamp();
    
    if (warnings.length === 0) {
        embed.setDescription('This user has no warnings.');
    } else {
        const warningList = warnings.map((w, index) => {
            return `#${index + 1} - Case ${w.caseNumber}\n` +
                   `Reason: ${w.reason || 'None'}\n` +
                   `Date: <t:${Math.floor(w.timestamp / 1000)}:R>\n` +
                   `Mod: ${w.moderatorTag}`;
        }).join('\n\n');
        
        embed.setDescription(warningList);
    }
    
    return message.reply({ embeds: [embed] });
}

export async function handleSoftban(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const target = message.mentions.members.first();
    if (!target) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                `Usage: \`!softban @user [reason]\`\n` +
                `Example: \`!softban @user Spamming - messages cleaned\``)] 
        });
    }
    
    const reason = args.slice(1).join(' ') || 'Softban - message cleanup';
    
    const result = await moderationSystem.softban(message.member, target, reason);
    
    if (result.success) {
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('Softban Executed')
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
                { name: 'User', value: `${target.user.tag}\n(${target.id})`, inline: true },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Case', value: result.caseData.caseNumber, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Note', value: 'User can rejoin immediately', inline: false }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Softban Failed', result.error)] });
    }
}

export async function handleUndo(message, args) {
    const caseNumber = args[0];
    if (!caseNumber) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                `Usage: \`!undo <case_number> [reason]\`\n` +
                `Example: \`!undo #00001 Wrong user banned\``)] 
        });
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const normalizedCaseNumber = caseNumber.startsWith('#') ? caseNumber : `#${caseNumber}`;
    
    const result = await moderationSystem.undo(message.member, normalizedCaseNumber, reason);
    
    if (result.success) {
        const confirmationEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('Action Undone')
            .addFields(
                { name: 'Original Case', value: result.originalCase.caseNumber, inline: true },
                { name: 'Type', value: result.originalCase.type.toUpperCase(), inline: true },
                { name: 'Target', value: result.originalCase.targetTag, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Undo Case', value: result.undoCase.caseNumber, inline: true }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [confirmationEmbed] });
    } else {
        return message.reply({ embeds: [createErrorEmbed('Undo Failed', result.error)] });
    }
}

export async function handleCaseInfo(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const caseNumber = args[0];
    if (!caseNumber) {
        return message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!case <case_number>`')] 
        });
    }
    
    const normalizedCaseNumber = caseNumber.startsWith('#') ? caseNumber : `#${caseNumber}`;
    const caseData = moderationSystem.getCase(normalizedCaseNumber);
    
    if (!caseData) {
        return message.reply({ 
            embeds: [createErrorEmbed('Case Not Found', `Case ${normalizedCaseNumber} not found.`)] 
        });
    }
    
    if (caseData.guildId !== message.guild.id) {
        return message.reply({ 
            embeds: [createErrorEmbed('Wrong Guild', 'This case is from a different server.')] 
        });
    }
    
    const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(`Case ${caseData.caseNumber}`)
        .addFields(
            { name: 'Type', value: caseData.type.toUpperCase(), inline: true },
            { name: 'Target', value: `${caseData.targetTag}\n(${caseData.targetId})`, inline: true },
            { name: 'Moderator', value: caseData.moderatorTag, inline: true },
            { name: 'Reason', value: caseData.reason || 'No reason provided', inline: false }
        )
        .setTimestamp();
    
    if (caseData.duration) {
        embed.addFields({ name: 'Duration', value: caseData.duration, inline: true });
    }
    
    if (caseData.timestamp) {
        embed.addFields({ name: 'Date', value: `<t:${Math.floor(caseData.timestamp / 1000)}:f>`, inline: true });
    }
    
    if (caseData.undone) {
        embed.addFields({ name: 'Status', value: 'Undone', inline: true });
        embed.addFields({ name: 'Undo Reason', value: caseData.undoReason || 'No reason', inline: true });
    }
    
    return message.reply({ embeds: [embed] });
}

export async function handleModLog(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'Administrator permission required.')] 
        });
    }
    
    const subcommand = args[0]?.toLowerCase();
    
    if (!subcommand || subcommand === 'channel') {
        const currentChannelId = moderationSystem.getLogChannel(message.guild.id);
        const currentChannel = currentChannelId ? `<#${currentChannelId}>` : 'Not set';
        
        return message.reply({ 
            embeds: [createInfoEmbed('Moderation Log Channel', 
                `Current channel: ${currentChannel}\n\n` +
                `To set: \`!modlog #channel\``)] 
        });
    }
    
    if (subcommand === 'set') {
        const channel = message.mentions.channels.first();
        if (!channel) {
            return message.reply({ 
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!modlog set #channel`')] 
            });
        }
        
        moderationSystem.setLogChannel(message.guild.id, channel.id);
        
        return message.reply({ 
            embeds: [createSuccessEmbed('Log Channel Set', 
                `Moderation logs will be sent to ${channel}`)] 
        });
    }
    
    if (subcommand === 'stats') {
        const stats = moderationSystem.getModerationStats(message.guild.id);
        
        const statsEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Moderation Statistics')
            .addFields(
                { name: 'Total Actions', value: String(stats.total), inline: true },
                { name: 'Bans', value: String(stats.byType.ban || 0), inline: true },
                { name: 'Kicks', value: String(stats.byType.kick || 0), inline: true },
                { name: 'Mutes', value: String(stats.byType.mute || 0), inline: true },
                { name: 'Warns', value: String(stats.byType.warn || 0), inline: true },
                { name: 'Timeouts', value: String(stats.byType.timeout || 0), inline: true }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [statsEmbed] });
    }
    
    return message.reply({ 
        embeds: [createErrorEmbed('Invalid Subcommand', 'Use: `channel`, `set`, or `stats`')] 
    });
}

export async function handleEscalationRule(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'Administrator permission required.')] 
        });
    }
    
    const subcommand = args[0]?.toLowerCase();
    
    if (!subcommand || subcommand === 'list') {
        const rules = moderationSystem.getEscalationRules(message.guild.id);
        
        if (rules.length === 0) {
            return message.reply({ 
                embeds: [createInfoEmbed('Escalation Rules', 'No escalation rules configured.\n\n' +
                    `Usage: \`!escalation add <warns> <action> [duration]\`\n` +
                    `Actions: mute, kick, ban, timeout\n` +
                    `Example: \`!escalation add 5 mute 1h\``)] 
            });
        }
        
        const rulesList = rules.map(r => {
            return `#${r.id} - ${r.threshold}+ warnings -> ${r.action}` +
                   (r.duration ? ` for ${r.duration}` : '');
        }).join('\n');
        
        return message.reply({ 
            embeds: [createInfoEmbed(`Escalation Rules (${rules.length})`, rulesList)] 
        });
    }
    
    if (subcommand === 'add') {
        const threshold = parseInt(args[1]);
        const action = args[2]?.toLowerCase();
        const duration = args[3];
        
        if (!threshold || !action) {
            return message.reply({ 
                embeds: [createErrorEmbed('Invalid Usage', 
                    `Usage: \`!escalation add <warns> <action> [duration]\`\n` +
                    `Actions: mute, timeout (duration required), kick, ban`)] 
            });
        }
        
        if (!['mute', 'kick', 'ban', 'timeout'].includes(action)) {
            return message.reply({ 
                embeds: [createErrorEmbed('Invalid Action', 'Actions: mute, kick, ban, timeout')] 
            });
        }
        
        if ((action === 'mute' || action === 'timeout') && !duration) {
            return message.reply({ 
                embeds: [createErrorEmbed('Duration Required', 
                    `mute and timeout actions require a duration.\n` +
                    `Example: \`!escalation add 5 mute 1h\``)] 
            });
        }
        
        const rule = moderationSystem.addEscalationRule(message.guild.id, {
            threshold,
            action,
            duration,
            createdAt: Date.now()
        });
        
        return message.reply({ 
            embeds: [createSuccessEmbed('Rule Added', 
                `Threshold: ${threshold}+ warnings\n` +
                `Action: ${action}` +
                (duration ? ` for ${duration}` : ''))] 
        });
    }
    
    if (subcommand === 'remove' || subcommand === 'delete') {
        const ruleId = args[1];
        if (!ruleId) {
            return message.reply({ 
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!escalation remove <rule_id>`')] 
            });
        }
        
        const success = moderationSystem.removeEscalationRule(message.guild.id, ruleId);
        
        if (success) {
            return message.reply({ 
                embeds: [createSuccessEmbed('Rule Removed', 'Escalation rule deleted.')] 
            });
        } else {
            return message.reply({ 
                embeds: [createErrorEmbed('Not Found', 'Rule ID not found.')] 
            });
        }
    }
    
    return message.reply({ 
        embeds: [createErrorEmbed('Invalid Subcommand', 'Use: `list`, `add`, or `remove`')] 
    });
}

export async function handleSearchCases(message, args) {
    const permCheck = await checkModeratorPermission(message);
    if (!permCheck.allowed) {
        return message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', permCheck.reason)] 
        });
    }
    
    const options = {};
    
    if (args[0]?.startsWith('user:')) {
        const userId = args[0].substring(5).replace(/[<@!>]/g, '');
        try {
            const member = await message.guild.members.fetch(userId);
            options.userId = member.id;
        } catch {
            return message.reply({ 
                embeds: [createErrorEmbed('User Not Found', 'Could not find that user.')] 
            });
        }
    }
    
    if (args.some(a => ['ban', 'kick', 'mute', 'warn', 'timeout'].includes(a.toLowerCase()))) {
        const typeArg = args.find(a => ['ban', 'kick', 'mute', 'warn', 'timeout'].includes(a.toLowerCase()));
        options.type = typeArg.toLowerCase();
    }
    
    const results = moderationSystem.searchCases(message.guild.id, options);
    
    if (results.length === 0) {
        return message.reply({ 
            embeds: [createInfoEmbed('No Results', 'No moderation cases found matching your criteria.')] 
        });
    }
    
    const resultsList = results.slice(0, 10).map(r => {
        return `${r.caseNumber} - ${r.type.toUpperCase()} - ${r.targetTag}\n` +
               `Reason: ${r.reason || 'None'}\n` +
               `Date: <t:${Math.floor(r.timestamp / 1000)}:R>`;
    }).join('\n\n');
    
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`Moderation Cases (${results.length} found, showing 10)`)
        .setDescription(resultsList)
        .setTimestamp();
    
    return message.reply({ embeds: [embed] });
}

export async function handleModHelp(message) {
    const helpEmbed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Moderation Commands')
        .setDescription('Available moderation commands (Moderator role required):')
        .addFields(
            { name: 'Ban', value: '`!ban @user [duration] [reason]` - Ban a user', inline: false },
            { name: 'Unban', value: '`!unban <user_id> [reason]` - Lift a ban', inline: false },
            { name: 'Kick', value: '`!kick @user [reason]` - Kick a user', inline: false },
            { name: 'Mute', value: '`!mute @user [duration] [reason]` - Mute a user', inline: false },
            { name: 'Unmute', value: '`!unmute @user [reason]` - Remove mute', inline: false },
            { name: 'Timeout', value: '`!timeout @user <duration> [reason]` - Discord timeout', inline: false },
            { name: 'Untimeout', value: '`!untimeout @user [reason]` - Remove timeout', inline: false },
            { name: 'Warn', value: '`!warn @user [reason]` - Issue a warning', inline: false },
            { name: 'Warnings', value: '`!warnings [@user]` - View user warnings', inline: false },
            { name: 'Softban', value: '`!softban @user [reason]` - Ban + unban (cleanup)', inline: false },
            { name: 'Undo', value: '`!undo <case> [reason]` - Reverse an action', inline: false },
            { name: 'Case Info', value: '`!case <case_number>` - View case details', inline: false },
            { name: 'Search', value: '`!cases [user:@user] [type:type]` - Search cases', inline: false },
            { name: 'Mod Log', value: '`!modlog` - Configure log channel/stats', inline: false },
            { name: 'Escalation', value: '`!escalation` - Auto-action rules', inline: false }
        )
        .setFooter({ text: 'Use the Moderator role or Moderate Members permission to use these commands.' })
        .setTimestamp();
    
    return message.reply({ embeds: [helpEmbed] });
}

function extractEvidence(args) {
    const evidence = [];
    
    for (const arg of args) {
        if (arg.startsWith('evidence:')) {
            evidence.push(arg.substring(9));
        }
    }
    
    return evidence;
}
