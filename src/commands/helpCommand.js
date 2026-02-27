import { createInfoEmbed } from '../utils/messageFormatter.js';
import { securityManager } from '../utils/securityManager.js';

export async function handleHelp(message) {
    const isAdmin = securityManager.isAdmin(message.author.id);
    const prefix = '!'; // Ideally get from config

    const publicCommands = [
        `**🛡️ Moderation**`,
        `\`${prefix}report @user [reason]\` / \`/report\` - Report a user privately.`,
        `\`${prefix}mod-guide\` / \`/mod-guide\` - View community guidelines.`,
        ``,
        `**🎨 Creative AI**`,
        `\`${prefix}imagine <prompt>\` / \`/imagine\` - Generate an AI image.`,
        `\`${prefix}edit <prompt>\` / \`/edit\` - Edit an image with AI (reply/attach).`,
        `\`${prefix}video <prompt>\` / \`/video\` - Create an AI video.`,
        `\`${prefix}pfp\` / \`/pfp\` - Profile picture generation wizard.`,
        `\`${prefix}angles360 <prompt>\` / \`/angles360\` - Multi-angle generation.`,
        `\`${prefix}ask <question>\` / \`/ask\` - Chat with the Aesthetic Architect.`,
        ``,
        `**🔧 Personal Tools**`,
        `\`${prefix}rank\` / \`/rank\` - Check your XP level.`,
        `\`${prefix}leaderboard\` / \`/leaderboard\` - View server XP leaders.`,
        `\`${prefix}remind <msg> in <time>\` / \`/remind\` - Set a reminder.`,
        `\`${prefix}memory <action>\` / \`/memory\` - User preference memory.`,
        ``,
        `**🔧 Utility**`,
        `\`${prefix}ping\`, \`${prefix}status\` / \`/bot-status\`, \`${prefix}help\``,
        `💡 *Tip: Try using Slash Commands (\`/\`) for an easier experience!*`
    ].join('\n');

    const modCommands = [
        `**👮 Moderator Tools**`,
        `\`${prefix}warn @user [reason]\` / \`/warn\` - Issue a formal warning.`,
        `\`${prefix}timeout @user [duration]\` / \`/timeout\` - Mute/Timeout.`,
        `\`${prefix}clear [number]\` / \`/clear\` - Purge messages.`,
        `\`${prefix}kick @user [reason]\` / \`/kick\` - Remove from server.`,
        `\`${prefix}ban @user [reason]\` / \`/ban\` - Permanently ban.`,
        `\`${prefix}unban [id]\` / \`/unban\` - Lift a user's ban.`,
        `\`${prefix}warnings @user\` / \`/warnings\` - View warning history.`,
        `\`${prefix}note <add/list> @user\` / \`/note\` - Manage user notes.`
    ].join('\n');

    const adminCommands = [
        `**👑 Admin Control**`,
        `\`${prefix}role\` / \`/role\` - Create/Add/Remove server roles.`,
        `\`${prefix}webhook\` / \`/webhook\` - Manage server webhooks.`,
        `\`${prefix}server\` / \`/server\` - Backup & Restore server state.`,
        `\`${prefix}safety\` / \`/safety\` - AI safety scanner & whitelist config.`,
        `\`${prefix}logging\` / \`/logging\` - Configure audit logs & health checks.`,
        `\`${prefix}modlog #channel\` / \`/modlog\` - Set logging channel.`,
        `\`${prefix}automod\` / \`/automod\` - Configure auto-mod rules.`,
        `\`${prefix}raid <on/off/config>\` / \`/raid\` - Anti-raid protection.`,
        `\`${prefix}lock\` / \`/lock\` - Lockdown the current channel.`,
        `\`${prefix}lock-immunity\` / \`/lock-immunity\` - Manage role bypass.`,
        `\`${prefix}list-slurs\` / \`/slurs list\` - Admin forbidden words list.`,
        `\`${prefix}kill-instances\` / \`/kill-instances\` - Kill zombie processes.`
    ].join('\n');

    const embed = createInfoEmbed(
        '🤖 BlockAerie Commands',
        `Access every feature via legacy \`${prefix}\` prefix or modern \`/\` slash commands.\n\n${publicCommands}`
    );

    if (message.member.permissions.has('ModerateMembers') || isAdmin) {
        embed.addFields({ name: 'Staff Moderation', value: modCommands });
    }

    if (message.member.permissions.has('Administrator') || isAdmin) {
        embed.addFields({ name: 'Admin Operations', value: adminCommands });
    }

    await message.reply({ embeds: [embed] });
}
