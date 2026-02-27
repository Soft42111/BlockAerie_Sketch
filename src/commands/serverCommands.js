/**
 * Server Management Commands
 * 
 * Commands for backing up, restoring, and managing server state.
 */
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { backupManager } from '../utils/backupManager.js';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../utils/messageFormatter.js';

export const serverCommandDefinition = new SlashCommandBuilder()
    .setName('server')
    .setDescription('Server management and backup tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup(group =>
        group
            .setName('backup')
            .setDescription('Manage server backups')
            .addSubcommand(sub =>
                sub.setName('create').setDescription('Create a new backup snapshot')
            )
            .addSubcommand(sub =>
                sub.setName('list').setDescription('List available backups')
            )
            .addSubcommand(sub =>
                sub.setName('info')
                    .setDescription('Get details about a backup')
                    .addStringOption(opt => opt.setName('id').setDescription('Backup ID').setRequired(true))
            )
    )
    .addSubcommand(sub =>
        sub
            .setName('restore')
            .setDescription('Restore a backup (Dangerous!)')
            .addStringOption(opt => opt.setName('id').setDescription('Backup ID').setRequired(true))
    );

/**
 * Handle /server commands
 * @param {object} params 
 * @param {import('../slashCommands/handlers.js').ResponseAdapter} res 
 * @param {import('discord.js').Guild} guild
 */
export async function handleServerCommand(params, res, guild) {
    const { subcommandGroup, subcommand, backupId } = params;

    if (subcommandGroup === 'backup') {
        if (subcommand === 'create') {
            await res.reply({ embeds: [createInfoEmbed('⏳ Creating Backup...', 'Analyzing server structure...')] });

            try {
                const id = await backupManager.createBackup(guild);
                await res.editReply({
                    embeds: [createSuccessEmbed('Backup Created', `✅ Snapshot saved successfully.\n\n**ID:** \`${id}\`\n**Date:** ${new Date().toLocaleString()}`)]
                });
            } catch (err) {
                console.error('Backup failed:', err);
                await res.editReply({ embeds: [createErrorEmbed('Backup Failed', err.message)] });
            }
            return;
        }

        if (subcommand === 'list') {
            const backups = backupManager.listBackups();
            if (backups.length === 0) {
                await res.reply({ embeds: [createInfoEmbed('Backups', 'No backups found.')] });
                return;
            }

            // Filter for this guild only to avoid confusion
            const guildBackups = backups.filter(b => b.guildId === guild.id);

            const description = guildBackups.slice(0, 10).map(b =>
                `**ID:** \`${b.id}\` • ${new Date(b.date).toLocaleString()}`
            ).join('\n');

            await res.reply({
                embeds: [createInfoEmbed(`Backups (${guildBackups.length})`, description || 'No backups for this server still.')]
            });
            return;
        }

        if (subcommand === 'info') {
            const backup = backupManager.getBackup(backupId);
            if (!backup) {
                await res.reply({ embeds: [createErrorEmbed('Not Found', 'Invalid Backup ID')] });
                return;
            }

            const info = `**Date:** ${new Date(backup.createdAt).toLocaleString()}\n` +
                `**Role Count:** ${backup.roles.length}\n` +
                `**Channel Count:** ${backup.channels.length}`;

            await res.reply({ embeds: [createInfoEmbed(`Backup: ${backupId}`, info)] });
            return;
        }
    }

    if (subcommand === 'restore') {
        // Verification / Confirmation Phase
        // Since slash commands can't easily do two-step without components or extra logic, 
        // we'll warn aggressively. Ideally we'd use buttons here, but sticking to simple text replies for now.

        await res.reply({
            embeds: [createInfoEmbed('♻️ Restoring Backup...', 'This may take a moment. Do not interact with the bot until finished.')]
        });

        try {
            await backupManager.restoreBackup(guild, backupId);
            await res.editReply({
                embeds: [createSuccessEmbed('Restore Complete', 'Server structure has been synchronized with the backup.')]
            });
        } catch (err) {
            console.error('Restore failed:', err);
            await res.editReply({ embeds: [createErrorEmbed('Restore Failed', err.message)] });
        }
    }
}
