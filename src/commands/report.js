import { createInfoEmbed, createSuccessEmbed, createErrorEmbed } from '../utils/messageFormatter.js';
import { moderationManager } from '../utils/moderationManager.js';
import dashboardServer from '../utils/dashboard.js';

export async function handleReport(message, args) {
    if (args.length < 2) {
        return await message.reply({ embeds: [createErrorEmbed('Usage Error', 'Usage: `!report @user <reason>`')] });
    }

    const targetUser = message.mentions.users.first();
    const reason = args.slice(1).join(' ').replace(/<@!?\d+>/g, '').trim();

    if (!targetUser) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid User', 'Please mention the user you want to report.')] });
    }

    if (targetUser.id === message.author.id) {
        return await message.reply({ embeds: [createErrorEmbed('Error', 'You cannot report yourself.')] });
    }

    try {
        // Log to Mod Channel
        // We can reuse reportViolation or create a specific report log
        const reportEmbed = {
            color: 0xFFA500, // Orange for report
            title: '📩 User Report',
            description: `**Reporter:** ${message.author.tag} (${message.author.id})\n**Target:** ${targetUser.tag} (${targetUser.id})\n**Channel:** ${message.channel.name}`,
            fields: [
                { name: 'Reason', value: reason }
            ],
            timestamp: new Date().toISOString()
        };

        const modChannelId = moderationManager.data.logChannelId; // Using same log channel for now, can be separate
        if (modChannelId) {
            const channel = await message.guild.channels.fetch(modChannelId).catch(() => null);
            if (channel) await channel.send({ embeds: [reportEmbed] });
        }

        // Notify Dashboard
        dashboardServer.broadcastAction({
            type: 'report',
            reporter: message.author.tag,
            target: targetUser.tag,
            reason: reason,
            timestamp: Date.now()
        });

        // Delete report message to keep anonymity/clean chat (optional)
        await message.delete().catch(() => { });

        // Confirm via DM
        await message.author.send({ embeds: [createSuccessEmbed('Report Received', `Thank you for reporting ${targetUser.tag}. Moderators have been notified.`)] }).catch(() => { });

    } catch (error) {
        console.error('Report error:', error);
        return await message.reply({ embeds: [createErrorEmbed('System Error', 'Failed to submit report. Please contact an admin directly.')] });
    }
}
