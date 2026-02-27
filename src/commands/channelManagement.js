import { 
    PermissionFlagsBits, ChannelType, OverwriteType, 
    EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder 
} from 'discord.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/messageFormatter.js';

const SLOWMODE_PRESETS = {
    '5s': 5,
    '10s': 10,
    '30s': 30,
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '1h': 3600
};

const CHANNEL_TYPE_MAP = {
    'text': ChannelType.GuildText,
    'voice': ChannelType.GuildVoice,
    'forum': ChannelType.GuildForum,
    'announcement': ChannelType.GuildAnnouncement,
    'stage': ChannelType.GuildStageVoice,
    'category': ChannelType.GuildCategory
};

const channelHistory = new Map();
const lockdownRecords = new Map();
const scheduledUnlocks = new Map();

function getChannelTypeName(type) {
    const types = {
        [ChannelType.GuildText]: 'Text',
        [ChannelType.GuildVoice]: 'Voice',
        [ChannelType.GuildForum]: 'Forum',
        [ChannelType.GuildAnnouncement]: 'Announcement',
        [ChannelType.GuildStageVoice]: 'Stage',
        [ChannelType.GuildCategory]: 'Category'
    };
    return types[type] || 'Unknown';
}

function parsePermissionString(permString) {
    const perms = {};
    if (!permString) return perms;

    const permMappings = {
        'send': 'SendMessages',
        'read': 'ViewChannel',
        'manage': 'ManageChannels',
        'connect': 'Connect',
        'speak': 'Speak',
        'embed': 'EmbedLinks',
        'attach': 'AttachFiles',
        'mention': 'MentionEveryone',
        'react': 'AddReactions'
    };

    const parts = permString.toLowerCase().split(',');
    for (const part of parts) {
        const [role, allow] = part.trim().split(':');
        if (!role || !allow) continue;
        
        const permName = permMappings[allow.trim()];
        if (permName) {
            if (!perms[role]) perms[role] = { allow: [], deny: [] };
            perms[role].allow.push(permName);
        }
    }

    return perms;
}

function getPermissionBits(permArray) {
    const bits = BigInt(0);
    for (const perm of permArray) {
        if (PermissionFlagsBits[perm]) {
            bits |= PermissionFlagsBits[perm];
        }
    }
    return bits;
}

async function logChannelChange(client, guild, action, details) {
    try {
        const logEntry = {
            action,
            details,
            timestamp: Date.now(),
            moderatorId: details.moderatorId
        };

        if (!channelHistory.has(guild.id)) {
            channelHistory.set(guild.id, []);
        }
        channelHistory.get(guild.id).push(logEntry);

        if (channelHistory.get(guild.id).length > 1000) {
            channelHistory.get(guild.id).shift();
        }
    } catch (error) {
        console.error('Failed to log channel change:', error);
    }
}

async function resolveChannel(message, channelArg) {
    if (!channelArg) {
        return message.channel;
    }

    const mentionMatch = channelArg.match(/<#(\d+)>/);
    if (mentionMatch) {
        const channel = await message.guild.channels.fetch(mentionMatch[1]);
        if (channel) return channel;
    }

    const channel = await message.guild.channels.cache.find(
        c => c.name.toLowerCase() === channelArg.toLowerCase().replace(/^#/, '')
    );

    if (channel) return channel;

    const channelById = await message.guild.channels.fetch(channelArg).catch(() => null);
    return channelById;
}

export async function handleChannelCreate(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const type = args[0]?.toLowerCase();
    const name = args[1];

    if (!type || !name) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                'Usage: `!channel-create <type> <name> [topic] [permissions]`\n' +
                'Types: `text`, `voice`, `forum`, `announcement`, `stage`\n' +
                'Example: `!channel-create text #new-channel General chat everyone:read send:@Moderator`')] 
        });
    }

    const channelType = CHANNEL_TYPE_MAP[type];
    if (!channelType) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Channel Type', `Available types: ${Object.keys(CHANNEL_TYPE_MAP).join(', ')}`)] 
        });
    }

    const topic = args.slice(2).find(a => !a.includes(':')) || null;
    let permissionOverwrites = [];

    const everyoneRole = message.guild.roles.everyone;

    if (args.some(a => a.includes(':'))) {
        const permString = args.slice(2).join(' ').match(/([\w\s]+):([\w\s,]+)/g);
        if (permString) {
            for (const perm of permString) {
                const [roleName, perms] = perm.split(':');
                const trimmedRole = roleName.trim();
                const trimmedPerms = perms.trim();

                let role;
                if (trimmedRole === '@everyone') {
                    role = everyoneRole;
                } else {
                    role = message.guild.roles.cache.find(r => 
                        r.name.toLowerCase() === trimmedRole.toLowerCase()
                    );
                }

                if (!role) continue;

                const allowed = [];
                const denied = [];
                const permParts = trimmedPerms.split(',').map(p => p.trim());

                for (const p of permParts) {
                    if (p.startsWith('-')) {
                        denied.push(p.substring(1));
                    } else {
                        allowed.push(p);
                    }
                }

                permissionOverwrites.push({
                    id: role.id,
                    allow: getPermissionBits(allowed),
                    deny: getPermissionBits(denied)
                });
            }
        }
    }

    const defaultDeny = {
        id: everyoneRole.id,
        deny: getPermissionBits(['SendMessages', 'AddReactions'])
    };

    const existingOverwrite = permissionOverwrites.find(p => p.id === everyoneRole.id);
    if (!existingOverwrite) {
        permissionOverwrites.push(defaultDeny);
    }

    try {
        const channelOptions = {
            name: name.replace(/^#/, ''),
            type: channelType,
            permissionOverwrites,
            reason: `Created by ${message.author.tag}`
        };

        if (topic && channelType !== ChannelType.GuildVoice && channelType !== ChannelType.GuildStageVoice) {
            channelOptions.topic = topic;
        }

        const channel = await message.guild.channels.create(channelOptions);

        await logChannelChange(null, message.guild, 'CREATE', {
            channelId: channel.id,
            channelName: channel.name,
            channelType: getChannelTypeName(channel.type),
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('Channel Created', 
                `Successfully created ${channel} (${getChannelTypeName(channel.type)})\n` +
                `**Channel ID:** \`${channel.id}\``)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Create Channel', error.message)] 
        });
    }
}

export async function handleChannelDelete(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the specified channel.')] 
        });
    }

    if (channel.type === ChannelType.GuildCategory) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Cannot Delete Category', 'Please delete all channels in the category first.')] 
        });
    }

    const confirmMsg = await message.reply({
        embeds: [createInfoEmbed('Confirm Deletion', 
            `Are you sure you want to delete ${channel}?\n` +
            `This action **cannot** be undone. Reply with \`confirm\` within 30 seconds.`)]
    });

    try {
        const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'confirm';
        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });

        if (collected.size === 0 || collected.first().content.toLowerCase() !== 'confirm') {
            return await confirmMsg.edit({ 
                embeds: [createInfoEmbed('Cancelled', 'Channel deletion cancelled.')] 
            });
        }

        const channelInfo = {
            name: channel.name,
            type: getChannelTypeName(channel.type),
            id: channel.id
        };

        await channel.delete(`Deleted by ${message.author.tag}`);

        await logChannelChange(null, message.guild, 'DELETE', {
            ...channelInfo,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('Channel Deleted', `Successfully deleted ${channelInfo.name} (${channelInfo.type})`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Delete Channel', error.message)] 
        });
    }
}

export async function handleChannelLock(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the specified channel.')] 
        });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const everyoneRole = message.guild.roles.everyone;

    try {
        const isVoice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
        
        await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: false,
            AddReactions: false,
            Connect: isVoice ? false : undefined,
            SendMessagesInThreads: false
        }, { reason: `Lockdown: ${reason}` });

        if (!lockdownRecords.has(channel.id)) {
            lockdownRecords.set(channel.id, []);
        }

        const lockdownInfo = {
            reason,
            lockedBy: message.author.id,
            lockedAt: Date.now(),
            channelName: channel.name
        };

        lockdownRecords.get(channel.id).push(lockdownInfo);

        const embed = new EmbedBuilder()
            .setColor(0xFF0055)
            .setTitle('🔒 Channel Locked')
            .setDescription(`${channel} has been locked.`)
            .addFields(
                { name: 'Reason', value: reason, inline: false },
                { name: 'Locked By', value: message.author.tag, inline: true },
                { name: 'Locked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();

        if (channel.topic) {
            embed.setFooter({ text: `Original Topic: ${channel.topic}` });
        }

        await channel.setTopic(`🔒 **LOCKED** | Reason: ${reason} | Locked by: ${message.author.tag}`);

        await logChannelChange(null, message.guild, 'LOCK', {
            channelId: channel.id,
            channelName: channel.name,
            reason,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ embeds: [embed] });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Lock Channel', error.message)] 
        });
    }
}

export async function handleChannelUnlock(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the specified channel.')] 
        });
    }

    try {
        const isVoice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
        
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
            SendMessages: null,
            AddReactions: null,
            Connect: null,
            SendMessagesInThreads: null
        }, { reason: `Unlocked by ${message.author.tag}` });

        if (scheduledUnlocks.has(channel.id)) {
            clearTimeout(scheduledUnlocks.get(channel.id));
            scheduledUnlocks.delete(channel.id);
        }

        const lockRecords = lockdownRecords.get(channel.id);
        let unlockReason = 'Manually unlocked';
        if (lockRecords && lockRecords.length > 0) {
            lockRecords[lockRecords.length - 1].unlockedAt = Date.now();
            unlockReason = lockRecords[lockRecords.length - 1].reason;
        }

        const originalTopic = channel.topic?.replace(/🔒 \*\*LOCKED\*\* \|.*/, '') || null;
        if (originalTopic) {
            await channel.setTopic(originalTopic);
        } else {
            await channel.setTopic(null);
        }

        await logChannelChange(null, message.guild, 'UNLOCK', {
            channelId: channel.id,
            channelName: channel.name,
            originalReason: unlockReason,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('🔓 Channel Unlocked', `${channel} has been unlocked and is now accessible to everyone.`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Unlock Channel', error.message)] 
        });
    }
}

export async function handleChannelRename(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    const newName = args.slice(1).join(' ').replace(/^#/, '');

    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the specified channel.')] 
        });
    }

    if (!newName) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!channel-rename <channel> <newName>`')] 
        });
    }

    if (newName.length < 2 || newName.length > 100) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Name', 'Channel name must be between 2 and 100 characters.')] 
        });
    }

    try {
        const oldName = channel.name;
        await channel.setName(newName, `Renamed by ${message.author.tag}`);

        await logChannelChange(null, message.guild, 'RENAME', {
            channelId: channel.id,
            channelName: channel.name,
            oldName,
            newName,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('Channel Renamed', 
                `${channel} renamed from **${oldName}** to **${newName}**`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Rename Channel', error.message)] 
        });
    }
}

export async function handleChannelTopic(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    const topic = args.slice(1).join(' ');

    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the specified channel.')] 
        });
    }

    if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Channel Type', 'Voice channels do not support topics.')] 
        });
    }

    if (!topic && args[1]) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!channel-topic <channel> <topic>`')] 
        });
    }

    try {
        await channel.setTopic(topic || null);

        await logChannelChange(null, message.guild, 'TOPIC', {
            channelId: channel.id,
            channelName: channel.name,
            topic: topic || '(cleared)',
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('Topic Set', 
                topic ? `Topic for ${channel} has been set.` : `Topic for ${channel} has been cleared.`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Set Topic', error.message)] 
        });
    }
}

export async function handleChannelSlowmode(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    let slowmodeValue = args[1];

    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the specified channel.')] 
        });
    }

    if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Channel Type', 'Voice channels do not support slowmode.')] 
        });
    }

    if (!slowmodeValue) {
        const currentSlowmode = channel.rateLimitPerUser || 0;
        const presetName = Object.entries(SLOWMODE_PRESETS).find(([k, v]) => v === currentSlowmode)?.[0] || 'off';
        
        return await message.reply({ 
            embeds: [createInfoEmbed('Current Slowmode', 
                `${channel} slowmode: **${currentSlowmode}s** (${presetName})\n\n` +
                `Available presets: ${Object.keys(SLOWMODE_PRESETS).join(', ')}, or provide custom seconds.\n` +
                `Usage: \`!channel-slowmode <channel> <preset|seconds>\``)] 
        });
    }

    let seconds;
    if (SLOWMODE_PRESETS[slowmodeValue.toLowerCase()]) {
        seconds = SLOWMODE_PRESETS[slowmodeValue.toLowerCase()];
    } else {
        seconds = parseInt(slowmodeValue);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return await message.reply({ 
                embeds: [createErrorEmbed('Invalid Slowmode', 'Slowmode must be between 0 and 21600 seconds (6 hours).\n' +
                    `Available presets: ${Object.keys(SLOWMODE_PRESETS).join(', ')}`)] 
            });
        }
    }

    try {
        await channel.setRateLimitPerUser(seconds, `Slowmode set by ${message.author.tag}`);

        await logChannelChange(null, message.guild, 'SLOWMODE', {
            channelId: channel.id,
            channelName: channel.name,
            slowmodeSeconds: seconds,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        const presetName = Object.entries(SLOWMODE_PRESETS).find(([k, v]) => v === seconds)?.[0] || `${seconds}s`;

        return await message.reply({ 
            embeds: [createSuccessEmbed('Slowmode Set', 
                `${channel} slowmode set to **${seconds}s** (${presetName})`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Set Slowmode', error.message)] 
        });
    }
}

export async function handleChannelInfo(message, args) {
    const channel = await resolveChannel(message, args[0]);
    
    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Channel not found.')] 
        });
    }

    try {
        const embed = new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle(`📊 Channel Info: ${channel.name}`)
            .setThumbnail(channel.guild.iconURL())
            .addFields(
                { name: 'ID', value: `\`${channel.id}\``, inline: true },
                { name: 'Type', value: getChannelTypeName(channel.type), inline: true },
                { name: 'Created', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`, inline: true },
                { name: 'NSFW', value: channel.nsfw ? 'Yes' : 'No', inline: true }
            );

        if (channel.parent) {
            embed.addFields({ name: 'Category', value: channel.parent.name, inline: true });
        }

        if (channel.topic) {
            const topicDisplay = channel.topic.length > 200 
                ? channel.topic.substring(0, 197) + '...' 
                : channel.topic;
            embed.addFields({ name: 'Topic', value: topicDisplay, inline: false });
        }

        if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
            embed.addFields(
                { name: 'Slowmode', value: `${channel.rateLimitPerUser || 0}s`, inline: true }
            );

            try {
                const invite = await channel.createInvite({ maxUses: 1 }, 'Channel info request');
                embed.addFields({ name: 'Invite', value: invite.url, inline: true });
            } catch {
                embed.addFields({ name: 'Invite', value: 'Cannot create invite', inline: true });
            }
        }

        if (channel.permissionOverwrites?.size > 0) {
            const rolePerms = [];
            const memberPerms = [];

            for (const [id, overwrite] of channel.permissionOverwrites) {
                if (id === channel.guild.id) continue;
                
                const role = channel.guild.roles.cache.get(id);
                if (role) {
                    rolePerms.push(role.name);
                } else {
                    const member = await channel.guild.members.fetch(id).catch(() => null);
                    if (member) {
                        memberPerms.push(member.user.tag);
                    }
                }
            }

            const permText = [];
            if (rolePerms.length > 0) permText.push(`Roles: ${rolePerms.slice(0, 5).join(', ')}${rolePerms.length > 5 ? '...' : ''}`);
            if (memberPerms.length > 0) permText.push(`Members: ${memberPerms.slice(0, 3).join(', ')}${memberPerms.length > 3 ? '...' : ''}`);
            
            if (permText.length > 0) {
                embed.addFields({ name: 'Custom Permissions', value: permText.join('\n'), inline: false });
            }
        }

        embed.setFooter({ text: `Position: ${channel.position}` });

        return await message.reply({ embeds: [embed] });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Get Channel Info', error.message)] 
        });
    }
}

export async function handleChannelArchive(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    
    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Channel not found.')] 
        });
    }

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Channel Type', 'Only text and announcement channels can be archived.')] 
        });
    }

    try {
        const everyoneRole = message.guild.roles.everyone;
        
        await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false
        }, { reason: `Archived by ${message.author.tag}` });

        await channel.setName(`archive-${channel.name.replace(/^archive-/, '')}`, `Archived by ${message.author.tag}`);
        
        if (channel.topic) {
            await channel.setTopic(`📁 **ARCHIVED** | ${channel.topic}`);
        } else {
            await channel.setTopic(`📁 **ARCHIVED** | Archived by ${message.author.tag}`);
        }

        await logChannelChange(null, message.guild, 'ARCHIVE', {
            channelId: channel.id,
            channelName: channel.name,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('Channel Archived', 
                `${channel} has been archived and is now read-only.\n` +
                `To unarchive, rename the channel and restore permissions.`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Archive Channel', error.message)] 
        });
    }
}

export async function handleChannelPurge(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Messages** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    let amount = parseInt(args[1]);

    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the specified channel.')] 
        });
    }

    if (isNaN(amount) || amount < 1 || amount > 1000) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Amount', 'Please specify an amount between 1 and 1000.')] 
        });
    }

    try {
        const userFilter = args[2];
        let messages;

        if (userFilter) {
            const userMention = userFilter.match(/<@!?(\d+)>/);
            let userId;
            
            if (userMention) {
                userId = userMention[1];
            } else {
                const user = await message.guild.members.fetch(userFilter).catch(() => null);
                if (user) userId = user.id;
            }

            if (userId) {
                messages = await channel.messages.fetch({ limit: 100 });
                messages = messages.filter(m => {
                    const isWithinTime = Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000;
                    const isFromUser = m.author.id === userId;
                    return isWithinTime && isFromUser;
                }).first(amount);
            } else {
                return await message.reply({ 
                    embeds: [createErrorEmbed('User Not Found', 'Could not find the specified user.')] 
                });
            }
        } else {
            messages = await channel.messages.fetch({ limit: Math.min(amount, 100) });
            messages = Array.from(messages.values());
        }

        if (messages.length === 0) {
            return await message.reply({ 
                embeds: [createErrorEmbed('No Messages Found', 'No messages found to delete.')] 
            });
        }

        const deleted = await channel.bulkDelete(messages, true);

        await logChannelChange(null, message.guild, 'PURGE', {
            channelId: channel.id,
            channelName: channel.name,
            deletedCount: deleted.size,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('Messages Purged', 
                `Successfully deleted **${deleted.size}** messages from ${channel}.`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Purge Messages', error.message)] 
        });
    }
}

export async function handleChannelClone(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Channels** permission to use this command.')] 
        });
    }

    const sourceChannel = await resolveChannel(message, args[0]);
    const newName = args[1] || `${sourceChannel.name}-clone`;

    if (!sourceChannel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the source channel.')] 
        });
    }

    if (sourceChannel.type === ChannelType.GuildCategory) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Channel Type', 'Cannot clone categories.')] 
        });
    }

    try {
        const newChannel = await sourceChannel.clone({
            name: newName,
            reason: `Cloned by ${message.author.tag}`
        });

        await logChannelChange(null, message.guild, 'CLONE', {
            sourceChannelId: sourceChannel.id,
            sourceChannelName: sourceChannel.name,
            newChannelId: newChannel.id,
            newChannelName: newChannel.name,
            moderatorId: message.author.id,
            moderatorTag: message.author.tag
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('Channel Cloned', 
                `Successfully cloned ${sourceChannel} as ${newChannel}.`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Clone Channel', error.message)] 
        });
    }
}

export async function handleLockdown(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Administrator** permission to use this command.')] 
        });
    }

    const subcommand = args[0]?.toLowerCase();

    if (!subcommand || subcommand === 'quick') {
        const reason = args.slice(1).join(' ') || 'Quick lockdown initiated';
        const channels = message.guild.channels.cache.filter(c => 
            c.type !== ChannelType.GuildCategory
        );

        let locked = 0;
        for (const channel of channels.values()) {
            try {
                const isVoice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
                await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    SendMessages: false,
                    AddReactions: false,
                    Connect: isVoice ? false : undefined
                }, { reason });
                locked++;
            } catch (e) {
                console.error(`Failed to lock ${channel.name}:`, e);
            }
        }

        lockdownRecords.set(message.guild.id, {
            type: 'quick',
            reason,
            lockedBy: message.author.id,
            lockedAt: Date.now(),
            channelsLocked: locked
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('🔒 Quick Lockdown Complete', 
                `**${locked}** channels have been locked.\n` +
                `Reason: ${reason}`)] 
        });
    }

    if (subcommand === 'selective') {
        const roles = args.slice(1).filter(a => a.startsWith('<@&') || /^\d+$/.test(a));
        const reason = args.slice(1 + roles.length).join(' ') || 'Selective lockdown initiated';

        if (roles.length === 0) {
            return await message.reply({ 
                embeds: [createErrorEmbed('Invalid Usage', 
                    'Usage: `!lockdown selective <roles...> [reason]`\n' +
                    'Example: `!lockdown selective @muted @new Members Server under attack`')] 
            });
        }

        const roleIds = roles.map(r => {
            const match = r.match(/<@&(\d+)>/);
            return match ? match[1] : r;
        });

        let locked = 0;
        const textChannels = message.guild.channels.cache.filter(c => 
            c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement
        );

        for (const channel of textChannels.values()) {
            try {
                for (const roleId of roleIds) {
                    await channel.permissionOverwrites.edit(roleId, {
                        SendMessages: false,
                        AddReactions: false
                    }, { reason });
                }
                locked++;
            } catch (e) {
                console.error(`Failed to lock ${channel.name}:`, e);
            }
        }

        lockdownRecords.set(message.guild.id, {
            type: 'selective',
            roleIds,
            reason,
            lockedBy: message.author.id,
            lockedAt: Date.now(),
            channelsLocked: locked
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('🔒 Selective Lockdown Complete', 
                `**${locked}** text channels locked for specified roles.\n` +
                `Reason: ${reason}`)] 
        });
    }

    if (subcommand === 'unlock') {
        const unlockType = args[1]?.toLowerCase();
        let unlocked = 0;

        const previousLockdown = lockdownRecords.get(message.guild.id);
        
        if (unlockType === 'scheduled') {
            return await message.reply({ 
                embeds: [createInfoEmbed('Scheduled Unlock', 
                    `This server's lockdown will auto-expire at:\n` +
                    `<t:${Math.floor((previousLockdown?.lockedAt || Date.now()) + 30 * 60 * 1000 / 1000)}:F>`)] 
            });
        }

        const allChannels = message.guild.channels.cache.filter(c => 
            c.type !== ChannelType.GuildCategory
        );

        for (const channel of allChannels.values()) {
            try {
                const isVoice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
                await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    SendMessages: null,
                    AddReactions: null,
                    Connect: null
                });
                unlocked++;
            } catch (e) {
                console.error(`Failed to unlock ${channel.name}:`, e);
            }
        }

        lockdownRecords.delete(message.guild.id);

        return await message.reply({ 
            embeds: [createSuccessEmbed('🔓 Server Unlocked', 
                `**${unlocked}** channels have been restored.`)] 
        });
    }

    if (subcommand === 'status') {
        const lockdown = lockdownRecords.get(message.guild.id);
        
        if (!lockdown) {
            return await message.reply({ 
                embeds: [createInfoEmbed('Lockdown Status', 'No active lockdown on this server.')] 
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0xFF0055)
            .setTitle('🔒 Lockdown Status')
            .addFields(
                { name: 'Type', value: lockdown.type, inline: true },
                { name: 'Channels Affected', value: String(lockdown.channelsLocked), inline: true },
                { name: 'Locked At', value: `<t:${Math.floor(lockdown.lockedAt / 1000)}:F>`, inline: true },
                { name: 'Reason', value: lockdown.reason, inline: false },
                { name: 'Locked By', value: `<@${lockdown.lockedBy}>`, inline: true }
            )
            .setTimestamp();

        return await message.reply({ embeds: [embed] });
    }

    return await message.reply({ 
        embeds: [createErrorEmbed('Invalid Subcommand', 
            'Available: `quick`, `selective`, `unlock`, `status`')] 
    });
}

export async function handleThreadCreate(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageThreads)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Threads** permission to use this command.')] 
        });
    }

    const channel = await resolveChannel(message, args[0]);
    const threadName = args.slice(1).join(' ');

    if (!channel) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Channel Not Found', 'Could not find the specified channel.')] 
        });
    }

    if (!threadName) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!thread-create <channel> <name>`')] 
        });
    }

    try {
        const thread = await channel.threads.create({
            name: threadName,
            reason: `Created by ${message.author.tag}`
        });

        return await message.reply({ 
            embeds: [createSuccessEmbed('Thread Created', 
                `Successfully created thread ${thread} in ${channel}.`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Create Thread', error.message)] 
        });
    }
}

export async function handleThreadArchive(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageThreads)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Threads** permission to use this command.')] 
        });
    }

    const thread = await resolveChannel(message, args[0]);
    
    if (!thread || !thread.isThread()) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Thread', 'Please specify a valid thread.')] 
        });
    }

    try {
        await thread.setArchived(true, `Archived by ${message.author.tag}`);

        return await message.reply({ 
            embeds: [createSuccessEmbed('Thread Archived', `${thread.name} has been archived.`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Archive Thread', error.message)] 
        });
    }
}

export async function handleThreadLock(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageThreads)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Threads** permission to use this command.')] 
        });
    }

    const thread = await resolveChannel(message, args[0]);
    
    if (!thread || !thread.isThread()) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Thread', 'Please specify a valid thread.')] 
        });
    }

    try {
        await thread.setLocked(true, `Locked by ${message.author.tag}`);

        return await message.reply({ 
            embeds: [createSuccessEmbed('Thread Locked', `${thread.name} has been locked.`)] 
        });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Lock Thread', error.message)] 
        });
    }
}

export async function handleThreadInfo(message, args) {
    const thread = await resolveChannel(message, args[0]);
    
    if (!thread || !thread.isThread()) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Thread', 'Please specify a valid thread.')] 
        });
    }

    try {
        const embed = new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle(`📌 Thread Info: ${thread.name}`)
            .addFields(
                { name: 'ID', value: `\`${thread.id}\``, inline: true },
                { name: 'Created', value: `<t:${Math.floor(thread.createdTimestamp / 1000)}:F>`, inline: true },
                { name: 'Archive Status', value: thread.archived ? 'Archived' : 'Active', inline: true },
                { name: 'Locked', value: thread.locked ? 'Yes' : 'No', inline: true },
                { name: 'Member Count', value: String(thread.memberCount || 'N/A'), inline: true },
                { name: 'Message Count', value: String(thread.messageCount || 'N/A'), inline: true }
            );

        if (thread.ownerId) {
            const owner = await message.guild.members.fetch(thread.ownerId).catch(() => null);
            embed.addFields({ name: 'Owner', value: owner ? owner.user.tag : thread.ownerId, inline: true });
        }

        return await message.reply({ embeds: [embed] });
    } catch (error) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Failed to Get Thread Info', error.message)] 
        });
    }
}

export async function handleChannelHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle('📚 Channel Management Commands')
        .setDescription('Comprehensive channel management system for Discord servers.')
        .addFields(
            { name: '📝 Channel Creation', value: '`!channel-create <type> <name> [topic] [perms]`', inline: false },
            { name: '🗑️ Channel Deletion', value: '`!channel-delete <channel>`', inline: false },
            { name: '🔒 Channel Lock', value: '`!channel-lock <channel> [reason]`', inline: false },
            { name: '🔓 Channel Unlock', value: '`!channel-unlock <channel>`', inline: false },
            { name: '📝 Rename Channel', value: '`!channel-rename <channel> <newName>`', inline: false },
            { name: '📋 Set Topic', value: '`!channel-topic <channel> <topic>`', inline: false },
            { name: '⏱️ Slowmode', value: '`!channel-slowmode <channel> [preset|seconds]`', inline: false },
            { name: '📊 Channel Info', value: '`!channel-info <channel>`', inline: false },
            { name: '📁 Archive Channel', value: '`!channel-archive <channel>`', inline: false },
            { name: '🧹 Purge Messages', value: '`!channel-purge <amount> [user]`', inline: false },
            { name: '📋 Clone Channel', value: '`!channel-clone <channel> [newName]`', inline: false }
        )
        .addFields(
            { name: '🔒 Lockdown Commands', value: '', inline: false },
            { name: 'Quick Lockdown', value: '`!lockdown [reason]`', inline: true },
            { name: 'Selective Lockdown', value: '`!lockdown selective <roles> [reason]`', inline: true },
            { name: 'Unlock All', value: '`!lockdown unlock`', inline: true },
            { name: 'Status', value: '`!lockdown status`', inline: true }
        )
        .addFields(
            { name: '🧵 Thread Commands', value: '', inline: false },
            { name: 'Create Thread', value: '`!thread-create <channel> <name>`', inline: false },
            { name: 'Archive Thread', value: '`!thread-archive <thread>`', inline: false },
            { name: 'Lock Thread', value: '`!thread-lock <thread>`', inline: false },
            { name: 'Thread Info', value: '`!thread-info <thread>`', inline: false }
        )
        .addFields(
            { name: '📌 Slowmode Presets', value: '`5s`, `10s`, `30s`, `1m`, `5m`, `15m`, `1h`', inline: false },
            { name: '📌 Channel Types', value: '`text`, `voice`, `forum`, `announcement`, `stage`', inline: false }
        )
        .setFooter({ text: 'Use the commands above to manage your server channels.' })
        .setTimestamp();

    return await message.reply({ embeds: [embed] });
}

export function getChannelHistory(guildId, limit = 50) {
    const history = channelHistory.get(guildId) || [];
    return history.slice(-limit).reverse();
}

export function getLockdownRecord(channelId) {
    return lockdownRecords.get(channelId);
}
