import { EmbedBuilder, Colors, PermissionFlagsBits, ChannelType } from 'discord.js';
import { welcomeSystem } from '../utils/welcomeSystem.js';

function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

async function checkAdminPermission(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await message.reply({
            embeds: [createErrorEmbed('Permission Denied', 'Administrator permission required.')]
        });
        return false;
    }
    return true;
}

export async function handleWelcome(message, args) {
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand || subcommand === 'help') {
        return showWelcomeHelp(message);
    }

    switch (subcommand) {
        case 'setup':
            return handleWelcomeSetup(message, args.slice(1));
        case 'channel':
            return handleWelcomeChannel(message, args.slice(1));
        case 'message':
            return handleWelcomeMessage(message, args.slice(1));
        case 'role':
            return handleWelcomeRole(message, args.slice(1));
        case 'birthday':
            return handleBirthdayRole(message, args.slice(1));
        case 'test':
            return handleWelcomeTest(message, args.slice(1));
        case 'virtual':
            return handleVirtualWelcome(message, args.slice(1));
        case 'delay':
            return handleWelcomeDelay(message, args.slice(1));
        case 'image':
        case 'gif':
            return handleWelcomeImage(message, args.slice(1));
        case 'color':
            return handleWelcomeColor(message, args.slice(1));
        case 'milestones':
            return handleMilestones(message, args.slice(1));
        case 'disable':
            return handleWelcomeDisable(message);
        case 'enable':
            return handleWelcomeEnable(message);
        case 'status':
        case 'stats':
            return handleWelcomeStatus(message);
        default:
            return message.reply({
                embeds: [createErrorEmbed('Unknown Subcommand', `Use \`!welcome help\` to see available commands.`)]
            });
    }
}

async function showWelcomeHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Welcome System Commands')
        .setDescription('Configure welcome and goodbye messages for your server.')
        .addFields(
            { name: '!welcome setup #channel', value: 'Quick setup with a channel', inline: false },
            { name: '!welcome channel #channel', value: 'Set welcome channel', inline: false },
            { name: '!welcome message <text>', value: 'Set welcome message', inline: false },
            { name: '!welcome role @role', value: 'Set auto-assign role on join', inline: false },
            { name: '!welcome birthday @role', value: 'Set birthday role', inline: false },
            { name: '!welcome test', value: 'Test the welcome message', inline: false },
            { name: '!welcome virtual <name>', value: 'Test with a fake user', inline: false },
            { name: '!welcome delay <seconds>', value: 'Delay welcome messages', inline: false },
            { name: '!welcome image <url>', value: 'Set welcome image/GIF', inline: false },
            { name: '!welcome color <hex>', value: 'Set embed color', inline: false },
            { name: '!welcome milestones <on/off>', value: 'Toggle member count milestones', inline: false },
            { name: '!welcome disable', value: 'Disable welcome messages', inline: false },
            { name: '!welcome enable', value: 'Enable welcome messages', inline: false },
            { name: '!welcome status', value: 'View current settings', inline: false }
        )
        .addFields(
            { name: 'Placeholders', value: '`{user}` `{username}` `{usertag}` `{server}` `{memberCount}` `{userAvatar}` `{serverIcon}` `{createdAt}` `{joinedAt}` `{nl}`', inline: false }
        )
        .setFooter({ text: 'Requires Administrator permission' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleWelcomeSetup(message, args) {
    if (!await checkAdminPermission(message)) return;

    const channel = message.mentions.channels.first();
    if (!channel || channel.type !== ChannelType.GuildText) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid Channel', 'Please mention a text channel.\nUsage: `!welcome setup #channel`')]
        });
    }

    welcomeSystem.setWelcomeChannel(message.guild.id, channel.id);

    return message.reply({
        embeds: [createSuccessEmbed('Welcome System Configured', 
            `Welcome messages will be sent to ${channel}\n\n` +
            `**Next steps:**\n` +
            `• \`!welcome message <text>\` - Customize message\n` +
            `• \`!welcome role @role\` - Auto-assign role\n` +
            `• \`!welcome test\` - Preview message`
        )]
    });
}

async function handleWelcomeChannel(message, args) {
    if (!await checkAdminPermission(message)) return;

    const channel = message.mentions.channels.first();
    if (!channel || channel.type !== ChannelType.GuildText) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid Channel', 'Please mention a text channel.')]
        });
    }

    welcomeSystem.setWelcomeChannel(message.guild.id, channel.id);

    return message.reply({
        embeds: [createSuccessEmbed('Channel Updated', `Welcome messages will be sent to ${channel}`)]
    });
}

async function handleWelcomeMessage(message, args) {
    if (!await checkAdminPermission(message)) return;

    const text = args.join(' ');
    if (!text) {
        return message.reply({
            embeds: [createErrorEmbed('Missing Message', 
                'Usage: `!welcome message <text>`\n\n' +
                '**Placeholders:**\n' +
                '`{user}` - Mentions the user\n' +
                '`{username}` - User\'s name\n' +
                '`{server}` - Server name\n' +
                '`{memberCount}` - Member count'
            )]
        });
    }

    welcomeSystem.setWelcomeMessage(message.guild.id, text);

    return message.reply({
        embeds: [createSuccessEmbed('Message Updated', `New welcome message:\n\n${text}`)]
    });
}

async function handleWelcomeRole(message, args) {
    if (!await checkAdminPermission(message)) return;

    const role = message.mentions.roles.first();
    if (!role) {
        const config = welcomeSystem.getGuildConfig(message.guild.id);
        if (config.joinRole) {
            welcomeSystem.setJoinRole(message.guild.id, null);
            return message.reply({
                embeds: [createSuccessEmbed('Role Removed', 'Auto-assign role has been disabled.')]
            });
        }
        return message.reply({
            embeds: [createErrorEmbed('Missing Role', 'Usage: `!welcome role @role`\nRun without a role to disable.')]
        });
    }

    const botMember = message.guild.members.me;
    if (role.position >= botMember.roles.highest.position) {
        return message.reply({
            embeds: [createErrorEmbed('Role Too High', 'I cannot assign a role that is higher than or equal to my highest role.')]
        });
    }

    welcomeSystem.setJoinRole(message.guild.id, role.id);

    return message.reply({
        embeds: [createSuccessEmbed('Join Role Set', `New members will receive ${role}`)]
    });
}

async function handleBirthdayRole(message, args) {
    if (!await checkAdminPermission(message)) return;

    const role = message.mentions.roles.first();
    if (!role) {
        return message.reply({
            embeds: [createErrorEmbed('Missing Role', 'Usage: `!welcome birthday @role`')]
        });
    }

    welcomeSystem.setBirthdayRole(message.guild.id, role.id);

    return message.reply({
        embeds: [createSuccessEmbed('Birthday Role Set', `Birthday role set to ${role}`)]
    });
}

async function handleWelcomeTest(message, args) {
    if (!await checkAdminPermission(message)) return;

    const config = welcomeSystem.getGuildConfig(message.guild.id);
    if (!config.welcomeChannel) {
        return message.reply({
            embeds: [createErrorEmbed('Not Configured', 'Please set up a welcome channel first with `!welcome setup #channel`')]
        });
    }

    await welcomeSystem.sendTestWelcome(message.channel, message.member, message.guild);
}

async function handleVirtualWelcome(message, args) {
    if (!await checkAdminPermission(message)) return;

    const username = args.join(' ') || 'TestUser';

    const config = welcomeSystem.getGuildConfig(message.guild.id);
    if (!config.welcomeChannel) {
        return message.reply({
            embeds: [createErrorEmbed('Not Configured', 'Please set up a welcome channel first with `!welcome setup #channel`')]
        });
    }

    await welcomeSystem.sendVirtualWelcome(message.channel, username, message.guild);
}

async function handleWelcomeDelay(message, args) {
    if (!await checkAdminPermission(message)) return;

    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 300) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid Delay', 'Please provide a number between 0 and 300 seconds.')]
        });
    }

    welcomeSystem.setWelcomeDelay(message.guild.id, seconds * 1000);

    return message.reply({
        embeds: [createSuccessEmbed('Delay Set', 
            seconds === 0 
                ? 'Welcome messages will be sent immediately.'
                : `Welcome messages will be delayed by ${seconds} seconds.`
        )]
    });
}

async function handleWelcomeImage(message, args) {
    if (!await checkAdminPermission(message)) return;

    const url = args[0];
    if (!url) {
        welcomeSystem.setWelcomeImage(message.guild.id, null);
        return message.reply({
            embeds: [createSuccessEmbed('Image Removed', 'Welcome image has been removed.')]
        });
    }

    if (!url.startsWith('http')) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid URL', 'Please provide a valid image URL.')]
        });
    }

    welcomeSystem.setWelcomeImage(message.guild.id, url);

    return message.reply({
        embeds: [createSuccessEmbed('Image Set', `Welcome image/GIF has been updated.`)]
    });
}

async function handleWelcomeColor(message, args) {
    if (!await checkAdminPermission(message)) return;

    const color = args[0];
    if (!color || !/^#?[0-9A-Fa-f]{6}$/.test(color)) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid Color', 'Please provide a valid hex color (e.g., #5865F2 or 5865F2)')]
        });
    }

    const hexColor = color.startsWith('#') ? color : `#${color}`;
    welcomeSystem.setEmbedColor(message.guild.id, 'welcome', hexColor);

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(hexColor)
                .setTitle('Color Updated')
                .setDescription(`Welcome embed color set to \`${hexColor}\``)
                .setTimestamp()
        ]
    });
}

async function handleMilestones(message, args) {
    if (!await checkAdminPermission(message)) return;

    const option = args[0]?.toLowerCase();
    if (!['on', 'off', 'enable', 'disable'].includes(option)) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid Option', 'Usage: `!welcome milestones <on/off>`')]
        });
    }

    const enabled = option === 'on' || option === 'enable';
    welcomeSystem.toggleMemberCountAnnouncements(message.guild.id, enabled);

    return message.reply({
        embeds: [createSuccessEmbed('Milestones Updated', 
            enabled 
                ? 'Member count milestone announcements are now enabled.'
                : 'Member count milestone announcements are now disabled.'
        )]
    });
}

async function handleWelcomeDisable(message) {
    if (!await checkAdminPermission(message)) return;

    welcomeSystem.disable(message.guild.id);

    return message.reply({
        embeds: [createSuccessEmbed('Disabled', 'Welcome system has been disabled.')]
    });
}

async function handleWelcomeEnable(message) {
    if (!await checkAdminPermission(message)) return;

    const config = welcomeSystem.getGuildConfig(message.guild.id);
    if (!config.welcomeChannel) {
        return message.reply({
            embeds: [createErrorEmbed('Not Configured', 'Please set up a welcome channel first with `!welcome setup #channel`')]
        });
    }

    welcomeSystem.enable(message.guild.id);

    return message.reply({
        embeds: [createSuccessEmbed('Enabled', 'Welcome system has been enabled.')]
    });
}

async function handleWelcomeStatus(message) {
    if (!await checkAdminPermission(message)) return;

    const stats = welcomeSystem.getStats(message.guild.id);
    const config = welcomeSystem.getGuildConfig(message.guild.id);

    const embed = new EmbedBuilder()
        .setColor(stats.enabled ? Colors.Green : Colors.Red)
        .setTitle('Welcome System Status')
        .addFields(
            { name: 'Status', value: stats.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: 'Welcome Channel', value: stats.welcomeChannel ? `<#${stats.welcomeChannel}>` : 'Not set', inline: true },
            { name: 'Goodbye Channel', value: stats.goodbyeChannel ? `<#${stats.goodbyeChannel}>` : 'Same as welcome', inline: true },
            { name: 'Join Role', value: stats.joinRole ? `<@&${stats.joinRole}>` : 'None', inline: true },
            { name: 'Birthday Role', value: stats.birthdayRole ? `<@&${stats.birthdayRole}>` : 'None', inline: true },
            { name: 'Delay', value: stats.delayMs > 0 ? `${stats.delayMs / 1000}s` : 'None', inline: true },
            { name: 'Milestones', value: stats.announceMemberCount ? '✅ On' : '❌ Off', inline: true },
            { name: 'Welcome Message', value: config.welcomeMessage?.substring(0, 100) + (config.welcomeMessage?.length > 100 ? '...' : '') || 'Default', inline: false }
        )
        .setTimestamp();

    if (Object.keys(stats.leaveReasons).length > 0) {
        const reasons = Object.entries(stats.leaveReasons)
            .map(([type, count]) => `${type}: ${count}`)
            .join('\n');
        embed.addFields({ name: 'Leave Statistics', value: reasons, inline: false });
    }

    return message.reply({ embeds: [embed] });
}

export async function handleGoodbye(message, args) {
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand || subcommand === 'help') {
        return showGoodbyeHelp(message);
    }

    switch (subcommand) {
        case 'channel':
            return handleGoodbyeChannel(message, args.slice(1));
        case 'message':
            return handleGoodbyeMessage(message, args.slice(1));
        case 'image':
        case 'gif':
            return handleGoodbyeImage(message, args.slice(1));
        case 'color':
            return handleGoodbyeColor(message, args.slice(1));
        default:
            return message.reply({
                embeds: [createErrorEmbed('Unknown Subcommand', `Use \`!goodbye help\` to see available commands.`)]
            });
    }
}

async function showGoodbyeHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Goodbye System Commands')
        .setDescription('Configure goodbye messages for your server.')
        .addFields(
            { name: '!goodbye channel #channel', value: 'Set goodbye channel (defaults to welcome channel)', inline: false },
            { name: '!goodbye message <text>', value: 'Set goodbye message', inline: false },
            { name: '!goodbye image <url>', value: 'Set goodbye image/GIF', inline: false },
            { name: '!goodbye color <hex>', value: 'Set embed color', inline: false }
        )
        .addFields(
            { name: 'Placeholders', value: '`{user}` `{username}` `{usertag}` `{server}` `{memberCount}`', inline: false }
        )
        .setFooter({ text: 'Leave reasons are tracked automatically' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleGoodbyeChannel(message, args) {
    if (!await checkAdminPermission(message)) return;

    const channel = message.mentions.channels.first();
    if (!channel || channel.type !== ChannelType.GuildText) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid Channel', 'Please mention a text channel.')]
        });
    }

    welcomeSystem.setGoodbyeChannel(message.guild.id, channel.id);

    return message.reply({
        embeds: [createSuccessEmbed('Channel Updated', `Goodbye messages will be sent to ${channel}`)]
    });
}

async function handleGoodbyeMessage(message, args) {
    if (!await checkAdminPermission(message)) return;

    const text = args.join(' ');
    if (!text) {
        return message.reply({
            embeds: [createErrorEmbed('Missing Message', 'Usage: `!goodbye message <text>`')]
        });
    }

    welcomeSystem.setGoodbyeMessage(message.guild.id, text);

    return message.reply({
        embeds: [createSuccessEmbed('Message Updated', `New goodbye message:\n\n${text}`)]
    });
}

async function handleGoodbyeImage(message, args) {
    if (!await checkAdminPermission(message)) return;

    const url = args[0];
    if (!url) {
        welcomeSystem.setGoodbyeImage(message.guild.id, null);
        return message.reply({
            embeds: [createSuccessEmbed('Image Removed', 'Goodbye image has been removed.')]
        });
    }

    if (!url.startsWith('http')) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid URL', 'Please provide a valid image URL.')]
        });
    }

    welcomeSystem.setGoodbyeImage(message.guild.id, url);

    return message.reply({
        embeds: [createSuccessEmbed('Image Set', `Goodbye image/GIF has been updated.`)]
    });
}

async function handleGoodbyeColor(message, args) {
    if (!await checkAdminPermission(message)) return;

    const color = args[0];
    if (!color || !/^#?[0-9A-Fa-f]{6}$/.test(color)) {
        return message.reply({
            embeds: [createErrorEmbed('Invalid Color', 'Please provide a valid hex color.')]
        });
    }

    const hexColor = color.startsWith('#') ? color : `#${color}`;
    welcomeSystem.setEmbedColor(message.guild.id, 'goodbye', hexColor);

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(hexColor)
                .setTitle('Color Updated')
                .setDescription(`Goodbye embed color set to \`${hexColor}\``)
                .setTimestamp()
        ]
    });
}

export { welcomeSystem };
