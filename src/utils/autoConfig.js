import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { moderationManager } from './moderationManager.js';
import { createSuccessEmbed, createInfoEmbed } from './messageFormatter.js';

export const autoConfig = {
    /**
     * Run automatic configuration for a new guild
     * @param {Object} guild - The Discord guild object
     */
    async runAutoConfig(guild) {
        console.log(`🚀 Starting auto-config for guild: ${guild.name} (${guild.id})`);

        try {
            // 1. Initialise guild data
            moderationManager.getGuildData(guild.id);

            // 2. Look for existing mod-logs channel or create one
            let logChannel = guild.channels.cache.find(c =>
                (c.name === 'mod-logs' || c.name === 'moderation-logs') &&
                c.type === ChannelType.GuildText
            );

            if (!logChannel) {
                console.log(`📝 Creating #mod-logs for ${guild.name}...`);
                logChannel = await guild.channels.create({
                    name: 'mod-logs',
                    type: ChannelType.GuildText,
                    topic: 'Private channel for moderation logs and security alerts.',
                    permissionOverwrites: [
                        {
                            id: guild.id, // @everyone
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: guild.members.me.id, // Bot
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.EmbedLinks,
                                PermissionFlagsBits.Administrator
                            ],
                        }
                    ],
                });
            }

            // 3. Set as log channel
            moderationManager.setLogChannel(guild.id, logChannel.id);

            // 4. Send welcome message to log channel
            await logChannel.send({
                embeds: [createSuccessEmbed(
                    '✅ Auto-Configuration Complete',
                    `Hello! I am **${guild.members.me.displayName}**. I have automatically set up this channel for moderation logs.\n\n` +
                    `**What happened?**\n` +
                    `• Created/Detected private \`#mod-logs\`\n` +
                    `• Initialized per-server moderation database\n` +
                    `• Enabled global safety filters\n\n` +
                    `Type \`!help\` to see all commands.`
                )]
            });

            // 5. Try to notify the owner/system channel
            const welcomeEmbed = createInfoEmbed(
                '🎨 BlockAerie Sketch Joined!',
                `Thanks for adding me to **${guild.name}**!\n\n` +
                `I have automatically configured a private **#mod-logs** channel for your server. ` +
                `You can start using commands like \`!pfp\` for image generation or \`!lock\` for moderation immediately.\n\n` +
                `**Tip**: Use \`!mod-guide\` to see how to customize your protection rules.`
            );

            const systemChannel = guild.systemChannel || guild.channels.cache.find(c => c.type === ChannelType.GuildText);
            if (systemChannel) {
                await systemChannel.send({ embeds: [welcomeEmbed] }).catch(() => { });
            }

            console.log(`✅ Auto-config finished for ${guild.name}`);
            return true;
        } catch (error) {
            console.error(`❌ Auto-config failed for ${guild.name}:`, error.message);
            return false;
        }
    }
};
