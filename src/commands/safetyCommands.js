import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { whitelistManager } from '../utils/whitelistManager.js';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../utils/messageFormatter.js';

export const safetyCommandDefinition = new SlashCommandBuilder()
    .setName('safety')
    .setDescription('Manage AI Safety and Auto-Mod settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup(group =>
        group
            .setName('whitelist')
            .setDescription('Manage VIP users/roles exempt from scanning')
            .addSubcommand(sub =>
                sub
                    .setName('add')
                    .setDescription('Add a user or role to the whitelist')
                    .addUserOption(opt => opt.setName('user').setDescription('The user to whitelist'))
                    .addRoleOption(opt => opt.setName('role').setDescription('The role to whitelist'))
            )
            .addSubcommand(sub =>
                sub
                    .setName('remove')
                    .setDescription('Remove a user or role from the whitelist')
                    .addUserOption(opt => opt.setName('user').setDescription('The user to remove'))
                    .addRoleOption(opt => opt.setName('role').setDescription('The role to remove'))
            )
            .addSubcommand(sub =>
                sub
                    .setName('list')
                    .setDescription('View the current whitelist')
            )
    )
    .addSubcommand(sub =>
        sub
            .setName('config')
            .setDescription('Configure safety features')
            .addBooleanOption(opt => opt.setName('scanner').setDescription('Enable/Disable AI Safety Scanner').setRequired(true))
    );

/**
 * Handle the /safety command.
 * @param {object} params
 * @param {import('../slashCommands/handlers.js').ResponseAdapter} res
 */
export async function handleSafetyCommand(params, res) {
    const { subcommandGroup, subcommand, user, role, scanner } = params;

    // --- Whitelist Management ---
    if (subcommandGroup === 'whitelist') {
        if (subcommand === 'list') {
            const list = whitelistManager.getLists();
            const users = list.userIds.map(id => `<@${id}>`).join(', ') || 'None';
            const roles = list.roleIds.map(id => `<@&${id}>`).join(', ') || 'None';

            await res.reply({
                embeds: [createInfoEmbed('🛡️ Safety Whitelist',
                    `**Whitelisted Users:**\n${users}\n\n**Whitelisted Roles:**\n${roles}`
                )]
            });
            return;
        }

        if (subcommand === 'add') {
            const added = [];
            if (user) {
                if (whitelistManager.addUser(user.id)) added.push(`User: ${user}`);
            }
            if (role) {
                if (whitelistManager.addRole(role.id)) added.push(`Role: ${role}`);
            }

            if (added.length > 0) {
                await res.reply({ embeds: [createSuccessEmbed('Whitelist Updated', `Added:\n${added.join('\n')}`)] });
            } else {
                await res.reply({ embeds: [createErrorEmbed('No Changes', 'User/Role was already whitelisted or none provided.')] });
            }
            return;
        }

        if (subcommand === 'remove') {
            const removed = [];
            if (user) {
                if (whitelistManager.removeUser(user.id)) removed.push(`User: ${user}`);
            }
            if (role) {
                if (whitelistManager.removeRole(role.id)) removed.push(`Role: ${role}`);
            }

            if (removed.length > 0) {
                await res.reply({ embeds: [createSuccessEmbed('Whitelist Updated', `Removed:\n${removed.join('\n')}`)] });
            } else {
                await res.reply({ embeds: [createErrorEmbed('No Changes', 'User/Role was not in whitelist or none provided.')] });
            }
            return;
        }
    }

    // --- Config Management ---
    if (subcommand === 'config') {
        // For now, we just toggle a simulated config since we don't have a global persistent config manager for this specific feature yet.
        // In a real implementation, this would save to a database or config file.
        // Since we didn't implement a global config switch in `safetyScanner.js` (it's always on), 
        // we'll explicitly note this limitation or quickly patch it.

        // Let's assume always ON for Phase 18 as per plan, but acknowledge the command for future extension.
        await res.reply({
            embeds: [createInfoEmbed('Configuration Update',
                `**AI Safety Scanner:** ${scanner ? 'Enabled' : 'Disabled'}\n*(Note: Currently this toggle is visual-only until the persistent config layer is upgraded in Phase 19)*`
            )]
        });
    }
}
