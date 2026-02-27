import { voiceModerationSystem } from '../utils/voiceModeration.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/messageFormatter.js';
import { PermissionFlagsBits } from 'discord.js';

export async function handleVoiceMute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Mute Members** permission to use this command.')] 
        });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!voicemute @user [duration] [reason]`\nDuration format: `1d`, `2h`, `30m`, `60s`')] 
        });
    }

    const durationStr = args[1];
    let duration = null;
    
    if (durationStr) {
        duration = voiceModerationSystem.parseDuration(durationStr);
        if (!duration) {
            return await message.reply({ 
                embeds: [createErrorEmbed('Invalid Duration', 'Invalid duration format. Use: `1d`, `2h`, `30m`, `60s`')] 
            });
        }
    }

    const reason = args.slice(durationStr ? 2 : 1).join(' ') || 'No reason provided';

    const result = await voiceModerationSystem.muteVoice(message.member, target, { reason, duration });

    if (result.success) {
        let responseText = `Successfully voice muted ${target.user.tag}`;
        if (duration) {
            responseText += `\n**Duration:** ${voiceModerationSystem.formatDuration(duration)}`;
        }
        responseText += `\n**Reason:** ${reason}\n**Case:** ${result.caseNumber}`;
        
        return await message.reply({ 
            embeds: [createSuccessEmbed('User Voice Muted', responseText)] 
        });
    } else {
        return await message.reply({ 
            embeds: [createErrorEmbed('Voice Mute Failed', result.error)] 
        });
    }
}

export async function handleVoiceUnmute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Mute Members** permission to use this command.')] 
        });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!voiceunmute @user [reason]`')] 
        });
    }

    const reason = args.slice(1).join(' ') || 'Manual unmute';

    const result = await voiceModerationSystem.unmuteVoice(message.member, target, reason);

    if (result.success) {
        return await message.reply({ 
            embeds: [createSuccessEmbed('Voice Unmuted', `Successfully unmuted ${target.user.tag}\n**Reason:** ${reason}\n**Case:** ${result.caseNumber}`)] 
        });
    } else {
        return await message.reply({ 
            embeds: [createErrorEmbed('Voice Unmute Failed', result.error)] 
        });
    }
}

export async function handleVoiceDeafen(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Deafen Members** permission to use this command.')] 
        });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!voicedeafen @user [duration] [reason]`\nDuration format: `1d`, `2h`, `30m`, `60s`')] 
        });
    }

    const durationStr = args[1];
    let duration = null;
    
    if (durationStr) {
        duration = voiceModerationSystem.parseDuration(durationStr);
        if (!duration) {
            return await message.reply({ 
                embeds: [createErrorEmbed('Invalid Duration', 'Invalid duration format. Use: `1d`, `2h`, `30m`, `60s`')] 
            });
        }
    }

    const reason = args.slice(durationStr ? 2 : 1).join(' ') || 'No reason provided';

    const result = await voiceModerationSystem.deafenVoice(message.member, target, { reason, duration });

    if (result.success) {
        let responseText = `Successfully deafened ${target.user.tag}`;
        if (duration) {
            responseText += `\n**Duration:** ${voiceModerationSystem.formatDuration(duration)}`;
        }
        responseText += `\n**Reason:** ${reason}\n**Case:** ${result.caseNumber}`;
        
        return await message.reply({ 
            embeds: [createSuccessEmbed('User Deafened', responseText)] 
        });
    } else {
        return await message.reply({ 
            embeds: [createErrorEmbed('Deafen Failed', result.error)] 
        });
    }
}

export async function handleVoiceUndeafen(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Deafen Members** permission to use this command.')] 
        });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!voiceundeafen @user [reason]`')] 
        });
    }

    const reason = args.slice(1).join(' ') || 'Manual undeafen';

    const result = await voiceModerationSystem.undeafenVoice(message.member, target, reason);

    if (result.success) {
        return await message.reply({ 
            embeds: [createSuccessEmbed('User Undeafened', `Successfully undeafened ${target.user.tag}\n**Reason:** ${reason}\n**Case:** ${result.caseNumber}`)] 
        });
    } else {
        return await message.reply({ 
            embeds: [createErrorEmbed('Undeafen Failed', result.error)] 
        });
    }
}

export async function handleVoiceMove(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Move Members** permission to use this command.')] 
        });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!voiceMove @user #channel [reason]`')] 
        });
    }

    const channel = message.mentions.channels.first();
    if (!channel || channel.type !== 2) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Please mention a voice channel.\nUsage: `!voiceMove @user #channel [reason]`')] 
        });
    }

    const reason = args.slice(2).join(' ') || 'No reason provided';

    const result = await voiceModerationSystem.moveVoice(message.member, target, channel, reason);

    if (result.success) {
        return await message.reply({ 
            embeds: [createSuccessEmbed('User Moved', `Successfully moved ${target.user.tag} to ${channel}\n**Reason:** ${reason}\n**Case:** ${result.caseNumber}`)] 
        });
    } else {
        return await message.reply({ 
            embeds: [createErrorEmbed('Move Failed', result.error)] 
        });
    }
}

export async function handleVoiceKick(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Move Members** permission to use this command.')] 
        });
    }

    const target = message.mentions.members.first();
    if (!target) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!voicekick @user [reason]`')] 
        });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    const result = await voiceModerationSystem.voiceKick(message.member, target, reason);

    if (result.success) {
        return await message.reply({ 
            embeds: [createSuccessEmbed('User Kicked from Voice', `Successfully kicked ${target.user.tag} from voice\n**Reason:** ${reason}\n**Case:** ${result.caseNumber}`)] 
        });
    } else {
        return await message.reply({ 
            embeds: [createErrorEmbed('Voice Kick Failed', result.error)] 
        });
    }
}

export async function handleVoiceMuteQueue(message, args) {
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand || subcommand === 'list') {
        const queue = voiceModerationSystem.muteQueue;
        if (queue.length === 0) {
            return await message.reply({ 
                embeds: [createInfoEmbed('Mute Queue', 'The mute queue is empty.')] 
            });
        }

        const queueList = queue.slice(0, 10).map((item, i) => 
            `**#${i + 1}** ${item.targetTag || item.targetId}\nQueued: <t:${Math.floor(item.queuedAt / 1000)}:R>`
        ).join('\n\n');

        return await message.reply({ 
            embeds: [createInfoEmbed(`Mute Queue (${queue.length} pending)`, queueList)] 
        });
    }

    if (subcommand === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
            return await message.reply({ 
                embeds: [createErrorEmbed('Permission Denied', 'You need **Mute Members** permission.')] 
            });
        }

        voiceModerationSystem.muteQueue = [];
        voiceModerationSystem.saveData();
        
        return await message.reply({ 
            embeds: [createSuccessEmbed('Queue Cleared', 'The mute queue has been cleared.')] 
        });
    }

    return await message.reply({ 
        embeds: [createErrorEmbed('Invalid Subcommand', 'Available: `list`, `clear`')] 
    });
}

export async function handleVoiceLogChannel(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Administrator** permission to use this command.')] 
        });
    }

    const channel = message.mentions.channels.first();
    if (!channel) {
        const currentChannel = voiceModerationSystem.getLogChannel(message.guild.id);
        return await message.reply({ 
            embeds: [createInfoEmbed('Voice Log Channel', `Current: ${currentChannel ? `<#${currentChannel}>` : 'Not set'}\n\nUsage: \`!voicelog #channel\``)] 
        });
    }

    voiceModerationSystem.setLogChannel(message.guild.id, channel.id);
    return await message.reply({ 
        embeds: [createSuccessEmbed('Voice Log Channel Set', `Voice moderation logs will be sent to ${channel}`)] 
    });
}

export async function handleChannelLimit(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const channel = message.mentions.channels.first() || message.member.voice.channel;
    if (!channel || channel.type !== 2) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!channellimit #voice [limit]`\nSet limit to 0 to disable.')] 
        });
    }

    const limit = parseInt(args[1]);
    
    if (isNaN(limit)) {
        const currentLimit = voiceModerationSystem.getChannelLimit(message.guild.id, channel.id);
        return await message.reply({ 
            embeds: [createInfoEmbed('Channel Limit', `**Channel:** ${channel}\n**Current Limit:** ${currentLimit || 'Unlimited'}\n\nUsage: \`!channellimit #voice [limit]\``)] 
        });
    }

    if (limit < 0 || limit > 99) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Limit', 'Limit must be between 0 and 99.')] 
        });
    }

    voiceModerationSystem.setChannelLimit(message.guild.id, channel.id, limit);
    
    return await message.reply({ 
        embeds: [createSuccessEmbed('Channel Limit Set', `${channel} limit set to ${limit || 'Unlimited'}`)] 
    });
}

export async function handleSpamConfig(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Administrator** permission.')] 
        });
    }

    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
        const rules = voiceModerationSystem.getSpamRules(message.guild.id);
        return await message.reply({ 
            embeds: [createInfoEmbed('Spam Detection Config', 
                `**Max Switches:** ${rules.maxSwitches}\n` +
                `**Time Window:** ${rules.switchTimeWindow / 1000}s\n` +
                `**Action:** ${rules.action}\n\n` +
                `Usage: \`!spamconfig <switches|window|action>\``)] 
        });
    }

    if (subcommand === 'switches') {
        const value = parseInt(args[1]);
        if (isNaN(value) || value < 1) {
            return await message.reply({ 
                embeds: [createErrorEmbed('Invalid Value', 'Usage: `!spamconfig switches <number>`')] 
            });
        }
        voiceModerationSystem.setSpamRules(message.guild.id, { maxSwitches: value });
        return await message.reply({ 
            embeds: [createSuccessEmbed('Config Updated', `Max channel switches set to ${value}`)] 
        });
    }

    if (subcommand === 'window') {
        const seconds = parseInt(args[1]);
        if (isNaN(seconds) || seconds < 1) {
            return await message.reply({ 
                embeds: [createErrorEmbed('Invalid Value', 'Usage: `!spamconfig window <seconds>`')] 
            });
        }
        voiceModerationSystem.setSpamRules(message.guild.id, { switchTimeWindow: seconds * 1000 });
        return await message.reply({ 
            embeds: [createSuccessEmbed('Config Updated', `Time window set to ${seconds} seconds`)] 
        });
    }

    if (subcommand === 'action') {
        const action = args[1]?.toLowerCase();
        if (!action || !['warn', 'mute', 'kick'].includes(action)) {
            return await message.reply({ 
                embeds: [createErrorEmbed('Invalid Action', 'Actions: `warn`, `mute`, `kick`')] 
            });
        }
        voiceModerationSystem.setSpamRules(message.guild.id, { action });
        return await message.reply({ 
            embeds: [createSuccessEmbed('Config Updated', `Spam action set to \`${action}\``)] 
        });
    }

    return await message.reply({ 
        embeds: [createErrorEmbed('Invalid Subcommand', 'Available: `switches`, `window`, `action`')] 
    });
}

export async function handleVoiceStatus(message, args) {
    const target = message.mentions.members.first() || message.member;
    
    if (!voiceModerationSystem.isUserInVoice(target)) {
        return await message.reply({ 
            embeds: [createInfoEmbed('Voice Status', `${target.user.tag} is not in a voice channel.`)] 
        });
    }

    const channel = voiceModerationSystem.getUserVoiceChannel(target);
    const voiceState = target.voice;
    
    const status = [
        `**Channel:** ${channel.name}`,
        `**Muted:** ${voiceState.mute ? 'Yes' : 'No'}`,
        `**Deafened:** ${voiceState.deaf ? 'Yes' : 'No'}`,
        `**Self Muted:** ${voiceState.selfMute ? 'Yes' : 'No'}`,
        `**Self Deafened:** ${voiceState.selfDeaf ? 'Yes' : 'No'}`,
        `**Streaming:** ${voiceState.streaming ? 'Yes' : 'No'}`,
        `**Video:** ${voiceState.video ? 'Yes' : 'No'}`,
        `**Suppressed:** ${voiceState.suppress ? 'Yes' : 'No'}`
    ].join('\n');

    const activity = voiceModerationSystem.getVoiceActivityStats(message.guild.id, target.id);
    if (activity) {
        status += `\n**Session Speech Time:** ${Math.floor(activity.totalSpeech / 1000)}s`;
    }

    return await message.reply({ 
        embeds: [createInfoEmbed(`Voice Status: ${target.user.tag}`, status)] 
    });
}

export async function handleVoiceLogs(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Moderate Members** permission.')] 
        });
    }

    const type = args[0]?.toLowerCase();
    const limit = parseInt(args[1]) || 50;

    const logs = voiceModerationSystem.getVoiceLogs(message.guild.id, { type, limit });

    if (logs.length === 0) {
        return await message.reply({ 
            embeds: [createInfoEmbed('Voice Logs', 'No voice moderation logs found.')] 
        });
    }

    const logList = logs.slice(0, 10).map(log => 
        `**${log.caseNumber}** ${log.type}\n${log.targetTag || 'Unknown'} - ${log.reason || 'No reason'}\n<t:${Math.floor(log.timestamp / 1000)}:R>`
    ).join('\n\n');

    return await message.reply({ 
        embeds: [createInfoEmbed(`Voice Logs (${logs.length} total)`, logList)] 
    });
}

export async function handleVoiceStats(message, args) {
    const stats = voiceModerationSystem.getVoiceStats(message.guild.id);
    
    const statsText = [
        `**Total Actions:** ${stats.totalActions}`,
        `**Voice Mutes:** ${stats.byType.voiceMute || 0}`,
        `**Voice Unmutes:** ${stats.byType.voiceUnmute || 0}`,
        `**Deafens:** ${stats.byType.voiceDeafen || 0}`,
        `**Moves:** ${stats.byType.voiceMove || 0}`,
        `**Kicks:** ${stats.byType.voiceKick || 0}`,
        `**Spam Detections:** ${stats.byType.spamDetect || 0}`
    ].join('\n');

    return await message.reply({ 
        embeds: [createInfoEmbed('Voice Moderation Stats', statsText)] 
    });
}

export async function handleActiveMutes(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Mute Members** permission.')] 
        });
    }

    const activeMutes = voiceModerationSystem.getActiveVoiceMutes();

    if (activeMutes.length === 0) {
        return await message.reply({ 
            embeds: [createInfoEmbed('Active Voice Mutes', 'No users are currently voice muted.')] 
        });
    }

    const muteList = activeMutes.slice(0, 10).map(mute => {
        const duration = mute.duration ? voiceModerationSystem.formatDuration(mute.duration - (Date.now() - mute.startTime)) : 'Indefinite';
        return `**${mute.targetId || 'Unknown'}**\nChannel: ${mute.channelId || 'Unknown'}\nRemaining: ${duration}`;
    }).join('\n\n');

    return await message.reply({ 
        embeds: [createInfoEmbed(`Active Voice Mutes (${activeMutes.length})`, muteList)] 
    });
}

export async function handleVoiceHelp(message, args) {
    const helpText = `
**Voice Moderation Commands**

**Moderation:**
• \`!voicemute @user [duration] [reason]\` - Mute user's voice
• \`!voiceunmute @user [reason]\` - Unmute user's voice
• \`!voicedeafen @user [duration] [reason]\` - Deafen user in voice
• \`!voiceundeafen @user [reason]\` - Undeafen user
• \`!voiceMove @user #channel [reason]\` - Move user to channel
• \`!voicekick @user [reason]\` - Kick from voice

**Management:**
• \`!voicelog #channel\` - Set log channel
• \`!channellimit #voice [limit]\` - Set max users
• \`!spamconfig [switches|window|action]\` - Configure spam detection

**Info:**
• \`!voicestatus [@user]\` - Check voice status
• \`!voicelogs [type] [limit]\` - View moderation logs
• \`!voicestats\` - View statistics
• \`!activemutes\` - View active mutes
• \`!voicequeue\` - View mute queue
    `.trim();

    return await message.reply({ 
        embeds: [createInfoEmbed('Voice Moderation Help', helpText)] 
    });
}
