import { PermissionFlagsBits } from 'discord.js';
// No custom error handler needed, using console

export class AuditManager {
    /**
     * Audit the server for administrators and their roles
     * @param {import('discord.js').Guild} guild 
     */
    async crawlServer(guild) {
        try {
            console.log(`ℹ️ Starting audit for server: ${guild.name}`);

            // Ensure all members are cached
            await guild.members.fetch();

            const admins = [];
            const roleData = {};

            // Iterate through members
            guild.members.cache.forEach(member => {
                // Check if member is administrator
                if (member.permissions.has(PermissionFlagsBits.Administrator) && !member.user.bot) {
                    admins.push(member);
                }

                // Collect role statistics
                member.roles.cache.forEach(role => {
                    if (role.name === '@everyone') return;
                    if (!roleData[role.name]) {
                        roleData[role.name] = {
                            count: 0,
                            id: role.id
                        };
                    }
                    roleData[role.name].count++;
                });
            });

            return {
                admins,
                roleData,
                serverName: guild.name,
                memberCount: guild.memberCount
            };
        } catch (error) {
            console.error('❌ Server crawl failed', error);
            throw error;
        }
    }

    /**
     * Format the audit data for a Discord message
     */
    formatAuditResponse(data) {
        let response = `📊 **Server Audit: ${data.serverName}**\n\n`;

        response += `👥 **Total Members:** ${data.memberCount}\n\n`;

        response += `🛡️ **Administrators:**\n`;
        if (data.admins.length > 0) {
            response += data.admins.map(admin => `- <@${admin.id}> (${admin.roles.highest.name})`).join('\n') + '\n\n';
        } else {
            response += `- No non-bot administrators found.\n\n`;
        }

        response += `📜 **Top Roles:**\n`;
        const sortedRoles = Object.entries(data.roleData)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);

        if (sortedRoles.length > 0) {
            response += sortedRoles.map(([name, info]) => `- **${name}**: ${info.count} members`).join('\n');
        } else {
            response += `- No custom roles found.`;
        }

        return response;
    }


    /**
     * Get the log channel for a guild
     * @param {import('discord.js').Guild} guild
     * @returns {Promise<import('discord.js').TextChannel|null>}
     */
    async getLogChannel(guild) {
        // TODO: distinct channels for types (voice, mod, etc.) if configured
        const channel = guild.channels.cache.find(c => c.name === 'mod-logs' || c.name === 'audit-logs');
        return channel || null;
    }

    async log(guild, embed) {
        const channel = await this.getLogChannel(guild);
        if (channel) {
            await channel.send({ embeds: [embed] }).catch(console.error);
        }
    }

    async logMessageDelete(message) {
        if (!message.guild || message.author?.bot) return;
        const { EmbedBuilder, Colors } = await import('discord.js'); // Import dynamically or move to top

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Message Deleted')
            .setColor(Colors.Red)
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(`**Channel:** <#${message.channel.id}>\n**Content:** ${message.content || '[No Content]'}`)
            .setFooter({ text: `ID: ${message.id}` })
            .setTimestamp();

        if (message.attachments.size > 0) {
            embed.addFields({ name: 'Attachments', value: `${message.attachments.size} file(s)` });
        }

        await this.log(message.guild, embed);
    }

    async logMessageUpdate(oldMsg, newMsg) {
        if (!oldMsg.guild || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
        const { EmbedBuilder, Colors } = await import('discord.js');

        const embed = new EmbedBuilder()
            .setTitle('✏️ Message Edited')
            .setColor(Colors.Yellow)
            .setAuthor({ name: oldMsg.author.tag, iconURL: oldMsg.author.displayAvatarURL() })
            .setDescription(`**Channel:** <#${oldMsg.channel.id}>\n[Jump to Message](${newMsg.url})`)
            .addFields(
                { name: 'Before', value: oldMsg.content.substring(0, 1024) || '[No Content]' },
                { name: 'After', value: newMsg.content.substring(0, 1024) || '[No Content]' }
            )
            .setFooter({ text: `ID: ${oldMsg.id}` })
            .setTimestamp();

        await this.log(oldMsg.guild, embed);
    }

    async logMemberJoin(member) {
        const { EmbedBuilder, Colors } = await import('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('📥 Member Joined')
            .setColor(Colors.Green)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
            .setDescription(`<@${member.id}> joined the server.`)
            .addFields(
                { name: 'Account Age', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` },
                { name: 'Member Count', value: `${member.guild.memberCount}` }
            )
            .setFooter({ text: `ID: ${member.id}` })
            .setTimestamp();

        await this.log(member.guild, embed);
    }

    async logMemberLeave(member) {
        const { EmbedBuilder, Colors } = await import('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('📤 Member Left')
            .setColor(Colors.Red)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
            .setDescription(`<@${member.id}> left the server.`)
            .addFields({ name: 'Member Count', value: `${member.guild.memberCount}` })
            .setFooter({ text: `ID: ${member.id}` })
            .setTimestamp();

        await this.log(member.guild, embed);
    }

    async logRoleCreate(role) {
        const { EmbedBuilder, Colors } = await import('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Role Created')
            .setColor(Colors.Green)
            .setDescription(`**Role:** ${role.name}`)
            .setFooter({ text: `ID: ${role.id}` })
            .setTimestamp();

        await this.log(role.guild, embed);
    }

    async logRoleDelete(role) {
        const { EmbedBuilder, Colors } = await import('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Role Deleted')
            .setColor(Colors.Red)
            .setDescription(`**Role:** ${role.name}`)
            .setFooter({ text: `ID: ${role.id}` })
            .setTimestamp();

        await this.log(role.guild, embed);
    }

    async logRoleUpdate(oldRole, newRole) {
        if (oldRole.name === newRole.name && oldRole.color === newRole.color && oldRole.permissions.bitfield === newRole.permissions.bitfield) return;
        const { EmbedBuilder, Colors } = await import('discord.js');

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Role Updated')
            .setColor(Colors.Orange)
            .setDescription(`**Role:** ${newRole.name}`)
            .setFooter({ text: `ID: ${newRole.id}` })
            .setTimestamp();

        if (oldRole.name !== newRole.name) embed.addFields({ name: 'Name', value: `${oldRole.name} ➔ ${newRole.name}` });
        if (oldRole.hexColor !== newRole.hexColor) embed.addFields({ name: 'Color', value: `${oldRole.hexColor} ➔ ${newRole.hexColor}` });

        await this.log(newRole.guild, embed);
    }

    async logVoiceStateUpdate(oldState, newState) {
        const { EmbedBuilder, Colors } = await import('discord.js');
        const member = newState.member;
        if (!member) return;

        let embed = null;

        // Join
        if (!oldState.channelId && newState.channelId) {
            embed = new EmbedBuilder()
                .setTitle('🔊 Voice Join')
                .setColor(Colors.Green)
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .setDescription(`<@${member.id}> joined **<#${newState.channelId}>**`)
                .setTimestamp();
        }
        // Leave
        else if (oldState.channelId && !newState.channelId) {
            embed = new EmbedBuilder()
                .setTitle('🔇 Voice Leave')
                .setColor(Colors.Red)
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .setDescription(`<@${member.id}> left **<#${oldState.channelId}>**`)
                .setTimestamp();
        }
        // Move
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            embed = new EmbedBuilder()
                .setTitle('↔️ Voice Move')
                .setColor(Colors.Blue)
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .setDescription(`<@${member.id}> moved from **<#${oldState.channelId}>** to **<#${newState.channelId}>**`)
                .setTimestamp();
        }

        if (embed) {
            await this.log(member.guild, embed);
        }
    }

}

export const auditManager = new AuditManager();
