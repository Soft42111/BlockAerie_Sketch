import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed, createWarningEmbed } from '../utils/messageFormatter.js';
import { config } from '../config.js';

const DANGEROUS_PERMISSIONS = [
    'Administrator',
    'BanMembers',
    'KickMembers',
    'ManageChannels',
    'ManageGuild',
    'ManageRoles',
    'ManageWebhooks',
    'ModerateMembers'
];

const PERMISSION_NAMES = {
    [PermissionFlagsBits.CreateInstantInvite]: 'Create Instant Invite',
    [PermissionFlagsBits.KickMembers]: 'Kick Members',
    [PermissionFlagsBits.BanMembers]: 'Ban Members',
    [PermissionFlagsBits.Administrator]: 'Administrator',
    [PermissionFlagsBits.ManageChannels]: 'Manage Channels',
    [PermissionFlagsBits.ManageGuild]: 'Manage Server',
    [PermissionFlagsBits.AddReactions]: 'Add Reactions',
    [PermissionFlagsBits.ViewAuditLog]: 'View Audit Log',
    [PermissionFlagsBits.PrioritySpeaker]: 'Priority Speaker',
    [PermissionFlagsBits.Stream]: 'Video',
    [PermissionFlagsBits.ViewChannel]: 'Read Messages',
    [PermissionFlagsBits.SendMessages]: 'Send Messages',
    [PermissionFlagsBits.SendTTSMessages]: 'Send TTS Messages',
    [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
    [PermissionFlagsBits.EmbedLinks]: 'Embed Links',
    [PermissionFlagsBits.AttachFiles]: 'Attach Files',
    [PermissionFlagsBits.ReadMessageHistory]: 'Read Message History',
    [PermissionFlagsBits.MentionEveryone]: 'Mention Everyone',
    [PermissionFlagsBits.UseExternalEmojis]: 'Use External Emojis',
    [PermissionFlagsBits.ViewGuildInsights]: 'View Server Insights',
    [PermissionFlagsBits.Connect]: 'Connect',
    [PermissionFlagsBits.Speak]: 'Speak',
    [PermissionFlagsBits.MuteMembers]: 'Mute Members',
    [PermissionFlagsBits.DeafenMembers]: 'Deafen Members',
    [PermissionFlagsBits.MoveMembers]: 'Move Members',
    [PermissionFlagsBits.UseVAD]: 'Use Voice Activity',
    [PermissionFlagsBits.ChangeNickname]: 'Change Nickname',
    [PermissionFlagsBits.ManageNicknames]: 'Manage Nicknames',
    [PermissionFlagsBits.ManageRoles]: 'Manage Roles',
    [PermissionFlagsBits.ManageWebhooks]: 'Manage Webhooks',
    [PermissionFlagsBits.ManageEmojisAndStickers]: 'Manage Emojis & Stickers',
    [PermissionFlagsBits.UseApplicationCommands]: 'Use Application Commands',
    [PermissionFlagsBits.RequestToSpeak]: 'Request to Speak',
    [PermissionFlagsBits.ManageEvents]: 'Manage Events',
    [PermissionFlagsBits.ManageThreads]: 'Manage Threads',
    [PermissionFlagsBits.CreatePublicThreads]: 'Create Public Threads',
    [PermissionFlagsBits.CreatePrivateThreads]: 'Create Private Threads',
    [PermissionFlagsBits.UseExternalStickers]: 'Use External Stickers',
    [PermissionFlagsBits.SendMessagesInThreads]: 'Send Messages in Threads',
    [PermissionFlagsBits.UseEmbeddedActivities]: 'Use Activities',
    [PermissionFlagsBits.ModerateMembers]: 'Timeout Members',
    [PermissionFlagsBits.ViewCreatorMonetizationAnalytics]: 'View Creator Monetization Analytics',
    [PermissionFlagsBits.UseSoundboard]: 'Use Soundboard',
    [PermissionFlagsBits.CreateExpressions]: 'Create Expressions',
    [PermissionFlagsBits.UseExternalSounds]: 'Use External Sounds',
    [PermissionFlagsBits.SendVoiceMessages]: 'Send Voice Messages',
};

export const roleManagementData = {
    selfAssignableRoles: new Map(),
    roleTemplates: new Map(),
    roleCategories: new Map(),
    roleLogs: new Map(),
};

export function parseColor(colorInput) {
    if (!colorInput) return null;
    
    const colorStr = colorInput.toLowerCase().replace('#', '');
    
    if (/^[0-9a-f]{6}$/i.test(colorStr)) {
        return parseInt(colorStr, 16);
    }
    
    if (/^[0-9]+$/.test(colorStr)) {
        const color = parseInt(colorStr, 10);
        if (color >= 0 && color <= 16777215) return color;
    }
    
    const namedColors = {
        'default': 0,
        'white': 16777215,
        'grey': 9807270,
        'gray': 9807270,
        'dark_grey': 9936031,
        'dark_gray': 9936031,
        'black': 0,
        'red': 15158332,
        'dark_red': 10038562,
        'orange': 15105570,
        'dark_orange': 11027200,
        'yellow': 15844367,
        'gold': 15846144,
        'green': 3066993,
        'dark_green': 2355339,
        'blue': 3447003,
        'dark_blue': 2123412,
        'purple': 10181046,
        'dark_purple': 7499534,
        'magenta': 15404156,
        'pink': 15277667,
        'cyan': 1752220,
        'teal': 3426654,
        'aqua': 3426654,
        'brown': 9927815,
        'camo': 65335,
    };
    
    if (namedColors[colorStr]) {
        return namedColors[colorStr];
    }
    
    return null;
}

export function formatPermissions(permissions) {
    const permArray = [];
    
    for (const [bit, name] of Object.entries(PermissionFlagsBits)) {
        if (permissions.has(bit)) {
            permArray.push(PERMISSION_NAMES[bit] || name);
        }
    }
    
    if (permArray.length === 0) return 'None';
    
    return permArray.join(', ');
}

export function checkHierarchy(highestRole, targetRole) {
    return highestRole.position > targetRole.position;
}

export async function handleRoleCreate(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    if (args.length < 1) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 
                'Usage: `!role-create <name> [color] [hoist] [mentionable]`\n\n' +
                'Examples:\n' +
                '`!role-create Moderators #00D9FF true true`\n' +
                '`!role-create VIP Gold false false`\n' +
                '`!role-create NewRole #FF0000`')] 
        });
    }

    const name = args[0];
    const colorArg = args[1];
    const hoistArg = args[2];
    const mentionableArg = args[3];

    const color = parseColor(colorArg) || 0;
    const hoist = hoistArg?.toLowerCase() === 'true';
    const mentionable = mentionableArg?.toLowerCase() === 'true';

    try {
        const highestRole = message.guild.members.me?.roles.highest;
        const botMember = message.guild.members.me;

        if (highestRole && highestRole.position < 250) {
            return await message.reply({
                embeds: [createWarningEmbed('Bot Role Too Low', 
                    '⚠️ The bot\'s highest role is below position 250. ' +
                    'Please move the bot\'s role higher in the server settings to create new roles.')]
            });
        }

        const newRole = await message.guild.roles.create({
            name,
            color,
            hoist,
            mentionable,
            reason: `Created by ${message.author.tag}`,
        });

        logRoleChange(message.guild.id, {
            action: 'create',
            role: newRole.id,
            roleName: newRole.name,
            moderator: message.author.id,
            details: { color, hoist, mentionable }
        });

        const colorHex = `#${newRole.color.toString(16).padStart(6, '0')}`;
        
        return await message.reply({
            embeds: [createSuccessEmbed('Role Created', 
                `✅ Created role **${newRole.name}**\n\n` +
                `**ID:** ${newRole.id}\n` +
                `**Color:** ${colorHex}\n` +
                `**Hoisted:** ${hoist ? 'Yes' : 'No'}\n` +
                `**Mentionable:** ${mentionable ? 'Yes' : 'No'}`)]
        });
    } catch (error) {
        return await message.reply({
            embeds: [createErrorEmbed('Failed to Create Role', error.message)]
        });
    }
}

export async function handleRoleDelete(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const role = message.mentions.roles.first();
    if (!role) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-delete <role>`')] 
        });
    }

    if (role.id === message.guild.id) {
        return await message.reply({
            embeds: [createErrorEmbed('Cannot Delete', 'Cannot delete the @everyone role.')]
        });
    }

    const highestRole = message.member.roles.highest;
    if (!checkHierarchy(highestRole, role)) {
        return await message.reply({
            embeds: [createErrorEmbed('Hierarchy Error', 
                '❌ You cannot delete a role that is higher than or equal to your highest role.')]
        });
    }

    const botHighestRole = message.guild.members.me?.roles.highest;
    if (botHighestRole && !checkHierarchy(botHighestRole, role)) {
        return await message.reply({
            embeds: [createErrorEmbed('Hierarchy Error', 
                '❌ The bot cannot delete a role that is higher than or equal to its highest role.')]
        });
    }

    try {
        const roleName = role.name;
        await role.delete(`Deleted by ${message.author.tag}`);

        logRoleChange(message.guild.id, {
            action: 'delete',
            roleId: role.id,
            roleName: roleName,
            moderator: message.author.id
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Role Deleted', `✅ Deleted role **${roleName}**`)]
        });
    } catch (error) {
        return await message.reply({
            embeds: [createErrorEmbed('Failed to Delete Role', error.message)]
        });
    }
}

export async function handleRoleAdd(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const user = message.mentions.members.first();
    const role = message.mentions.roles.first();

    if (!user) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-add <user> <role>`')] 
        });
    }

    if (!role) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Please mention a role.')] 
        });
    }

    if (user.roles.cache.has(role.id)) {
        return await message.reply({
            embeds: [createInfoEmbed('Already Has Role', `${user.user.tag} already has the **${role.name}** role.`)]
        });
    }

    const highestRole = message.member.roles.highest;
    if (role.position >= highestRole.position && message.guild.ownerId !== message.author.id) {
        return await message.reply({
            embeds: [createErrorEmbed('Hierarchy Error', 
                '❌ You cannot assign a role that is higher than or equal to your highest role.')]
        });
    }

    try {
        await user.roles.add(role, `Assigned by ${message.author.tag}`);

        logRoleChange(message.guild.id, {
            action: 'assign',
            userId: user.id,
            roleId: role.id,
            roleName: role.name,
            moderator: message.author.id
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Role Assigned', 
                `✅ Added **${role.name}** to ${user.user.tag}`)]
        });
    } catch (error) {
        return await message.reply({
            embeds: [createErrorEmbed('Failed to Assign Role', error.message)]
        });
    }
}

export async function handleRoleRemove(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const user = message.mentions.members.first();
    const role = message.mentions.roles.first();

    if (!user) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-remove <user> <role>`')] 
        });
    }

    if (!role) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Please mention a role.')] 
        });
    }

    if (!user.roles.cache.has(role.id)) {
        return await message.reply({
            embeds: [createInfoEmbed('No Role', `${user.user.tag} doesn't have the **${role.name}** role.`)]
        });
    }

    const highestRole = message.member.roles.highest;
    if (role.position >= highestRole.position && message.guild.ownerId !== message.author.id) {
        return await message.reply({
            embeds: [createErrorEmbed('Hierarchy Error', 
                '❌ You cannot remove a role that is higher than or equal to your highest role.')]
        });
    }

    try {
        await user.roles.remove(role, `Removed by ${message.author.tag}`);

        logRoleChange(message.guild.id, {
            action: 'remove',
            userId: user.id,
            roleId: role.id,
            roleName: role.name,
            moderator: message.author.id
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Role Removed', 
                `✅ Removed **${role.name}** from ${user.user.tag}`)]
        });
    } catch (error) {
        return await message.reply({
            embeds: [createErrorEmbed('Failed to Remove Role', error.message)]
        });
    }
}

export async function handleRoleColor(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const role = message.mentions.roles.first();
    if (!role) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-color <role> <color>`\n\n' +
                'Color formats:\n' +
                '• Hex: `#FF5733` or `FF5733`\n' +
                '• Decimal: `16733565`\n' +
                '• Name: `red`, `blue`, `gold`, `cyan`, etc.')] 
        });
    }

    if (args.length < 2) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Please provide a color value.')] 
        });
    }

    const colorInput = args[1];
    const color = parseColor(colorInput);

    if (color === null) {
        return await message.reply({
            embeds: [createErrorEmbed('Invalid Color', 
                `Could not parse color: "${colorInput}".\n\n` +
                'Valid formats:\n' +
                '• Hex: `#FF5733` or `FF5733`\n' +
                '• Decimal: `16733565`\n' +
                '• Name: `red`, `blue`, `gold`, `cyan`, etc.')]
        });
    }

    try {
        await role.setColor(color, `Color changed by ${message.author.tag}`);
        
        const oldColorHex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : 'None';
        const newColorHex = `#${color.toString(16).padStart(6, '0')}`;

        logRoleChange(message.guild.id, {
            action: 'color',
            roleId: role.id,
            roleName: role.name,
            moderator: message.author.id,
            oldValue: oldColorHex,
            newValue: newColorHex
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Color Changed', 
                `✅ Updated **${role.name}** color\n\n` +
                `Old: ${oldColorHex}\n` +
                `New: ${newColorHex}`)]
        });
    } catch (error) {
        return await message.reply({
            embeds: [createErrorEmbed('Failed to Change Color', error.message)]
        });
    }
}

export async function handleRolePermissions(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const role = message.mentions.roles.first();
    if (!role) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-permissions <role> [permissions]`\n\n' +
                'To view current permissions: `!role-permissions @role`\n' +
                'To set permissions: `!role-permissions @role +admin +kick -speak`\n\n' +
                'Use + to add, - to remove, or just list permissions to set them.')] 
        });
    }

    if (args.length < 2) {
        const currentPerms = formatPermissions(role.permissions);
        const dangerous = [];
        
        for (const [bit, name] of Object.entries(PermissionFlagsBits)) {
            if (role.permissions.has(bit)) {
                const displayName = PERMISSION_NAMES[bit] || name;
                if (DANGEROUS_PERMISSIONS.includes(displayName)) {
                    dangerous.push(displayName);
                }
            }
        }

        const hasDangerous = dangerous.length > 0;
        const color = hasDangerous ? config.colors.warning : config.colors.info;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`Permissions for ${role.name}`)
            .setDescription(currentPerms)
            .setTimestamp();

        if (hasDangerous) {
            embed.addFields({
                name: '⚠️ Dangerous Permissions',
                value: dangerous.join(', ')
            });
        }

        return await message.reply({ embeds: [embed] });
    }

    const permInput = args.slice(1).join(' ');
    const permissionBits = role.permissions;

    const changes = permInput.split(/[\s,]+/);
    let newPermissions = permissionBits.bitfield;

    for (const change of changes) {
        const isAdd = change.startsWith('+');
        const isRemove = change.startsWith('-');
        const permName = change.replace(/^[+-]/, '').toLowerCase();

        const permBit = Object.entries(PermissionFlagsBits).find(
            ([key, val]) => 
                key.toLowerCase() === permName || 
                (PERMISSION_NAMES[val] || '').toLowerCase().replace(/\s+/g, '') === permName.replace(/\s+/g, '')
        );

        if (permBit) {
            if (isAdd) {
                newPermissions |= permBit[1];
            } else if (isRemove) {
                newPermissions &= ~permBit[1];
            } else {
                newPermissions = permBit[1];
            }
        }
    }

    const hasDangerous = DANGEROUS_PERMISSIONS.some(p => {
        const permBit = Object.entries(PermissionFlagsBits).find(
            ([key, val]) => (PERMISSION_NAMES[val] || '') === p
        );
        return permBit && (newPermissions & permBit[1]) !== 0;
    });

    try {
        await role.setPermissions(newPermissions, `Permissions changed by ${message.author.tag}`);

        logRoleChange(message.guild.id, {
            action: 'permissions',
            roleId: role.id,
            roleName: role.name,
            moderator: message.author.id,
            oldValue: permissionBits.bitfield,
            newValue: newPermissions
        });

        const status = hasDangerous 
            ? '⚠️ Permissions updated (includes dangerous permissions)' 
            : '✅ Permissions updated';

        return await message.reply({
            embeds: [createSuccessEmbed(status, 
                `Updated permissions for **${role.name}**\n\n` +
                `New bitfield: ${newPermissions}`)]
        });
    } catch (error) {
        return await message.reply({
            embeds: [createErrorEmbed('Failed to Update Permissions', error.message)]
        });
    }
}

export async function handleRoleRename(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const role = message.mentions.roles.first();
    if (!role) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-rename <role> <newName>`')] 
        });
    }

    const newName = args.slice(1).join(' ');
    if (!newName || newName.length < 1 || newName.length > 100) {
        return await message.reply({
            embeds: [createErrorEmbed('Invalid Name', 'Role name must be between 1 and 100 characters.')]
        });
    }

    const highestRole = message.member.roles.highest;
    if (role.position >= highestRole.position && message.guild.ownerId !== message.author.id) {
        return await message.reply({
            embeds: [createErrorEmbed('Hierarchy Error', 
                '❌ You cannot rename a role that is higher than or equal to your highest role.')]
        });
    }

    try {
        const oldName = role.name;
        await role.setName(newName, `Renamed by ${message.author.tag}`);

        logRoleChange(message.guild.id, {
            action: 'rename',
            roleId: role.id,
            roleName: newName,
            moderator: message.author.id,
            oldValue: oldName,
            newValue: newName
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Role Renamed', 
                `✅ **${oldName}** → **${newName}**`)]
        });
    } catch (error) {
        return await message.reply({
            embeds: [createErrorEmbed('Failed to Rename Role', error.message)]
        });
    }
}

export async function handleRoleHierarchy(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const roles = Array.from(message.guild.roles.cache.values())
        .sort((a, b) => b.position - a.position);

    const roleList = roles.map((role, index) => {
        const position = roles.length - index;
        const colorHex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#000000';
        const memberCount = role.members.size;
        const isHoisted = role.hoist ? '📌' : '  ';
        const isMentionable = role.mentionable ? '🔔' : '  ';
        
        return `${isHoisted}${isMentionable} \`${String(position).padStart(3)}\` ${role.name} (${memberCount} members) ${colorHex}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`Role Hierarchy - ${message.guild.name}`)
        .setDescription(roleList || 'No roles found.')
        .setFooter({ text: `Total roles: ${roles.length}` })
        .setTimestamp();

    return await message.reply({ embeds: [embed] });
}

export async function handleRoleInfo(message, args) {
    const role = message.mentions.roles.first();
    if (!role) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-info <role>`')] 
        });
    }

    const roleColorHex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : 'None';
    const createdAt = `<t:${Math.floor(role.createdTimestamp / 1000)}:D>`;
    const memberCount = role.members.size;
    const memberList = role.members.size > 0 
        ? Array.from(role.members.values()).slice(0, 10).map(m => m.user.tag).join(', ')
        : 'None';
    const moreMembers = role.members.size > 10 ? ` (+${role.members.size - 10} more)` : '';

    const permissions = formatPermissions(role.permissions);
    const dangerous = DANGEROUS_PERMISSIONS.filter(p => {
        return Object.entries(PermissionFlagsBits).some(([key, val]) => {
            return (PERMISSION_NAMES[val] === p) && role.permissions.has(key);
        });
    });

    const embed = new EmbedBuilder()
        .setColor(role.color || config.colors.info)
        .setTitle(role.name)
        .setThumbnail(role.iconURL())
        .addFields(
            { name: 'ID', value: role.id, inline: true },
            { name: 'Color', value: roleColorHex, inline: true },
            { name: 'Position', value: String(role.position), inline: true },
            { name: 'Created', value: createdAt, inline: true },
            { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
            { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
            { name: 'Members', value: `${memberCount}${moreMembers}`, inline: true }
        )
        .setTimestamp();

    if (memberList !== 'None') {
        embed.addFields({ name: 'Users with this role', value: memberList + moreMembers });
    }

    if (permissions !== 'None') {
        embed.addFields({ name: 'Permissions', value: permissions });
    }

    if (dangerous.length > 0) {
        embed.addFields({
            name: '⚠️ Dangerous Permissions',
            value: dangerous.join(', ')
        });
    }

    return await message.reply({ embeds: [embed] });
}

export async function handleRoleAssignable(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'add') {
        const role = message.mentions.roles.first();
        if (!role) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-assignable add <role>`')]
            });
        }

        roleManagementData.selfAssignableRoles.set(`${message.guild.id}-${role.id}`, {
            roleId: role.id,
            guildId: message.guild.id,
            addedBy: message.author.id,
            addedAt: Date.now()
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Self-Assignable Role Added', 
                `✅ **${role.name}** is now self-assignable.\n\n` +
                `Users can claim this role using: \`!role-claim @${role.name}\``)]
        });
    }

    if (subcommand === 'remove') {
        const role = message.mentions.roles.first();
        if (!role) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-assignable remove <role>`')]
            });
        }

        const key = `${message.guild.id}-${role.id}`;
        if (!roleManagementData.selfAssignableRoles.has(key)) {
            return await message.reply({
                embeds: [createInfoEmbed('Not Self-Assignable', `**${role.name}** is not self-assignable.`
                )]
            });
        }

        roleManagementData.selfAssignableRoles.delete(key);

        return await message.reply({
            embeds: [createSuccessEmbed('Self-Assignable Role Removed', 
                `✅ **${role.name}** is no longer self-assignable.`
            )]
        });
    }

    const assignableRoles = Array.from(roleManagementData.selfAssignableRoles.values())
        .filter(r => r.guildId === message.guild.id)
        .map(r => {
            const guildRole = message.guild.roles.cache.get(r.roleId);
            return guildRole ? `• ${guildRole.name}` : null;
        })
        .filter(Boolean);

    if (assignableRoles.length === 0) {
        return await message.reply({
            embeds: [createInfoEmbed('Self-Assignable Roles', 
                'No self-assignable roles configured.\n\n' +
                'Usage: `!role-assignable add <role>` to add a self-assignable role.')]
        });
    }

    return await message.reply({
        embeds: [createInfoEmbed('Self-Assignable Roles', 
            `Available roles:\n${assignableRoles.join('\n')}\n\n` +
            `Users can claim these roles with: \`!role-claim <role>\``)]
    });
}

export async function handleRoleClaim(message, args) {
    const role = message.mentions.roles.first();
    if (!role) {
        return await message.reply({
            embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-claim <role>`')] 
        });
    }

    const key = `${message.guild.id}-${role.id}`;
    if (!roleManagementData.selfAssignableRoles.has(key)) {
        return await message.reply({
            embeds: [createErrorEmbed('Not Self-Assignable', 
                `**${role.name}** is not a self-assignable role.\n\n` +
                `Ask a moderator to make it self-assignable using: \`!role-assignable add @${role.name}\``)]
        });
    }

    if (message.member.roles.cache.has(role.id)) {
        return await message.reply({
            embeds: [createInfoEmbed('Already Has Role', `You already have the **${role.name}** role.`) ]
        });
    }

    try {
        await message.member.roles.add(role, `Self-assigned by ${message.author.tag}`);

        logRoleChange(message.guild.id, {
            action: 'claim',
            userId: message.author.id,
            roleId: role.id,
            roleName: role.name,
            moderator: message.author.id,
            selfAssigned: true
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Role Claimed', 
                `✅ You now have the **${role.name}** role!`)]
        });
    } catch (error) {
        return await message.reply({
            embeds: [createErrorEmbed('Failed to Claim Role', error.message)]
        });
    }
}

export async function handleRoleTemplate(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const subcommand = args[0]?.toLowerCase();
    const templateName = args[1]?.toLowerCase();

    if (subcommand === 'save') {
        const roles = message.mentions.roles.first();
        if (!roles) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 
                    'Usage: `!role-template save <name> <roles>`\n\n' +
                    'Example: `!role-template save moderators @mod @helper`')]
            });
        }

        const roleIds = message.mentions.roles.map(r => r.id);
        roleManagementData.roleTemplates.set(`${message.guild.id}-${templateName}`, {
            name: templateName,
            guildId: message.guild.id,
            roleIds,
            createdBy: message.author.id,
            createdAt: Date.now()
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Template Saved', 
                `✅ Saved template **${templateName}** with ${roleIds.length} roles.`) ]
        });
    }

    if (subcommand === 'apply') {
        if (!templateName) {
            return await message.reply({
                apneds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-template apply <name> <user>`')]
            });
        }

        const template = roleManagementData.roleTemplates.get(`${message.guild.id}-${templateName}`);
        if (!template) {
            return await message.reply({
                embeds: [createErrorEmbed('Template Not Found', `Template **${templateName}** not found.`)]
            });
        }

        const user = message.mentions.members.first();
        if (!user) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-template apply <name> <user>`')]
            });
        }

        const guildRoles = template.roleIds
            .map(id => message.guild.roles.cache.get(id))
            .filter(Boolean);

        if (guildRoles.length === 0) {
            return await message.reply({
                embeds: [createErrorEmbed('Template Empty', 'This template has no valid roles.')]
            });
        }

        try {
            await user.roles.add(guildRoles, `Template ${templateName} applied by ${message.author.tag}`);

            logRoleChange(message.guild.id, {
                action: 'template_apply',
                templateName,
                userId: user.id,
                roleIds: template.roleIds,
                moderator: message.author.id
            });

            return await message.reply({
                embeds: [createSuccessEmbed('Template Applied', 
                    `✅ Applied template **${templateName}** to ${user.user.tag}\n` +
                    `Roles: ${guildRoles.map(r => r.name).join(', ')}`)]
            });
        } catch (error) {
            return await message.reply({
                embeds: [createErrorEmbed('Failed to Apply Template', error.message)]
            });
        }
    }

    if (subcommand === 'list') {
        const templates = Array.from(roleManagementData.roleTemplates.values())
            .filter(t => t.guildId === message.guild.id);

        if (templates.length === 0) {
            return await message.reply({
                embeds: [createInfoEmbed('Role Templates', 'No templates saved.')]
            });
        }

        const templateList = templates.map(t => 
            `• **${t.name}** - ${t.roleIds.length} roles`
        ).join('\n');

        return await message.reply({
            embeds: [createInfoEmbed('Role Templates', 
                templateList + '\n\n' +
                `Usage: \`!role-template apply <name> @user\` to apply a template.`) ]
        });
    }

    if (subcommand === 'delete') {
        if (!templateName) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-template delete <name>`')]
            });
        }

        const key = `${message.guild.id}-${templateName}`;
        if (!roleManagementData.roleTemplates.has(key)) {
            return await message.reply({
                embeds: [createErrorEmbed('Template Not Found', `Template **${templateName}** not found.`)]
            });
        }

        roleManagementData.roleTemplates.delete(key);

        return await message.reply({
            embeds: [createSuccessEmbed('Template Deleted', 
                `✅ Deleted template **${templateName}**.`) ]
        });
    }

    return await message.reply({
        embeds: [createErrorEmbed('Invalid Subcommand', 
            'Available subcommands:\n' +
            '• `save <name> <roles>` - Save a role template\n' +
            '• `apply <name> <user>` - Apply a template to a user\n' +
            '• `list` - List all templates\n' +
            '• `delete <name>` - Delete a template')]
    });
}

export async function handleRoleCategory(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'create') {
        const name = args[1];
        if (!name) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-category create <name> [roles]`')]
            });
        }

        const roleIds = message.mentions.roles.map(r => r.id);
        roleManagementData.roleCategories.set(`${message.guild.id}-${name}`, {
            name,
            guildId: message.guild.id,
            roleIds,
            createdBy: message.author.id,
            createdAt: Date.now()
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Category Created', 
                `✅ Created category **${name}** with ${roleIds.length} roles.`) ]
        });
    }

    if (subcommand === 'assign') {
        const categoryName = args[1];
        const user = message.mentions.members.first();

        if (!categoryName || !user) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!role-category assign <category> <user>`')]
            });
        }

        const category = roleManagementData.roleCategories.get(`${message.guild.id}-${categoryName}`);
        if (!category) {
            return await message.reply({
                embeds: [createErrorEmbed('Category Not Found', `Category **${categoryName}** not found.`)]
            });
        }

        const guildRoles = category.roleIds
            .map(id => message.guild.roles.cache.get(id))
            .filter(Boolean);

        if (guildRoles.length === 0) {
            return await message.reply({
                embeds: [createErrorEmbed('Category Empty', 'This category has no valid roles.')]
            });
        }

        try {
            await user.roles.add(guildRoles, `Category ${categoryName} assigned by ${message.author.tag}`);

            return await message.reply({
                embeds: [createSuccessEmbed('Category Assigned', 
                    `✅ Assigned ${guildRoles.length} roles from **${categoryName}** to ${user.user.tag}`)]
            });
        } catch (error) {
            return await message.reply({
                embeds: [createErrorEmbed('Failed to Assign Category', error.message)]
            });
        }
    }

    const categories = Array.from(roleManagementData.roleCategories.values())
        .filter(c => c.guildId === message.guild.id);

    if (categories.length === 0) {
        return await message.reply({
            embeds: [createInfoEmbed('Role Categories', 'No categories created.')]
        });
    }

    const categoryList = categories.map(c => 
        `• **${c.name}** - ${c.roleIds.length} roles`
    ).join('\n');

    return await message.reply({
        embeds: [createInfoEmbed('Role Categories', 
            categoryList + '\n\n' +
            `Usage: \`!role-category assign <name> @user\` to assign all roles in a category.`) ]
    });
}

export async function handleRoleBatch(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')] 
        });
    }

    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'add') {
        const roles = message.mentions.roles;
        const users = message.mentions.members;

        if (roles.size === 0 || users.size === 0) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 
                    'Usage: `!role-batch add <roles> <users>`\n\n' +
                    'Example: `!role-batch add @mod @helper @user1 @user2`')]
            });
        }

        const results = [];
        for (const user of users.values()) {
            for (const role of roles.values()) {
                if (!user.roles.cache.has(role.id)) {
                    try {
                        await user.roles.add(role);
                        results.push(`Added ${role.name} to ${user.user.tag}`);
                    } catch (error) {
                        results.push(`Failed to add ${role.name} to ${user.user.tag}: ${error.message}`);
                    }
                }
            }
        }

        return await message.reply({
            embeds: [createSuccessEmbed('Batch Role Add', 
                `Processed ${users.size} users and ${roles.size} roles:\n\n` +
                results.slice(0, 10).join('\n') + 
                (results.length > 10 ? `\n\n... and ${results.length - 10} more` : ''))]
        });
    }

    if (subcommand === 'remove') {
        const roles = message.mentions.roles;
        const users = message.mentions.members;

        if (roles.size === 0 || users.size === 0) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage', 
                    'Usage: `!role-batch remove <roles> <users>`\n\n' +
                    'Example: `!role-batch remove @mod @helper @user1 @user2`')]
            });
        }

        const results = [];
        for (const user of users.values()) {
            for (const role of roles.values()) {
                if (user.roles.cache.has(role.id)) {
                    try {
                        await user.roles.remove(role);
                        results.push(`Removed ${role.name} from ${user.user.tag}`);
                    } catch (error) {
                        results.push(`Failed to remove ${role.name} from ${user.user.tag}: ${error.message}`);
                    }
                }
            }
        }

        return await message.reply({
            embeds: [createSuccessEmbed('Batch Role Remove', 
                `Processed ${users.size} users and ${roles.size} roles:\n\n` +
                results.slice(0, 10).join('\n') + 
                (results.length > 10 ? `\n\n... and ${results.length - 10} more` : ''))]
        });
    }

    return await message.reply({
        embeds: [createErrorEmbed('Invalid Subcommand', 
            'Available subcommands:\n' +
            '• `add <roles> <users>` - Add multiple roles to multiple users\n' +
            '• `remove <roles> <users>` - Remove multiple roles from multiple users')]
    });
}

export async function handleRoleLogs(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        return await message.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'You need **View Audit Log** permission to use this command.')] 
        });
    }

    const logs = roleManagementData.roleLogs.get(message.guild.id) || [];
    const recentLogs = logs.slice(-50).reverse();

    if (recentLogs.length === 0) {
        return await message.reply({
            embeds: [createInfoEmbed('Role Logs', 'No role change logs found.')]
        });
    }

    const logList = recentLogs.map(log => {
        const moderator = message.guild.members.cache.get(log.moderator);
        const moderatorName = moderator?.user?.tag || 'Unknown';
        const timestamp = `<t:${Math.floor(log.timestamp / 1000)}:R>`;
        
        let actionText = '';
        switch (log.action) {
            case 'create':
                actionText = `Created role **${log.roleName}**`;
                break;
            case 'delete':
                actionText = `Deleted role **${log.roleName}**`;
                break;
            case 'assign':
                actionText = `Assigned **${log.roleName}** to <@${log.userId}>`;
                break;
            case 'remove':
                actionText = `Removed **${log.roleName}** from <@${log.userId}>`;
                break;
            case 'color':
                actionText = `Changed color of **${log.roleName}**: ${log.oldValue} → ${log.newValue}`;
                break;
            case 'permissions':
                actionText = `Updated permissions of **${log.roleName}**`;
                break;
            case 'rename':
                actionText = `Renamed role: ${log.oldValue} → ${log.newValue}`;
                break;
            case 'claim':
                actionText = `Self-assigned **${log.roleName}**`;
                break;
            default:
                actionText = `Performed ${log.action}`;
        }

        return `**${timestamp}** ${moderatorName}: ${actionText}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle('Role Management Logs')
        .setDescription(logList.length > 4000 ? logList.slice(0, 4000) + '...' : logList)
        .setFooter({ text: `Showing last ${recentLogs.length} entries` })
        .setTimestamp();

    return await message.reply({ embeds: [embed] });
}

function logRoleChange(guildId, data) {
    if (!roleManagementData.roleLogs.has(guildId)) {
        roleManagementData.roleLogs.set(guildId, []);
    }

    roleManagementData.roleLogs.get(guildId).push({
        ...data,
        timestamp: Date.now()
    });

    if (roleManagementData.roleLogs.get(guildId).length > 1000) {
        roleManagementData.roleLogs.get(guildId).shift();
    }
}
