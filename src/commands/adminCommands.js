import { securityManager } from '../utils/securityManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/messageFormatter.js';

export async function handleAdminImmunity(message, args) {
    // Check if user is admin
    if (!securityManager.isAdmin(message.member)) {
        return await message.reply({ embeds: [createErrorEmbed('Access Denied', 'Only administrators can manage admin immunity settings.')] });
    }

    // If no args provided, show current status
    if (!args || args.length === 0) {
        const currentStatus = securityManager.getAdminImmunity();
        const statusText = currentStatus ? '✅ **Enabled**' : '❌ **Disabled**';
        const description = currentStatus
            ? 'Administrators are currently **immune** to keyword filtering and moderation checks.'
            : 'Administrators are currently **subject** to keyword filtering and moderation checks.';

        return await message.reply({
            embeds: [createInfoEmbed('Admin Immunity Status', `${statusText}\n\n${description}\n\n**Usage:** \`!admin-immunity on/off\` to toggle.`)]
        });
    }

    const action = args[0].toLowerCase();

    if (action === 'on' || action === 'true' || action === 'enable') {
        const success = securityManager.setAdminImmunity(true);
        if (success) {
            return await message.reply({
                embeds: [createSuccessEmbed('Admin Immunity Enabled', '✅ Administrators are now **immune** to keyword filtering and moderation checks.')]
            });
        } else {
            return await message.reply({
                embeds: [createErrorEmbed('Failed', 'Unable to enable admin immunity. Please check the logs.')]
            });
        }
    } else if (action === 'off' || action === 'false' || action === 'disable') {
        const success = securityManager.setAdminImmunity(false);
        if (success) {
            return await message.reply({
                embeds: [createSuccessEmbed('Admin Immunity Disabled', '❌ Administrators are now **subject** to keyword filtering and moderation checks.')]
            });
        } else {
            return await message.reply({
                embeds: [createErrorEmbed('Failed', 'Unable to disable admin immunity. Please check the logs.')]
            });
        }
    } else {
        return await message.reply({
            embeds: [createErrorEmbed('Invalid Argument', 'Usage: `!admin-immunity on/off` or `!admin-immunity enable/disable`')]
        });
    }
}