import { createInfoEmbed, createSuccessEmbed, createErrorEmbed } from '../utils/messageFormatter.js';
import { securityManager } from '../utils/securityManager.js';
import { PermissionFlagsBits } from 'discord.js';
import fs from 'fs';
import path from 'path';

const NOTES_FILE = path.join(process.cwd(), 'data', 'member_notes.json');

// Ensure notes file exists
if (!fs.existsSync(path.dirname(NOTES_FILE))) fs.mkdirSync(path.dirname(NOTES_FILE), { recursive: true });
if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, JSON.stringify({}, null, 2));

export async function handleNote(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await message.reply({ embeds: [createErrorEmbed('Access Denied', 'You need Moderate Members permission to manage notes.')] });
    }

    const subCommand = args[0]?.toLowerCase();

    // Load notes
    let notesData = {};
    try {
        notesData = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
    } catch (e) {
        notesData = {};
    }

    // LIST NOTES
    if (subCommand === 'list' || subCommand === 'view') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return await message.reply({ embeds: [createErrorEmbed('Usage Error', 'Usage: `!note list @user`')] });
        }

        const userNotes = notesData[targetUser.id] || [];
        if (userNotes.length === 0) {
            return await message.reply({ embeds: [createInfoEmbed('Member Notes', `No notes found for ${targetUser.tag}.`)] });
        }

        const notesList = userNotes.map((n, i) => `**[${i + 1}]** ${n.text} \n*(By <@${n.moderatorId}> on ${new Date(n.timestamp).toLocaleDateString()})*`).join('\n\n');
        return await message.reply({ embeds: [createInfoEmbed(`Notes for ${targetUser.tag}`, notesList)] });
    }

    // ADD NOTE
    if (subCommand === 'add') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return await message.reply({ embeds: [createErrorEmbed('Usage Error', 'Usage: `!note add @user <text>`')] });
        }

        // Remove subcommand and mention from args to get text
        const text = message.content.replace(/!note\s+add\s+<@!?\d+>\s*/i, '').trim();
        // Fallback if regex fails (simple arg join)
        const textFallback = args.slice(2).join(' ');

        const noteText = text.includes(targetUser.id) ? textFallback : textFallback; // Basic handling

        if (!noteText) {
            return await message.reply({ embeds: [createErrorEmbed('Invalid Input', 'Please provide text for the note.')] });
        }

        const newNote = {
            id: Date.now().toString(36),
            text: noteText,
            moderatorId: message.author.id,
            timestamp: Date.now()
        };

        if (!notesData[targetUser.id]) notesData[targetUser.id] = [];
        notesData[targetUser.id].push(newNote);

        fs.writeFileSync(NOTES_FILE, JSON.stringify(notesData, null, 2));
        return await message.reply({ embeds: [createSuccessEmbed('Note Added', `✅ Note added for ${targetUser.tag}`)] });
    }

    // REMOVE NOTE
    if (subCommand === 'remove' || subCommand === 'del') {
        const targetUser = message.mentions.users.first();
        const noteIndex = parseInt(args[2]) - 1; // 1-based index

        if (!targetUser || isNaN(noteIndex)) {
            return await message.reply({ embeds: [createErrorEmbed('Usage Error', 'Usage: `!note remove @user <number>` (Number from list)')] });
        }

        if (!notesData[targetUser.id] || !notesData[targetUser.id][noteIndex]) {
            return await message.reply({ embeds: [createErrorEmbed('Not Found', 'Note not found.')] });
        }

        notesData[targetUser.id].splice(noteIndex, 1);
        fs.writeFileSync(NOTES_FILE, JSON.stringify(notesData, null, 2));

        return await message.reply({ embeds: [createSuccessEmbed('Note Removed', `🗑️ Note removed for ${targetUser.tag}`)] });
    }

    return await message.reply({ embeds: [createInfoEmbed('Note Commands', '`!note add @user <text>`\n`!note list @user`\n`!note remove @user <number>`')] });
}
