/**
 * Logging Configuration Commands
 * 
 * Manage audit logging settings.
 */
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { auditManager } from '../utils/auditManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/messageFormatter.js';
import { EmbedBuilder } from 'discord.js';

export const loggingCommandDefinition = new SlashCommandBuilder()
    .setName('logging')
    .setDescription('Configure audit logging')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
        sub.setName('test')
            .setDescription('Send a test log to the audit channel')
    );

export async function handleLoggingCommand(params, res, guild) {
    const { subcommand } = params;

    if (subcommand === 'test') {
        const channel = await auditManager.getLogChannel(guild);

        if (!channel) {
            await res.reply({
                embeds: [createErrorEmbed('Log Channel Not Found', 'Could not find `#mod-logs` or `#audit-logs`. Please create one of these channels.')]
            });
            return;
        }

        await res.reply({ content: `Sending test log to ${channel}...`, ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle('🧪 Test Log Entry')
            .setDescription('If you can see this, the logging system is working correctly.')
            .setColor('#0099ff')
            .setTimestamp();

        await auditManager.log(guild, embed);
    }
}
