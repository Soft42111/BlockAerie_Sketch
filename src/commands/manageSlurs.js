import { securityManager } from '../utils/securityManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/messageFormatter.js';

export async function handleAddSlur(message, args) {
    // Check if user is admin
    if (!securityManager.isAdmin(message.member)) {
        return await message.reply({ embeds: [createErrorEmbed('Access Denied', 'Only administrators can manage forbidden keywords.')] });
    }

    if (!args || args.length === 0) {
        return await message.reply({ embeds: [createErrorEmbed('Usage Error', 'Usage: `!add-slur <word>` - Add a single forbidden keyword')] });
    }

    const word = args.join(' ').trim().toLowerCase();

    if (!word) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Input', 'Please provide a valid word to add.')] });
    }

    const success = securityManager.addSlur(word);

    if (success) {
        return await message.reply({ embeds: [createSuccessEmbed('Keyword Added', `✅ Successfully added "${word}" to the forbidden keywords list.`)] });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Duplicate Entry', `"${word}" already exists in the forbidden keywords list.`)] });
    }
}

export async function handleAddSlurs(message, args) {
    // Check if user is admin
    if (!securityManager.isAdmin(message.member)) {
        return await message.reply({ embeds: [createErrorEmbed('Access Denied', 'Only administrators can manage forbidden keywords.')] });
    }

    if (!args || args.length === 0) {
        return await message.reply({ embeds: [createErrorEmbed('Usage Error', 'Usage: `!add-slurs word1,word2,word3` - Add multiple forbidden keywords (comma-separated)')] });
    }

    const input = args.join(' ');
    const words = input.split(',').map(w => w.trim().toLowerCase()).filter(w => w);

    if (words.length === 0) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Input', 'Please provide at least one valid word to add.')] });
    }

    let added = 0;
    let duplicates = 0;
    const results = [];

    for (const word of words) {
        const success = securityManager.addSlur(word);
        if (success) {
            added++;
            results.push(`✅ ${word}`);
        } else {
            duplicates++;
            results.push(`⚠️ ${word} (duplicate)`);
        }
    }

    const embed = createSuccessEmbed('Bulk Keyword Addition',
        `**Added ${added} new keywords**${duplicates > 0 ? ` (${duplicates} duplicates skipped)` : ''}\n\n${results.join('\n')}`
    );

    return await message.reply({ embeds: [embed] });
}

export async function handleRemoveSlur(message, args) {
    // Check if user is admin
    if (!securityManager.isAdmin(message.member)) {
        return await message.reply({ embeds: [createErrorEmbed('Access Denied', 'Only administrators can manage forbidden keywords.')] });
    }

    if (!args || args.length === 0) {
        return await message.reply({ embeds: [createErrorEmbed('Usage Error', 'Usage: `!remove-slur <word>` - Remove a forbidden keyword')] });
    }

    const word = args.join(' ').trim().toLowerCase();

    if (!word) {
        return await message.reply({ embeds: [createErrorEmbed('Invalid Input', 'Please provide a valid word to remove.')] });
    }

    const success = securityManager.removeSlur(word);

    if (success) {
        return await message.reply({ embeds: [createSuccessEmbed('Keyword Removed', `✅ Successfully removed "${word}" from the forbidden keywords list.`)] });
    } else {
        return await message.reply({ embeds: [createErrorEmbed('Not Found', `"${word}" was not found in the forbidden keywords list.`)] });
    }
}

export async function handleListSlurs(message) {
    // Check if user is admin
    if (!securityManager.isAdmin(message.member)) {
        return await message.reply({ embeds: [createErrorEmbed('Access Denied', 'Only administrators can view the forbidden keywords list.')] });
    }

    const slurs = securityManager.listSlurs();

    if (!slurs || slurs.length === 0) {
        return await message.reply({ embeds: [createInfoEmbed('Forbidden Keywords List', '📝 **No forbidden keywords configured.**\n\nUse `!add-slur <word>` to add keywords to block.')] });
    }

    // Format the list
    const slurList = slurs.join(', ');

    // Check for length limits (Discord limit is 4096 for description, but safer to keep shorter)
    const displayList = slurList.length > 3800 ? slurList.substring(0, 3800) + '... (and more)' : slurList;

    const embed = createInfoEmbed(
        `Forbidden Keywords (${slurs.length} total)`,
        `**📋 Current blocked words:**\n\n${displayList}`
    );

    return await message.reply({ embeds: [embed] });
}