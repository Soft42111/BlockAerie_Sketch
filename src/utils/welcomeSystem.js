import { EmbedBuilder, Colors, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../../data/welcome_config.json');

class WelcomeSystem {
    constructor() {
        this.config = this.loadConfig();
        this.pendingWelcomes = new Map();
        this.memberJoinTimes = new Map();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            }
        } catch (error) {
            console.error('[WelcomeSystem] Failed to load config:', error);
        }
        return { guilds: {} };
    }

    saveConfig() {
        try {
            const dir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('[WelcomeSystem] Failed to save config:', error);
        }
    }

    getGuildConfig(guildId) {
        if (!this.config.guilds[guildId]) {
            this.config.guilds[guildId] = {
                enabled: false,
                welcomeChannel: null,
                goodbyeChannel: null,
                welcomeMessage: 'Welcome {user} to **{server}**! You are member #{memberCount}!',
                goodbyeMessage: 'Goodbye {user}! We will miss you.',
                welcomeEmbed: {
                    enabled: true,
                    color: '#5865F2',
                    title: 'Welcome!',
                    description: null,
                    thumbnail: '{userAvatar}',
                    image: null,
                    footer: 'Member #{memberCount}'
                },
                goodbyeEmbed: {
                    enabled: true,
                    color: '#ED4245',
                    title: 'Goodbye!',
                    description: null,
                    thumbnail: '{userAvatar}',
                    image: null,
                    footer: null
                },
                joinRole: null,
                birthdayRole: null,
                delayMs: 0,
                announceMemberCount: false,
                memberCountMilestones: [100, 500, 1000, 5000, 10000],
                trackLeaveReasons: true,
                leaveReasons: {}
            };
        }
        return this.config.guilds[guildId];
    }

    replacePlaceholders(text, member, guild, extras = {}) {
        if (!text) return text;
        
        const placeholders = {
            '{user}': member.user ? `<@${member.user.id}>` : `<@${member.id}>`,
            '{username}': member.user?.username || member.username || 'Unknown',
            '{usertag}': member.user?.tag || member.tag || 'Unknown#0000',
            '{userid}': member.user?.id || member.id,
            '{userAvatar}': member.user?.displayAvatarURL({ dynamic: true, size: 512 }) || member.displayAvatarURL?.({ dynamic: true, size: 512 }) || '',
            '{server}': guild.name,
            '{serverIcon}': guild.iconURL({ dynamic: true, size: 512 }) || '',
            '{memberCount}': guild.memberCount?.toString() || '0',
            '{createdAt}': member.user?.createdAt?.toLocaleDateString() || 'Unknown',
            '{joinedAt}': member.joinedAt?.toLocaleDateString() || new Date().toLocaleDateString(),
            '{nl}': '\n',
            ...extras
        };

        let result = text;
        for (const [placeholder, value] of Object.entries(placeholders)) {
            result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }
        return result;
    }

    buildWelcomeEmbed(member, guild, guildConfig) {
        const embedConfig = guildConfig.welcomeEmbed;
        if (!embedConfig?.enabled) return null;

        const embed = new EmbedBuilder()
            .setColor(embedConfig.color || '#5865F2')
            .setTimestamp();

        if (embedConfig.title) {
            embed.setTitle(this.replacePlaceholders(embedConfig.title, member, guild));
        }

        const description = embedConfig.description || guildConfig.welcomeMessage;
        if (description) {
            embed.setDescription(this.replacePlaceholders(description, member, guild));
        }

        if (embedConfig.thumbnail) {
            const thumbnailUrl = this.replacePlaceholders(embedConfig.thumbnail, member, guild);
            if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
                embed.setThumbnail(thumbnailUrl);
            }
        }

        if (embedConfig.image) {
            const imageUrl = this.replacePlaceholders(embedConfig.image, member, guild);
            if (imageUrl && imageUrl.startsWith('http')) {
                embed.setImage(imageUrl);
            }
        }

        if (embedConfig.footer) {
            embed.setFooter({ text: this.replacePlaceholders(embedConfig.footer, member, guild) });
        }

        return embed;
    }

    buildGoodbyeEmbed(member, guild, guildConfig, leaveReason = null) {
        const embedConfig = guildConfig.goodbyeEmbed;
        if (!embedConfig?.enabled) return null;

        const embed = new EmbedBuilder()
            .setColor(embedConfig.color || '#ED4245')
            .setTimestamp();

        if (embedConfig.title) {
            embed.setTitle(this.replacePlaceholders(embedConfig.title, member, guild));
        }

        let description = embedConfig.description || guildConfig.goodbyeMessage;
        if (leaveReason && guildConfig.trackLeaveReasons) {
            description += `\n\n**Reason:** ${leaveReason}`;
        }
        if (description) {
            embed.setDescription(this.replacePlaceholders(description, member, guild));
        }

        if (embedConfig.thumbnail) {
            const thumbnailUrl = this.replacePlaceholders(embedConfig.thumbnail, member, guild);
            if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
                embed.setThumbnail(thumbnailUrl);
            }
        }

        if (embedConfig.image) {
            const imageUrl = this.replacePlaceholders(embedConfig.image, member, guild);
            if (imageUrl && imageUrl.startsWith('http')) {
                embed.setImage(imageUrl);
            }
        }

        if (embedConfig.footer) {
            embed.setFooter({ text: this.replacePlaceholders(embedConfig.footer, member, guild) });
        }

        return embed;
    }

    async handleMemberJoin(member) {
        const guildConfig = this.getGuildConfig(member.guild.id);
        if (!guildConfig.enabled || !guildConfig.welcomeChannel) return;

        this.memberJoinTimes.set(`${member.guild.id}-${member.id}`, Date.now());

        const sendWelcome = async () => {
            try {
                const channel = await member.guild.channels.fetch(guildConfig.welcomeChannel).catch(() => null);
                if (!channel) return;

                const embed = this.buildWelcomeEmbed(member, member.guild, guildConfig);
                if (embed) {
                    await channel.send({ embeds: [embed] });
                } else {
                    const message = this.replacePlaceholders(guildConfig.welcomeMessage, member, member.guild);
                    await channel.send(message);
                }

                if (guildConfig.announceMemberCount) {
                    const memberCount = member.guild.memberCount;
                    if (guildConfig.memberCountMilestones.includes(memberCount)) {
                        await channel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor('#FFD700')
                                    .setTitle('🎉 Milestone Reached!')
                                    .setDescription(`We just hit **${memberCount}** members!`)
                                    .setTimestamp()
                            ]
                        });
                    }
                }

                if (guildConfig.joinRole) {
                    const role = member.guild.roles.cache.get(guildConfig.joinRole);
                    if (role) {
                        await member.roles.add(role).catch(console.error);
                    }
                }
            } catch (error) {
                console.error('[WelcomeSystem] Error sending welcome:', error);
            }
        };

        if (guildConfig.delayMs > 0) {
            const timeoutId = setTimeout(sendWelcome, guildConfig.delayMs);
            this.pendingWelcomes.set(`${member.guild.id}-${member.id}`, timeoutId);
        } else {
            await sendWelcome();
        }
    }

    async handleMemberLeave(member) {
        const guildConfig = this.getGuildConfig(member.guild.id);
        
        const pendingKey = `${member.guild.id}-${member.id}`;
        if (this.pendingWelcomes.has(pendingKey)) {
            clearTimeout(this.pendingWelcomes.get(pendingKey));
            this.pendingWelcomes.delete(pendingKey);
        }

        if (!guildConfig.enabled) return;

        const channelId = guildConfig.goodbyeChannel || guildConfig.welcomeChannel;
        if (!channelId) return;

        try {
            const channel = await member.guild.channels.fetch(channelId).catch(() => null);
            if (!channel) return;

            let leaveReason = null;
            if (guildConfig.trackLeaveReasons) {
                const auditLogs = await member.guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
                if (auditLogs) {
                    const kickLog = auditLogs.entries.find(
                        entry => entry.target?.id === member.id && 
                        (entry.action === 20 || entry.action === 22) &&
                        Date.now() - entry.createdTimestamp < 5000
                    );
                    if (kickLog) {
                        leaveReason = kickLog.action === 20 ? 
                            `Kicked by ${kickLog.executor?.tag || 'Unknown'}` :
                            `Banned by ${kickLog.executor?.tag || 'Unknown'}`;
                        if (kickLog.reason) {
                            leaveReason += ` - ${kickLog.reason}`;
                        }
                    }
                }
            }

            const embed = this.buildGoodbyeEmbed(member, member.guild, guildConfig, leaveReason);
            if (embed) {
                await channel.send({ embeds: [embed] });
            } else {
                let message = this.replacePlaceholders(guildConfig.goodbyeMessage, member, member.guild);
                if (leaveReason) {
                    message += `\n**Reason:** ${leaveReason}`;
                }
                await channel.send(message);
            }

            if (guildConfig.trackLeaveReasons && leaveReason) {
                const reasonType = leaveReason.startsWith('Kicked') ? 'kicked' : 
                                   leaveReason.startsWith('Banned') ? 'banned' : 'left';
                guildConfig.leaveReasons[reasonType] = (guildConfig.leaveReasons[reasonType] || 0) + 1;
                this.saveConfig();
            }
        } catch (error) {
            console.error('[WelcomeSystem] Error sending goodbye:', error);
        }
    }

    async sendTestWelcome(channel, member, guild) {
        const guildConfig = this.getGuildConfig(guild.id);
        
        const testMember = {
            user: member.user,
            id: member.id,
            joinedAt: new Date(),
            displayAvatarURL: () => member.user.displayAvatarURL({ dynamic: true, size: 512 })
        };

        const embed = this.buildWelcomeEmbed(testMember, guild, guildConfig);
        if (embed) {
            embed.setFooter({ text: '⚠️ This is a test message' });
            await channel.send({ embeds: [embed] });
        } else {
            const message = this.replacePlaceholders(guildConfig.welcomeMessage, testMember, guild);
            await channel.send(`${message}\n\n*⚠️ This is a test message*`);
        }
    }

    async sendVirtualWelcome(channel, username, guild) {
        const guildConfig = this.getGuildConfig(guild.id);
        
        const virtualMember = {
            user: {
                id: '000000000000000000',
                username: username,
                tag: `${username}#0000`,
                displayAvatarURL: () => guild.iconURL({ dynamic: true, size: 512 }) || ''
            },
            id: '000000000000000000',
            joinedAt: new Date()
        };

        const embed = this.buildWelcomeEmbed(virtualMember, guild, guildConfig);
        if (embed) {
            embed.setFooter({ text: `⚠️ Virtual welcome for "${username}"` });
            await channel.send({ embeds: [embed] });
        } else {
            const message = this.replacePlaceholders(guildConfig.welcomeMessage, virtualMember, guild);
            await channel.send(`${message}\n\n*⚠️ Virtual welcome for "${username}"*`);
        }
    }

    setWelcomeChannel(guildId, channelId) {
        const config = this.getGuildConfig(guildId);
        config.welcomeChannel = channelId;
        config.enabled = true;
        this.saveConfig();
    }

    setGoodbyeChannel(guildId, channelId) {
        const config = this.getGuildConfig(guildId);
        config.goodbyeChannel = channelId;
        this.saveConfig();
    }

    setWelcomeMessage(guildId, message) {
        const config = this.getGuildConfig(guildId);
        config.welcomeMessage = message;
        if (config.welcomeEmbed.enabled) {
            config.welcomeEmbed.description = message;
        }
        this.saveConfig();
    }

    setGoodbyeMessage(guildId, message) {
        const config = this.getGuildConfig(guildId);
        config.goodbyeMessage = message;
        if (config.goodbyeEmbed.enabled) {
            config.goodbyeEmbed.description = message;
        }
        this.saveConfig();
    }

    setJoinRole(guildId, roleId) {
        const config = this.getGuildConfig(guildId);
        config.joinRole = roleId;
        this.saveConfig();
    }

    setBirthdayRole(guildId, roleId) {
        const config = this.getGuildConfig(guildId);
        config.birthdayRole = roleId;
        this.saveConfig();
    }

    setWelcomeDelay(guildId, delayMs) {
        const config = this.getGuildConfig(guildId);
        config.delayMs = delayMs;
        this.saveConfig();
    }

    setWelcomeImage(guildId, imageUrl) {
        const config = this.getGuildConfig(guildId);
        config.welcomeEmbed.image = imageUrl;
        this.saveConfig();
    }

    setGoodbyeImage(guildId, imageUrl) {
        const config = this.getGuildConfig(guildId);
        config.goodbyeEmbed.image = imageUrl;
        this.saveConfig();
    }

    setEmbedColor(guildId, type, color) {
        const config = this.getGuildConfig(guildId);
        if (type === 'welcome') {
            config.welcomeEmbed.color = color;
        } else if (type === 'goodbye') {
            config.goodbyeEmbed.color = color;
        }
        this.saveConfig();
    }

    toggleMemberCountAnnouncements(guildId, enabled) {
        const config = this.getGuildConfig(guildId);
        config.announceMemberCount = enabled;
        this.saveConfig();
    }

    disable(guildId) {
        const config = this.getGuildConfig(guildId);
        config.enabled = false;
        this.saveConfig();
    }

    enable(guildId) {
        const config = this.getGuildConfig(guildId);
        config.enabled = true;
        this.saveConfig();
    }

    getStats(guildId) {
        const config = this.getGuildConfig(guildId);
        return {
            enabled: config.enabled,
            welcomeChannel: config.welcomeChannel,
            goodbyeChannel: config.goodbyeChannel,
            joinRole: config.joinRole,
            birthdayRole: config.birthdayRole,
            delayMs: config.delayMs,
            leaveReasons: config.leaveReasons,
            announceMemberCount: config.announceMemberCount
        };
    }

    getAllConfigs() {
        return this.config.guilds;
    }

    getConfigForAPI(guildId) {
        const config = this.getGuildConfig(guildId);
        return {
            ...config,
            placeholders: [
                '{user}', '{username}', '{usertag}', '{userid}', '{userAvatar}',
                '{server}', '{serverIcon}', '{memberCount}', '{createdAt}', '{joinedAt}', '{nl}'
            ]
        };
    }

    updateFromAPI(guildId, updates) {
        const config = this.getGuildConfig(guildId);
        
        const allowedKeys = [
            'enabled', 'welcomeChannel', 'goodbyeChannel', 'welcomeMessage',
            'goodbyeMessage', 'joinRole', 'birthdayRole', 'delayMs',
            'announceMemberCount', 'memberCountMilestones', 'trackLeaveReasons'
        ];

        for (const key of allowedKeys) {
            if (updates[key] !== undefined) {
                config[key] = updates[key];
            }
        }

        if (updates.welcomeEmbed) {
            Object.assign(config.welcomeEmbed, updates.welcomeEmbed);
        }

        if (updates.goodbyeEmbed) {
            Object.assign(config.goodbyeEmbed, updates.goodbyeEmbed);
        }

        this.saveConfig();
        return config;
    }
}

export const welcomeSystem = new WelcomeSystem();
export default welcomeSystem;
