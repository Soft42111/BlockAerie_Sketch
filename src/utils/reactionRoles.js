import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    PermissionFlagsBits,
    ChannelSelectMenuBuilder,
    ChannelType,
    RoleSelectMenuBuilder,
    UserSelectMenuBuilder,
    ComponentType
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed, createWarningEmbed } from './messageFormatter.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'reaction_roles.json');

export const reactionRolesData = {
    configs: new Map(),
    componentHandlers: new Map(),
    expirations: new Map()
};

class ReactionRolesManager {
    constructor() {
        this.data = {
            guilds: {},
            components: [],
            logs: []
        };
        this.loadData();
        this.startExpirationChecker();
    }

    loadData() {
        try {
            if (fs.existsSync(DATA_PATH)) {
                const content = fs.readFileSync(DATA_PATH, 'utf8');
                const parsed = JSON.parse(content);
                this.data = parsed;
                this.rebuildMaps();
            } else {
                this.data = {
                    guilds: {},
                    components: [],
                    logs: []
                };
                this.saveData();
            }
        } catch (error) {
            console.error('Error loading reaction roles data:', error);
            this.data = {
                guilds: {},
                components: [],
                logs: []
            };
        }
    }

    saveData() {
        try {
            const guildsData = {};
            for (const [guildId, guildData] of this.data.guilds.entries ? [] : Object.entries(this.data.guilds)) {
                if (guildData && typeof guildData === 'object') {
                    guildsData[guildId] = guildData;
                }
            }
            const saveObj = {
                guilds: guildsData,
                components: Array.isArray(this.data.components) ? this.data.components : [],
                logs: Array.isArray(this.data.logs) ? this.data.logs : []
            };
            fs.writeFileSync(DATA_PATH, JSON.stringify(saveObj, null, 2));
        } catch (error) {
            console.error('Error saving reaction roles data:', error);
        }
    }

    rebuildMaps() {
        reactionRolesData.configs.clear();
        for (const [guildId, guildData] of Object.entries(this.data.guilds)) {
            if (guildData?.reactionRoles) {
                for (const [messageId, reactionRole] of Object.entries(guildData.reactionRoles)) {
                    reactionRolesData.configs.set(messageId, {
                        ...reactionRole,
                        guildId
                    });
                }
            }
        }
    }

    startExpirationChecker() {
        setInterval(() => {
            this.processExpiredRoles();
        }, 60000);
    }

    processExpiredRoles() {
        const now = Date.now();
        for (const [guildId, guildData] of Object.entries(this.data.guilds)) {
            if (!guildData?.reactionRoles) continue;

            for (const [messageId, reactionRole] of Object.entries(guildData.reactionRoles)) {
                if (!reactionRole.roleExpirations) continue;

                for (const [userId, expirationData] of Object.entries(reactionRole.roleExpirations)) {
                    if (expirationData.expiresAt && now >= expirationData.expiresAt) {
                        this.removeExpiredRole(guildId, messageId, userId, expirationData.roleId);
                        delete reactionRole.roleExpirations[userId];
                    }
                }
            }
        }
        this.saveData();
    }

    async removeExpiredRole(guildId, messageId, userId, roleId) {
        try {
            const guild = this.getGuildById(guildId);
            if (!guild) return;

            const member = await guild.members.fetch(userId);
            if (member && member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId, 'Role expired');
                this.logRoleChange(guildId, {
                    action: 'expire',
                    userId,
                    roleId,
                    moderator: 'SYSTEM',
                    messageId
                });
            }
        } catch (error) {
            console.error('Error removing expired role:', error);
        }
    }

    getGuildById(guildId) {
        const { client } = global;
        return client?.guilds?.cache?.get(guildId);
    }

    async checkHierarchy(guild, member, role) {
        const botMember = guild.members.me;
        if (!botMember) return false;

        const highestBotRole = botMember.roles.highest;
        const highestMemberRole = member.roles.highest;

        if (role.position >= highestBotRole.position) {
            return { valid: false, reason: 'Bot cannot manage this role (hierarchy)' };
        }

        if (role.position >= highestMemberRole.position && guild.ownerId !== member.id) {
            return { valid: false, reason: 'You cannot manage this role (hierarchy)' };
        }

        return { valid: true };
    }

    async validateRole(guild, roleId) {
        const role = guild.roles.cache.get(roleId);
        if (!role) {
            return { valid: false, reason: 'Role not found', role: null };
        }

        if (role.id === guild.id) {
            return { valid: false, reason: 'Cannot use @everyone role', role };
        }

        const botMember = guild.members.me;
        if (role.position >= botMember.roles.highest.position) {
            return { valid: false, reason: 'Bot role is not high enough', role };
        }

        return { valid: true, role };
    }

    generateComponentId() {
        return `rr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    async createReactionRole(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return await message.reply({
                embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')]
            });
        }

        const subcommand = args[0]?.toLowerCase();

        if (subcommand === 'emoji') {
            return await this.createEmojiReactionRole(message, args.slice(1));
        }

        if (subcommand === 'button') {
            return await this.createButtonReactionRole(message, args.slice(1));
        }

        return await this.showCreateMenu(message);
    }

    async showCreateMenu(message) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('Create Reaction Role')
            .setDescription('Choose a method to create your reaction role:')
            .addFields(
                { name: '📝 Emoji Reaction', value: 'Use emoji reactions to assign roles', inline: false },
                { name: '🔘 Button', value: 'Use buttons to assign roles', inline: false }
            )
            .setFooter({ text: 'Usage: !reactionrole create emoji <role> <emoji>\n       !reactionrole create button <role> [button_label]' });

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('rr_create_select')
                    .setPlaceholder('Select creation method')
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Emoji Reaction')
                            .setDescription('Add a reaction emoji to assign a role')
                            .setValue('emoji')
                            .setEmoji('📝'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Button')
                            .setDescription('Add a button to assign a role')
                            .setValue('button')
                            .setEmoji('🔘')
                    )
            );

        return await message.reply({ embeds: [embed], components: [row] });
    }

    async createEmojiReactionRole(message, args) {
        if (args.length < 2) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage',
                    'Usage: `!reactionrole create emoji <role> <emoji>`\n\n' +
                    'Example: `!reactionrole create emoji @ColorRed 🔴`\n' +
                    'Example: `!reactionrole create emoji "Premium Role" 🎖️`')]
            });
        }

        const role = message.mentions.roles.first();
        if (!role) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Role', 'Please mention a valid role.')]
            });
        }

        const emojiArg = args[args.length - 1];
        const roleName = args.length > 2 ? args.slice(0, -1).join(' ') : null;

        const hierarchyCheck = await this.checkHierarchy(message.guild, message.member, role);
        if (!hierarchyCheck.valid) {
            return await message.reply({
                embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)]
            });
        }

        const guildId = message.guild.id;
        if (!this.data.guilds[guildId]) {
            this.data.guilds[guildId] = { reactionRoles: {} };
        }

        const messageArg = args.find(arg => arg.startsWith('<'));
        const targetMessage = messageArg ? await this.resolveMessage(message, messageArg) : message;

        if (!targetMessage) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Message', 'Could not find the specified message.')]
            });
        }

        const emoji = this.parseEmoji(emojiArg);

        const reactionRoleData = {
            messageId: targetMessage.id,
            channelId: targetMessage.channel.id,
            roleId: role.id,
            roleName: role.name,
            emoji: emoji.raw || emojiArg,
            guildId,
            createdBy: message.author.id,
            createdAt: Date.now(),
            selfAssignable: false,
            exclusiveGroup: null,
            requiredRole: null,
            expiresIn: null,
            componentId: null
        };

        this.data.guilds[guildId].reactionRoles[targetMessage.id] = reactionRoleData;
        this.rebuildMaps();
        this.saveData();

        try {
            await targetMessage.react(emoji.raw || emojiArg);
        } catch (error) {
            return await message.reply({
                embeds: [createErrorEmbed('Reaction Failed', `Could not add reaction: ${error.message}`)]
            });
        }

        this.logRoleChange(guildId, {
            action: 'create_emoji',
            messageId: targetMessage.id,
            roleId: role.id,
            emoji: emoji.raw || emojiArg,
            moderator: message.author.id
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Reaction Role Created',
                `✅ Created emoji reaction role on message ${targetMessage.id}\n\n` +
                `**Role:** ${role.name}\n` +
                `**Emoji:** ${emoji.raw || emojiArg}\n` +
                `**Channel:** <#${targetMessage.channel.id}>`)]
        });
    }

    async createButtonReactionRole(message, args) {
        if (args.length < 1) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Usage',
                    'Usage: `!reactionrole create button <role> [button_label]`\n\n' +
                    'Example: `!reactionrole create button @ColorRed Red`\n' +
                    'Example: `!reactionrole create button "Premium Role" 🎖️`')]
            });
        }

        const role = message.mentions.roles.first();
        if (!role) {
            return await message.reply({
                embeds: [createErrorEmbed('Invalid Role', 'Please mention a valid role.')]
            });
        }

        const hierarchyCheck = await this.checkHierarchy(message.guild, message.member, role);
        if (!hierarchyCheck.valid) {
            return await message.reply({
                embeds: [createErrorEmbed('Hierarchy Error', hierarchyCheck.reason)]
            });
        }

        const guildId = message.guild.id;
        if (!this.data.guilds[guildId]) {
            this.data.guilds[guildId] = { reactionRoles: {}, buttonRoles: {} };
        }

        let buttonLabel = args.length > 1 ? args.slice(1).join(' ') : role.name;
        const componentId = this.generateComponentId();

        const buttonData = {
            componentId,
            roleId: role.id,
            roleName: role.name,
            buttonLabel,
            buttonStyle: ButtonStyle.Primary,
            selfAssignable: false,
            exclusiveGroup: null,
            requiredRole: null,
            expiresIn: null,
            guildId,
            createdBy: message.author.id,
            createdAt: Date.now()
        };

        if (!this.data.components) {
            this.data.components = [];
        }
        this.data.components.push(buttonData);
        this.saveData();

        this.logRoleChange(guildId, {
            action: 'create_button',
            componentId,
            roleId: role.id,
            buttonLabel,
            moderator: message.author.id
        });

        return await message.reply({
            embeds: [createSuccessEmbed('Button Role Created',
                `✅ Created button role\n\n` +
                `**Role:** ${role.name}\n` +
                `**Button:** ${buttonLabel}\n` +
                `**Component ID:** ${componentId}`)]
        });
    }

    async showCreateButtonsMenu(message) {
        const role = await this.promptRoleSelect(message);
        if (!role) return;

        const label = await this.promptButtonLabel(message);
        if (label === null) return;

        const buttonStyle = await this.promptButtonStyle(message);
        if (!buttonStyle) return;

        const options = await this.promptAdvancedOptions(message);
        if (options === null) return;

        const guildId = message.guild.id;
        const componentId = this.generateComponentId();

        const buttonData = {
            componentId,
            roleId: role.id,
            roleName: role.name,
            buttonLabel: label,
            buttonStyle,
            selfAssignable: options.selfAssignable,
            exclusiveGroup: options.exclusiveGroup || null,
            requiredRole: options.requiredRole?.id || null,
            expiresIn: options.expiresIn,
            guildId,
            createdBy: message.author.id,
            createdAt: Date.now()
        };

        if (!this.data.components) {
            this.data.components = [];
        }
        this.data.components.push(buttonData);
        this.saveData();

        return await message.reply({
            embeds: [createSuccessEmbed('Button Role Created',
                `✅ Created button role\n\n` +
                `**Role:** ${role.name}\n` +
                `**Label:** ${label}\n` +
                `**Style:** ${buttonStyle}\n` +
                `**Self-Assignable:** ${options.selfAssignable}`)]
        });
    }

    async promptRoleSelect(message) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setTitle('Select Role')
            .setDescription('Select the role to assign with this button:');

        const row = new ActionRowBuilder()
            .addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('rr_role_select')
                    .setPlaceholder('Select a role')
                    .setMinValues(1)
                    .setMaxValues(1)
            );

        const reply = await message.reply({ embeds: [embed], components: [row] });

        try {
            const interaction = await reply.awaitMessageComponent({
                componentType: ComponentType.RoleSelect,
                time: 30000
            });

            await interaction.update({ components: [] });

            if (interaction.values.length > 0) {
                return interaction.guild.roles.cache.get(interaction.values[0]);
            }
        } catch (error) {
            await reply.edit({ components: [] });
        }

        return null;
    }

    async promptButtonLabel(message) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setTitle('Button Label')
            .setDescription('Enter the label for this button (or type "skip" to use the role name):');

        const reply = await message.reply({ embeds: [embed] });

        try {
            const collected = await message.channel.awaitMessages({
                max: 1,
                time: 30000,
                filter: m => m.author.id === message.author.id
            });

            if (collected.size > 0) {
                const response = collected.first();
                await response.delete().catch(() => {});
                await reply.delete().catch(() => {});
                return response.content || null;
            }
        } catch (error) {
            console.error('Error collecting button label:', error);
        }

        await reply.delete().catch(() => {});
        return null;
    }

    async promptButtonStyle(message) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setTitle('Button Style')
            .setDescription('Select the button style:')
            .addFields(
                { name: '1️⃣ Primary', value: 'Blurple color', inline: true },
                { name: '2️⃣ Secondary', value: 'Grey color', inline: true },
                { name: '3️⃣ Success', value: 'Green color', inline: true },
                { name: '4️⃣ Danger', value: 'Red color', inline: true }
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('style_primary').setLabel('Primary').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('style_secondary').setLabel('Secondary').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('style_success').setLabel('Success').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('style_danger').setLabel('Danger').setStyle(ButtonStyle.Danger)
            );

        const reply = await message.reply({ embeds: [embed], components: [row] });

        try {
            const interaction = await reply.awaitMessageComponent({
                time: 30000
            });

            await reply.edit({ components: [] });

            const styleMap = {
                'style_primary': ButtonStyle.Primary,
                'style_secondary': ButtonStyle.Secondary,
                'style_success': ButtonStyle.Success,
                'style_danger': ButtonStyle.Danger
            };

            return styleMap[interaction.customId] || ButtonStyle.Primary;
        } catch (error) {
            await reply.edit({ components: [] });
        }

        return ButtonStyle.Primary;
    }

    async promptAdvancedOptions(message) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setTitle('Advanced Options')
            .setDescription('Configure advanced options (reply "skip" to any to skip):')
            .addFields(
                { name: 'Self-Assignable', value: 'Can users assign this role themselves?', inline: false },
                { name: 'Exclusive Group', value: 'Enter a group name to make roles exclusive within it', inline: false },
                { name: 'Required Role', value: 'Mention a role that must be owned first', inline: false },
                { name: 'Expiration', value: 'Enter expiration time in hours (e.g., "24" for 24 hours)', inline: false }
            );

        const reply = await message.reply({ embeds: [embed] });

        try {
            const collected = await message.channel.awaitMessages({
                max: 4,
                time: 60000,
                filter: m => m.author.id === message.author.id
            });

            await reply.delete().catch(() => {});
            collected.forEach(m => m.delete().catch(() => {}));

            const options = {
                selfAssignable: false,
                exclusiveGroup: null,
                requiredRole: null,
                expiresIn: null
            };

            for (const msg of collected.values()) {
                const content = msg.content.toLowerCase();
                if (content === 'true' || content === 'yes') {
                    options.selfAssignable = true;
                } else if (content.startsWith('group:')) {
                    options.exclusiveGroup = content.replace('group:', '').trim();
                } else if (msg.mentions.roles.size > 0) {
                    options.requiredRole = msg.mentions.roles.first();
                } else if (!isNaN(content) && parseInt(content) > 0) {
                    options.expiresIn = parseInt(content) * 60 * 60 * 1000;
                }
            }

            return options;
        } catch (error) {
            console.error('Error collecting advanced options:', error);
            await reply.delete().catch(() => {});
        }

        return null;
    }

    async deleteReactionRole(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return await message.reply({
                embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission to use this command.')]
            });
        }

        if (args.length < 1) {
            return await this.showDeleteMenu(message);
        }

        const targetId = args[0];
        const guildId = message.guild.id;

        if (this.data.guilds[guildId]?.reactionRoles?.[targetId]) {
            const reactionRole = this.data.guilds[guildId].reactionRoles[targetId];

            try {
                const channel = await message.guild.channels.fetch(reactionRole.channelId);
                if (channel) {
                    try {
                        const msg = await channel.messages.fetch(targetId);
                        if (msg) {
                            try {
                                await msg.reactions.removeAll().catch(() => {});
                            } catch (e) {}
                        }
                    } catch (e) {}
                }
            } catch (error) {}

            delete this.data.guilds[guildId].reactionRoles[targetId];
            this.rebuildMaps();
            this.saveData();

            this.logRoleChange(guildId, {
                action: 'delete',
                messageId: targetId,
                roleId: reactionRole.roleId,
                moderator: message.author.id
            });

            return await message.reply({
                embeds: [createSuccessEmbed('Reaction Role Deleted', `✅ Deleted reaction role from message ${targetId}`)]
            });
        }

        const componentIndex = this.data.components?.findIndex(c => c.componentId === targetId || c.roleId === targetId);
        if (componentIndex !== undefined && componentIndex >= 0) {
            const component = this.data.components[componentIndex];

            this.data.components.splice(componentIndex, 1);
            this.saveData();

            this.logRoleChange(guildId, {
                action: 'delete_component',
                componentId: targetId,
                roleId: component.roleId,
                moderator: message.author.id
            });

            return await message.reply({
                embeds: [createSuccessEmbed('Button Role Deleted', `✅ Deleted button role with ID ${targetId}`)]
            });
        }

        return await message.reply({
            embeds: [createErrorEmbed('Not Found', 'Could not find a reaction role with that ID.')]
        });
    }

    async showDeleteMenu(message) {
        const guildId = message.guild.id;
        const reactionRoles = this.data.guilds[guildId]?.reactionRoles || {};
        const buttons = this.data.components?.filter(c => c.guildId === guildId) || [];

        const allRoles = [];

        for (const [messageId, rr] of Object.entries(reactionRoles)) {
            allRoles.push({
                type: 'emoji',
                id: messageId,
                roleName: rr.roleName,
                emoji: rr.emoji
            });
        }

        for (const btn of buttons) {
            allRoles.push({
                type: 'button',
                id: btn.componentId,
                roleName: btn.roleName,
                label: btn.buttonLabel
            });
        }

        if (allRoles.length === 0) {
            return await message.reply({
                embeds: [createInfoEmbed('No Reaction Roles', 'No reaction roles configured on this server.')]
            });
        }

        const options = allRoles.slice(0, 25).map(rr => {
            const display = rr.type === 'emoji'
                ? `📝 ${rr.emoji} - ${rr.roleName}`
                : `🔘 ${rr.label} - ${rr.roleName}`;
            return new StringSelectMenuOptionBuilder()
                .setLabel(display.substring(0, 100))
                .setValue(rr.id)
                .setDescription(`ID: ${rr.id.substring(0, 50)}`);
        });

        const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setTitle('Delete Reaction Role')
            .setDescription('Select a reaction role to delete:');

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('rr_delete_select')
                    .setPlaceholder('Select reaction role to delete')
                    .addOptions(options)
            );

        const reply = await message.reply({ embeds: [embed], components: [row] });

        try {
            const interaction = await reply.awaitMessageComponent({
                time: 30000
            });

            const selectedId = interaction.values[0];
            await interaction.update({ components: [] });

            return await this.deleteReactionRole(message, [selectedId]);
        } catch (error) {
            await reply.edit({ components: [] });
        }
    }

    async listReactionRoles(message) {
        const guildId = message.guild.id;
        const reactionRoles = this.data.guilds[guildId]?.reactionRoles || {};
        const buttons = this.data.components?.filter(c => c.guildId === guildId) || [];

        const roleList = [];

        for (const [messageId, rr] of Object.entries(reactionRoles)) {
            const role = message.guild.roles.cache.get(rr.roleId);
            const channel = message.guild.channels.cache.get(rr.channelId);

            roleList.push({
                type: 'emoji',
                id: messageId,
                roleName: role?.name || rr.roleName,
                emoji: rr.emoji,
                channel: channel?.name || rr.channelId,
                selfAssignable: rr.selfAssignable,
                exclusiveGroup: rr.exclusiveGroup,
                requiredRole: rr.requiredRole
            });
        }

        for (const btn of buttons) {
            const role = message.guild.roles.cache.get(btn.roleId);

            roleList.push({
                type: 'button',
                id: btn.componentId,
                roleName: role?.name || btn.roleName,
                label: btn.buttonLabel,
                style: btn.buttonStyle,
                selfAssignable: btn.selfAssignable,
                exclusiveGroup: btn.exclusiveGroup,
                requiredRole: btn.requiredRole
            });
        }

        if (roleList.length === 0) {
            return await message.reply({
                embeds: [createInfoEmbed('Reaction Roles', 'No reaction roles configured on this server.')]
            });
        }

        const chunks = [];
        let currentChunk = '';

        for (const rr of roleList) {
            if (rr.type === 'emoji') {
                const line = `📝 **${rr.emoji}** → ${rr.roleName} ${rr.selfAssignable ? '⭐' : ''} ${rr.exclusiveGroup ? `🔒 (${rr.exclusiveGroup})` : ''}\n   └ Channel: #${rr.channel} | ID: \`${rr.id}\``;
                if (currentChunk.length + line.length > 3800) {
                    chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += line + '\n';
                }
            } else {
                const styleName = { 1: 'Primary', 2: 'Secondary', 3: 'Success', 4: 'Danger' }[rr.style] || 'Primary';
                const line = `🔘 **[${rr.label}]** → ${rr.roleName} ${rr.selfAssignable ? '⭐' : ''} ${rr.exclusiveGroup ? `🔒 (${rr.exclusiveGroup})` : ''}\n   └ Style: ${styleName} | ID: \`${rr.id}\``;
                if (currentChunk.length + line.length > 3800) {
                    chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += line + '\n';
                }
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        const embeds = chunks.map((chunk, index) =>
            new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle(`Reaction Roles (${roleList.length})`)
                .setDescription(chunk)
                .setFooter({ text: `Page ${index + 1}/${chunks.length}` })
                .setTimestamp()
        );

        return await message.reply({ embeds });
    }

    async handleReactionAdd(reaction, user) {
        if (user.bot) return;

        const guildId = reaction.message.guildId;
        const messageId = reaction.message.id;
        const emoji = reaction.emoji.toString();

        const reactionRole = this.data.guilds[guildId]?.reactionRoles?.[messageId];
        if (!reactionRole) return;

        const role = reaction.message.guild.roles.cache.get(reactionRole.roleId);
        if (!role) return;

        if (reactionRole.requiredRole) {
            const member = reaction.message.guild.members.cache.get(user.id);
            if (!member.roles.cache.has(reactionRole.requiredRole)) {
                try {
                    await reaction.users.remove(user.id);
                } catch (e) {}
                return;
            }
        }

        if (reactionRole.exclusiveGroup) {
            await this.handleExclusiveGroup(reaction.message.guild, user, reactionRole.exclusiveGroup, reactionRole.roleId);
        }

        try {
            await reaction.message.guild.members.cache.get(user.id)?.roles.add(role, 'Reaction role assigned');

            if (reactionRole.expiresIn) {
                const expiresAt = Date.now() + reactionRole.expiresIn;
                if (!reactionRole.roleExpirations) {
                    reactionRole.roleExpirations = {};
                }
                reactionRole.roleExpirations[user.id] = {
                    roleId: reactionRole.roleId,
                    expiresAt
                };
                this.saveData();
            }

            this.logRoleChange(guildId, {
                action: 'assign_reaction',
                userId: user.id,
                roleId: reactionRole.roleId,
                emoji,
                moderator: 'REACTION'
            });
        } catch (error) {
            console.error('Error assigning reaction role:', error);
        }
    }

    async handleReactionRemove(reaction, user) {
        if (user.bot) return;

        const guildId = reaction.message.guildId;
        const messageId = reaction.message.id;

        const reactionRole = this.data.guilds[guildId]?.reactionRoles?.[messageId];
        if (!reactionRole) return;

        const role = reaction.message.guild.roles.cache.get(reactionRole.roleId);
        if (!role) return;

        try {
            await reaction.message.guild.members.cache.get(user.id)?.roles.remove(role, 'Reaction role removed');

            this.logRoleChange(guildId, {
                action: 'remove_reaction',
                userId: user.id,
                roleId: reactionRole.roleId,
                moderator: 'REACTION'
            });
        } catch (error) {
            console.error('Error removing reaction role:', error);
        }
    }

    async handleButtonInteraction(interaction) {
        const componentId = interaction.customId;

        if (!componentId.startsWith('rr_')) {
            return;
        }

        const buttonData = this.data.components?.find(c => c.componentId === componentId);
        if (!buttonData) {
            return await interaction.reply({
                embeds: [createErrorEmbed('Not Found', 'This button is no longer available.')],
                ephemeral: true
            });
        }

        const guild = interaction.guild;
        const member = interaction.member;

        const role = guild.roles.cache.get(buttonData.roleId);
        if (!role) {
            return await interaction.reply({
                embeds: [createErrorEmbed('Role Not Found', 'The role for this button no longer exists.')],
                ephemeral: true
            });
        }

        if (buttonData.requiredRole) {
            if (!member.roles.cache.has(buttonData.requiredRole)) {
                const requiredRole = guild.roles.cache.get(buttonData.requiredRole);
                return await interaction.reply({
                    embeds: [createErrorEmbed('Required Role Missing',
                        `You need the **${requiredRole?.name || 'required'}** role to use this button.` )],
                    ephemeral: true
                });
            }
        }

        const hasRole = member.roles.cache.has(buttonData.roleId);

        if (hasRole) {
            try {
                await member.roles.remove(role, 'Button role removed');

                this.logRoleChange(buttonData.guildId, {
                    action: 'remove_button',
                    userId: member.id,
                    roleId: buttonData.roleId,
                    moderator: 'BUTTON'
                });

                return await interaction.reply({
                    embeds: [createSuccessEmbed('Role Removed', `✅ Removed **${role.name}** role.`)],
                    ephemeral: true
                });
            } catch (error) {
                return await interaction.reply({
                    embeds: [createErrorEmbed('Error', `Failed to remove role: ${error.message}`)],
                    ephemeral: true
                });
            }
        }

        if (buttonData.exclusiveGroup) {
            await this.handleExclusiveGroup(guild, member, buttonData.exclusiveGroup, buttonData.roleId);
        }

        try {
            await member.roles.add(role, 'Button role assigned');

            if (buttonData.expiresIn) {
                const expiresAt = Date.now() + buttonData.expiresIn;
                if (!buttonData.roleExpirations) {
                    buttonData.roleExpirations = {};
                }
                buttonData.roleExpirations[member.id] = {
                    roleId: buttonData.roleId,
                    expiresAt
                };
                this.saveData();
            }

            this.logRoleChange(buttonData.guildId, {
                action: 'assign_button',
                userId: member.id,
                roleId: buttonData.roleId,
                moderator: 'BUTTON'
            });

            return await interaction.reply({
                embeds: [createSuccessEmbed('Role Assigned', `✅ Added **${role.name}** role!`)],
                ephemeral: true
            });
        } catch (error) {
            return await interaction.reply({
                embeds: [createErrorEmbed('Error', `Failed to assign role: ${error.message}`)],
                ephemeral: true
            });
        }
    }

    async handleExclusiveGroup(guild, member, groupName, excludeRoleId) {
        const allConfigs = [
            ...Object.values(this.data.guilds[guild.id]?.reactionRoles || {}),
            ...(this.data.components?.filter(c => c.guildId === guild.id) || [])
        ];

        const groupRoles = allConfigs.filter(c => c.exclusiveGroup === groupName);

        for (const config of groupRoles) {
            if (config.roleId !== excludeRoleId && member.roles.cache.has(config.roleId)) {
                const role = guild.roles.cache.get(config.roleId);
                if (role) {
                    await member.roles.remove(role, `Exclusive group: ${groupName}`);
                }
            }
        }
    }

    parseEmoji(emoji) {
        const emojiRegex = /<a?:(\w+):(\d+)>/;
        const match = emoji.match(emojiRegex);

        if (match) {
            return {
                name: match[1],
                id: match[2],
                raw: emoji
            };
        }

        return {
            name: null,
            id: null,
            raw: emoji
        };
    }

    async resolveMessage(message, arg) {
        if (arg.startsWith('<')) {
            const match = arg.match(/<#(\d+)>/);
            if (match) {
                const channelId = match[1];
                const channel = await message.guild.channels.fetch(channelId);
                if (channel && channel.isTextBased()) {
                    const msgId = arg.replace(/<#\d+>/, '').trim().replace(/[<>]/g, '');
                    if (msgId.length >= 17) {
                        return await channel.messages.fetch(msgId).catch(() => null);
                    }
                }
            }
        }

        const parts = arg.split(' ');
        const lastPart = parts[parts.length - 1];
        if (lastPart.length >= 17 && /^\d+$/.test(lastPart)) {
            return await message.channel.messages.fetch(lastPart).catch(() => null);
        }

        return null;
    }

    logRoleChange(guildId, data) {
        if (!this.data.logs) {
            this.data.logs = [];
        }

        this.data.logs.push({
            ...data,
            timestamp: Date.now(),
            guildId
        });

        if (this.data.logs.length > 1000) {
            this.data.logs = this.data.logs.slice(-500);
        }

        this.saveData();
    }

    async getLogs(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
            return await message.reply({
                embeds: [createErrorEmbed('Permission Denied', 'You need **View Audit Log** permission to view logs.')]
            });
        }

        const guildId = message.guild.id;
        const logs = (this.data.logs || []).filter(l => l.guildId === guildId).slice(-50).reverse();

        if (logs.length === 0) {
            return await message.reply({
                embeds: [createInfoEmbed('Reaction Role Logs', 'No logs found.')]
            });
        }

        const logList = logs.map(log => {
            const timestamp = `<t:${Math.floor(log.timestamp / 1000)}:R>`;
            const moderator = log.moderator === 'SYSTEM' ? '🔄 System' :
                             log.moderator === 'REACTION' ? '📝 Reaction' :
                             log.moderator === 'BUTTON' ? '🔘 Button' :
                             `<@${log.moderator}>`;

            let actionText = '';
            switch (log.action) {
                case 'create_emoji':
                    actionText = `Created emoji reaction 📝 ${log.emoji}`;
                    break;
                case 'create_button':
                    actionText = `Created button 🔘 ${log.buttonLabel || ''}`;
                    break;
                case 'assign_reaction':
                    actionText = `Assigned role via reaction 📝`;
                    break;
                case 'assign_button':
                    actionText = `Assigned role via button 🔘`;
                    break;
                case 'remove_reaction':
                    actionText = `Removed role via reaction 📝`;
                    break;
                case 'remove_button':
                    actionText = `Removed role via button 🔘`;
                    break;
                case 'expire':
                    actionText = `Role expired ⏰`;
                    break;
                case 'delete':
                case 'delete_component':
                    actionText = `Deleted configuration`;
                    break;
                default:
                    actionText = `Action: ${log.action}`;
            }

            return `**${timestamp}** ${moderator}: ${actionText}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setTitle('Reaction Role Logs')
            .setDescription(logList.length > 4000 ? logList.slice(0, 4000) + '...' : logList)
            .setFooter({ text: `Showing last ${logs.length} entries` })
            .setTimestamp();

        return await message.reply({ embeds: [embed] });
    }

    async createRolePanel(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return await message.reply({
                embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission.')]
            });
        }

        const guildId = message.guild.id;
        const buttons = this.data.components?.filter(c => c.guildId === guildId) || [];

        if (buttons.length === 0) {
            return await message.reply({
                embeds: [createInfoEmbed('No Button Roles', 'No button roles configured. Create some first!')]
            });
        }

        const buttonRows = [];
        let currentRow = new ActionRowBuilder();

        for (const btn of buttons.slice(0, 25)) {
            const role = message.guild.roles.cache.get(btn.roleId);
            if (!role) continue;

            const button = new ButtonBuilder()
                .setCustomId(btn.componentId)
                .setLabel(btn.buttonLabel)
                .setStyle(btn.buttonStyle);

            if (currentRow.components.length >= 5) {
                buttonRows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }

            currentRow.addComponents(button);
        }

        if (currentRow.components.length > 0) {
            buttonRows.push(currentRow);
        }

        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('Role Selection Panel')
            .setDescription('Click the buttons below to assign/remove roles!')
            .setTimestamp();

        return await message.reply({
            embeds: [embed],
            components: buttonRows
        });
    }

    async configureExclusiveGroup(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return await message.reply({
                embeds: [createErrorEmbed('Permission Denied', 'You need **Manage Roles** permission.')]
            });
        }

        const subcommand = args[0]?.toLowerCase();
        const groupName = args[1];

        if (subcommand === 'add' && groupName) {
            const roles = message.mentions.roles;

            if (roles.size < 2) {
                return await message.reply({
                    embeds: [createErrorEmbed('Invalid Usage',
                        'Usage: `!reactionrole exclusive add <group_name> <roles>`\n\n' +
                        'Example: `!reactionrole exclusive add colors @Red @Blue @Green`')]
                });
            }

            let updated = 0;
            const allConfigs = [
                ...Object.values(this.data.guilds[message.guild.id]?.reactionRoles || {}),
                ...(this.data.components?.filter(c => c.guildId === message.guild.id) || [])
            ];

            for (const config of allConfigs) {
                if (roles.has(config.roleId)) {
                    config.exclusiveGroup = groupName;
                    updated++;
                }
            }

            this.saveData();

            return await message.reply({
                embeds: [createSuccessEmbed('Exclusive Group Created',
                    `✅ Added ${updated} roles to exclusive group **${groupName}**\n\n` +
                    `Users will only be able to have one role from this group at a time.`)]
            });
        }

        if (subcommand === 'remove' && groupName) {
            let removed = 0;
            const allConfigs = [
                ...Object.values(this.data.guilds[message.guild.id]?.reactionRoles || {}),
                ...(this.data.components?.filter(c => c.guildId === message.guild.id) || [])
            ];

            for (const config of allConfigs) {
                if (config.exclusiveGroup === groupName) {
                    config.exclusiveGroup = null;
                    removed++;
                }
            }

            this.saveData();

            return await message.reply({
                embeds: [createSuccessEmbed('Exclusive Group Removed',
                    `✅ Removed ${removed} roles from exclusive group **${groupName}**`)]
            });
        }

        const allConfigs = [
            ...Object.values(this.data.guilds[message.guild.id]?.reactionRoles || {}),
            ...(this.data.components?.filter(c => c.guildId === message.guild.id) || [])
        ];

        const groups = [...new Set(allConfigs.map(c => c.exclusiveGroup).filter(Boolean))];

        if (groups.length === 0) {
            return await message.reply({
                embeds: [createInfoEmbed('Exclusive Groups', 'No exclusive groups configured.')]
            });
        }

        const groupList = groups.map(g => {
            const count = allConfigs.filter(c => c.exclusiveGroup === g).length;
            return `🔒 **${g}** - ${count} roles`;
        }).join('\n');

        return await message.reply({
            embeds: [createInfoEmbed('Exclusive Groups',
                groupList + '\n\n' +
                `Usage: \`!reactionrole exclusive add <group> <roles>\` to create a group\n` +
                `       \`!reactionrole exclusive remove <group>\` to remove a group`)]
        });
    }
}

export const reactionRolesManager = new ReactionRolesManager();

export async function handleReactionRoleCommand(message, args) {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
        case 'create':
        case 'add':
            return await reactionRolesManager.createReactionRole(message, args.slice(1));

        case 'delete':
        case 'remove':
        case 'del':
            return await reactionRolesManager.deleteReactionRole(message, args.slice(1));

        case 'list':
        case 'show':
            return await reactionRolesManager.listReactionRoles(message);

        case 'panel':
        case 'message':
            return await reactionRolesManager.createRolePanel(message, args.slice(1));

        case 'exclusive':
        case 'group':
            return await reactionRolesManager.configureExclusiveGroup(message, args.slice(1));

        case 'logs':
        case 'history':
            return await reactionRolesManager.getLogs(message, args.slice(1));

        case 'help':
        case 'info':
            return await showHelp(message);

        default:
            return await showHelp(message);
    }
}

async function showHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('Reaction Roles Help')
        .setDescription('Manage self-assignable roles through reactions and buttons!')
        .addFields(
            { name: '📝 Creation', value: '`!reactionrole create emoji <role> <emoji>` - Create emoji reaction role\n`!reactionrole create button <role> [label]` - Create button role', inline: false },
            { name: '🔘 Management', value: '`!reactionrole delete <id>` - Delete a reaction role\n`!reactionrole list` - List all reaction roles', inline: false },
            { name: '🔒 Exclusive Groups', value: '`!reactionrole exclusive add <group> <roles>` - Create exclusive group\n`!reactionrole exclusive remove <group>` - Remove exclusive group', inline: false },
            { name: '📊 Other', value: '`!reactionrole panel` - Create role selection panel\n`!reactionrole logs` - View role assignment logs', inline: false }
        )
        .setFooter({ text: 'Reaction Roles System' })
        .setTimestamp();

    return await message.reply({ embeds: [embed] });
}

export async function handleReactionRolesEvent(reaction, user) {
    if (reaction.me) return;

    try {
        if (reaction.message.partial) {
            await reaction.message.fetch();
        }
        await reactionRolesManager.handleReactionAdd(reaction, user);
    } catch (error) {
        console.error('Error handling reaction add:', error);
    }
}

export async function handleReactionRemoveEvent(reaction, user) {
    if (reaction.me) return;

    try {
        if (reaction.message.partial) {
            await reaction.message.fetch();
        }
        await reactionRolesManager.handleReactionRemove(reaction, user);
    } catch (error) {
        console.error('Error handling reaction remove:', error);
    }
}

export async function handleButtonClick(interaction) {
    try {
        await reactionRolesManager.handleButtonInteraction(interaction);
    } catch (error) {
        console.error('Error handling button interaction:', error);
    }
}

export default reactionRolesManager;
