import { createInfoEmbed, createSuccessEmbed } from '../utils/messageFormatter.js';
import { securityManager } from '../utils/securityManager.js';

export async function handleModGuide(message) {
    const isAdmin = securityManager.isAdmin(message.member);

    // Help for regular users (or public view)
    const guideEmbed = createInfoEmbed(
        '🛡️ BlockAerie Sketch: Moderation Guide',
        `Welcome to the **Community Guardian** suite. This bot helps maintain order in your Web3 community.\n\n` +
        `**1. Setup (Admin Only)**\n` +
        `• Set log channel: \`!modlog #channel\`\n` +
        `• Add forbidden words: \`!add-slur <word>\`\n\n` +
        `**2. Protection Levels**\n` +
        `• **Auto-Mod**: \`!automod list\` to see rules.\n` +
        `• **Raid Mode**: \`!raid on\` during attacks (locks server).\n` +
        `• **Global Filter**: All messages are scanned for slurs.\n\n` +
        `**3. Moderator Commands**\n` +
        `• \`!kick @user [reason]\`\n` +
        `• \`!ban @user [reason]\`\n` +
        `• \`!unban [id] [reason]\`\n` +
        `• \`!warn @user [reason]\`\n` +
        `• \`!timeout @user 1h\`\n` +
        `• \`!clear <number>\` (Purge chat)\n` +
        `• \`!warnings @user\`\n\n` +
        `**4. Admin & Automation**\n` +
        `• **Roles**: \`!role create [name]\`, \`!role add @user @role\`\n` +
        `• **Webhooks**: \`!webhook create [name]\`\n` +
        `• **Logs**: \`!modlog #channel\`\n` +
        `• **Lockdown**: \`!lock\` (View-only) / \`!raid on\`\n\n` +
        `**5. Philosophy**\n` +
        `We prioritize safety. Slurs result in instant deletion and logging. Use Slash Commands (\`/\`) for the best administrative experience.`
    );

    await message.reply({ embeds: [guideEmbed] });

    // Detailed Admin setup guide (DM only to keep chat clean)
    if (isAdmin) {
        try {
            const adminEmbed = createSuccessEmbed(
                '👑 Admin Setup Checklist',
                `**Get your server protected in 3 steps:**\n\n` +
                `**Step 1: The Basics**\n` +
                `1. Create a private channel (e.g., \`#mod-logs\`).\n` +
                `2. Run: \`!modlog #mod-logs\`\n` +
                `3. Test it: \`!warn @me Test\`\n\n` +
                `**Step 2: Filter Configuration**\n` +
                `1. Add your blocked words: \`!add-slur <word>\`\n` +
                `2. **Tip**: Add common variations or avoid specific false positives.\n` +
                `3. Toggle your own immunity: \`!admin-immunity on\`\n\n` +
                `**Step 3: Protocol**\n` +
                `• **Spam**: Auto-mod handles it, but you can use \`!timeout\` or \`!clear\`.\n` +
                `• **Raid**: Type \`!raid on\` or \`!lock\` in target channels immediately.\n` +
                `• **Zombie Instances**: Use \`/kill-instances\` if the bot is slow or double-posting.\n` +
                `• **Immunity**: Use \`!lock-immunity @role\` for bypass.\n` +
                `• **Appeal**: Users can't appeal through the bot yet.`
            );
            await message.author.send({ embeds: [adminEmbed] });
        } catch (e) {
            // DMs might be closed, ignore
        }
    }
}
