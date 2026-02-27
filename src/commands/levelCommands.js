/**
 * Leveling Commands
 * 
 * Commands for the XP/Leveling system.
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { levelingManager } from '../utils/levelingManager.js';
import { createInfoEmbed, createErrorEmbed } from '../utils/messageFormatter.js';

export const levelCommandDefinition = new SlashCommandBuilder()
    .setName('level')
    .setDescription('Leveling system commands')
    .addSubcommand(sub =>
        sub.setName('rank')
            .setDescription('Check your current rank and level')
            .addUserOption(opt => opt.setName('user').setDescription('Check another user'))
    )
    .addSubcommand(sub =>
        sub.setName('leaderboard')
            .setDescription('View the top 10 most active users')
    );

// Alias /rank -> level rank (Handled via separate registration or just user education. 
// For now, let's just stick to /level subcommands to keep namespace clean, 
// or register top-level aliases if preferred. Let's do top-level /rank and /leaderboard for UX).

export const rankCommandDefinition = new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your current rank and level')
    .addUserOption(opt => opt.setName('user').setDescription('Check another user'));

export const leaderboardCommandDefinition = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server leaderboard');


export async function handleLevelCommand(params, res, guild) {
    // This function can handle both /rank and /leaderboard inputs if we route them here
    const { commandName, user } = params;

    if (commandName === 'rank') {
        const targetId = user ? user.id : res.userId;
        const targetUser = user || (await guild.members.fetch(targetId)).user;

        const rankData = levelingManager.getUserRank(guild.id, targetId);

        if (!rankData) {
            await res.reply({ embeds: [createInfoEmbed('No Data', `${targetUser.username} hasn't started their journey yet.`)] });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00') // Customize color
            .setAuthor({ name: `${targetUser.username}'s Rank`, iconURL: targetUser.displayAvatarURL() })
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: 'Rank', value: `#${rankData.rank}`, inline: true },
                { name: 'Level', value: `${rankData.level}`, inline: true },
                { name: 'XP', value: `${rankData.xp} / ${rankData.xpNeeded}`, inline: true }
            )
            .setFooter({ text: 'Keep chatting to earn more XP!' });

        await res.reply({ embeds: [embed] });
        return;
    }

    if (commandName === 'leaderboard') {
        const topUsers = levelingManager.getLeaderboard(guild.id);

        if (topUsers.length === 0) {
            await res.reply({ embeds: [createInfoEmbed('Leaderboard', 'No active users yet.')] });
            return;
        }

        const description = topUsers.map((u, i) => {
            return `**${i + 1}.** <@${u.userId}> — Level **${u.level}** (${u.xp} XP)`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`🏆 ${guild.name} Leaderboard`)
            .setDescription(description)
            .setTimestamp();

        await res.reply({ embeds: [embed] });
        return;
    }
}
