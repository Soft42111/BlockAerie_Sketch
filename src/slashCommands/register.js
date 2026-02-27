/**
 * Slash Command Registration Script
 *
 * Registers all slash commands with Discord API.
 * Pulls choices from the centralized model library.
 */
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { SOGNI_MODELS } from '../../packages/config/models.js';
import { safetyCommandDefinition } from '../commands/safetyCommands.js';
import { serverCommandDefinition } from '../commands/serverCommands.js';
import { rankCommandDefinition, leaderboardCommandDefinition } from '../commands/levelCommands.js';
import { loggingCommandDefinition } from '../commands/loggingCommands.js';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// Helper to convert model library to Discord choices (max 25)
const toChoices = (list) => list.slice(0, 25).map(m => ({ name: `${m.name} (${m.tier || m.workflow || 'Standard'})`, value: m.id }));

const commands = [
    // /ask
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask the AI a question — responds in channel/thread')
        .addStringOption(opt =>
            opt.setName('prompt').setDescription('Your question or message').setRequired(true)
        ),

    // /imagine
    new SlashCommandBuilder()
        .setName('imagine')
        .setDescription('Generate an AI image from a text prompt')
        .addStringOption(opt =>
            opt.setName('prompt').setDescription('Image description').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('model').setDescription('Select a Sogni model')
                .setRequired(false)
                .addChoices(...toChoices(SOGNI_MODELS.IMAGE))
        )
        .addIntegerOption(opt =>
            opt.setName('width').setDescription('Width (default: 768)').setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName('height').setDescription('Height (default: 768)').setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName('count').setDescription('Number of images (default: 1)').setRequired(false)
        ),

    // /edit
    new SlashCommandBuilder()
        .setName('edit')
        .setDescription('Edit an image with AI')
        .addStringOption(opt =>
            opt.setName('prompt').setDescription('Edit instruction').setRequired(true)
        )
        .addAttachmentOption(opt =>
            opt.setName('image').setDescription('Image to edit').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('model').setDescription('Select an edit model')
                .setRequired(false)
                .addChoices(...toChoices(SOGNI_MODELS.EDIT))
        ),

    // /video
    new SlashCommandBuilder()
        .setName('video')
        .setDescription('Generate an AI video')
        .addStringOption(opt =>
            opt.setName('prompt').setDescription('Video description').setRequired(true)
        )
        .addAttachmentOption(opt =>
            opt.setName('ref_image').setDescription('Reference image for i2v').setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('model').setDescription('Select a video model')
                .setRequired(false)
                .addChoices(...toChoices(SOGNI_MODELS.VIDEO))
        )
        .addStringOption(opt =>
            opt.setName('workflow').setDescription('Video workflow type')
                .setRequired(false)
                .addChoices(
                    { name: 'Text to Video (t2v)', value: 't2v' },
                    { name: 'Image to Video (i2v)', value: 'i2v' },
                    { name: 'Sound to Video (s2v)', value: 's2v' },
                    { name: 'Animate (motion transfer)', value: 'animate-move' },
                    { name: 'Animate (replace)', value: 'animate-replace' },
                )
        )
        .addIntegerOption(opt =>
            opt.setName('duration').setDescription('Duration (default: 5)').setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName('fps').setDescription('FPS (default: 16)').setRequired(false)
        ),

    // /angles360
    new SlashCommandBuilder()
        .setName('angles360')
        .setDescription('Generate 360° multi-angle images from a subject')
        .addStringOption(opt =>
            opt.setName('prompt').setDescription('Subject description').setRequired(true)
        )
        .addAttachmentOption(opt =>
            opt.setName('image').setDescription('Subject image').setRequired(true)
        )
        .addBooleanOption(opt =>
            opt.setName('make_video').setDescription('Assemble a looping MP4?').setRequired(false)
        ),

    // /generate-pfp
    new SlashCommandBuilder()
        .setName('generate-pfp')
        .setDescription('Start the profile picture generation wizard'),

    // /pfp
    new SlashCommandBuilder()
        .setName('pfp')
        .setDescription('Alias for /generate-pfp'),

    // /kill-instances
    new SlashCommandBuilder()
        .setName('kill-instances')
        .setDescription('Kill zombie bot instances (Admin only)'),

    // /remind
    new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a one-shot reminder')
        .addStringOption(opt =>
            opt.setName('me').setDescription('What to remind you about').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('when').setDescription('When (e.g. "in 5 minutes")').setRequired(true)
        ),

    // /memory
    new SlashCommandBuilder()
        .setName('memory')
        .setDescription('User preference memory')
        .addSubcommand(sub =>
            sub.setName('save')
                .setDescription('Save a preference')
                .addStringOption(opt => opt.setName('key').setDescription('Key').setRequired(true))
                .addStringOption(opt => opt.setName('value').setDescription('Value').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('get')
                .setDescription('Recall a preference')
                .addStringOption(opt => opt.setName('key').setDescription('Key').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all preferences')
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Delete a preference')
                .addStringOption(opt => opt.setName('key').setDescription('Key').setRequired(true))
        ),

    // /bot-status
    new SlashCommandBuilder()
        .setName('bot-status')
        .setDescription('Show bot health and Sogni model info'),

    // /help
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands'),

    // /ping
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),

    // /mod-guide
    new SlashCommandBuilder()
        .setName('mod-guide')
        .setDescription('View the community moderation guidelines'),

    // /report
    new SlashCommandBuilder()
        .setName('report')
        .setDescription('Report a user privately to moderators')
        .addUserOption(opt => opt.setName('user').setDescription('User to report').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the report').setRequired(true)),

    // /note
    new SlashCommandBuilder()
        .setName('note')
        .setDescription('Manage moderator notes on a user')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a note')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
                .addStringOption(opt => opt.setName('content').setDescription('Note content').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List notes')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
        ),

    // ── Moderation Commands ───────────────────────────────────────

    // /ban
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .addUserOption(opt => opt.setName('user').setDescription('The user to ban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban').setRequired(false))
        .addIntegerOption(opt => opt.setName('delete_messages').setDescription('Delete message history (seconds)').setRequired(false)),

    // /kick
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .addUserOption(opt => opt.setName('user').setDescription('The user to kick').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the kick').setRequired(false)),

    // /timeout
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout/Mute a member')
        .addUserOption(opt => opt.setName('user').setDescription('The user to timeout').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d)').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the timeout').setRequired(false)),

    // /warn
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a formal warning to a user')
        .addUserOption(opt => opt.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the warning').setRequired(false)),

    // /clear
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Bulk delete messages')
        .addIntegerOption(opt => opt.setName('count').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),

    // /unban
    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user by ID')
        .addStringOption(opt => opt.setName('user_id').setDescription('The Discord ID of the user').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for unbanning').setRequired(false)),

    // /untimeout
    new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove a timeout from a user')
        .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),

    // /warnings
    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View or manage user warnings')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List warnings for a user')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('clear')
                .setDescription('Clear all warnings for a user')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
        ),

    // /lock
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Toggle channel lock (Administrator Only)'),

    // /lock-immunity
    new SlashCommandBuilder()
        .setName('lock-immunity')
        .setDescription('Toggle lock immunity for a role (Administrator Only)')
        .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true)),

    // ── Automation & Roles ────────────────────────────────────────

    // /role
    new SlashCommandBuilder()
        .setName('role')
        .setDescription('Manage server roles')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new role')
                .addStringOption(opt => opt.setName('name').setDescription('Role name').setRequired(true))
                .addStringOption(opt => opt.setName('color').setDescription('Hex color (e.g. #FF0000)').setRequired(false))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a role to a user')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a role from a user')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Delete a role')
                .addRoleOption(opt => opt.setName('role').setDescription('The role to delete').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        ),

    // /webhook
    new SlashCommandBuilder()
        .setName('webhook')
        .setDescription('Manage server webhooks')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new webhook')
                .addStringOption(opt => opt.setName('name').setDescription('Webhook name').setRequired(true))
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel (defaults to current)').setRequired(false))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('execute')
                .setDescription('Execute a webhook (Secretly)')
                .addStringOption(opt => opt.setName('id').setDescription('Webhook ID').setRequired(true))
                .addStringOption(opt => opt.setName('token').setDescription('Webhook Token').setRequired(true))
                .addStringOption(opt => opt.setName('content').setDescription('Message content').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Delete a webhook by ID')
                .addStringOption(opt => opt.setName('id').setDescription('Webhook ID').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
        ),

    // /modlog
    new SlashCommandBuilder()
        .setName('modlog')
        .setDescription('Set or view the moderator log channel')
        .addChannelOption(opt => opt.setName('channel').setDescription('The channel').setRequired(false)),

    // /automod
    new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Manage auto-moderation rules')
        .addSubcommand(sub => sub.setName('list').setDescription('List rules'))
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a rule')
                .addIntegerOption(opt => opt.setName('threshold').setDescription('Warn threshold').setRequired(true))
                .addStringOption(opt => opt.setName('action').setDescription('Action (timeout, kick, ban)').setRequired(true).addChoices({ name: 'timeout', value: 'timeout' }, { name: 'kick', value: 'kick' }, { name: 'ban', value: 'ban' }))
                .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h) for timeout').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a rule')
                .addStringOption(opt => opt.setName('rule_id').setDescription('The rule ID').setRequired(true))
        ),

    // /raid
    new SlashCommandBuilder()
        .setName('raid')
        .setDescription('Manage anti-raid protection')
        .addSubcommand(sub => sub.setName('status').setDescription('View current status'))
        .addSubcommand(sub => sub.setName('on').setDescription('Enable protection'))
        .addSubcommand(sub => sub.setName('off').setDescription('Disable protection'))
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Configure protection')
                .addIntegerOption(opt => opt.setName('threshold').setDescription('Join threshold').setRequired(true))
                .addIntegerOption(opt => opt.setName('seconds').setDescription('Time window (seconds)').setRequired(true))
        ),

    // /slurs (Advanced Filter)
    new SlashCommandBuilder()
        .setName('slurs')
        .setDescription('Manage forbidden keyword filter')
        .addSubcommand(sub => sub.setName('list').setDescription('List all slurs'))
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a word to filter')
                .addStringOption(opt => opt.setName('word').setDescription('The word').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a word from filter')
                .addStringOption(opt => opt.setName('word').setDescription('The word').setRequired(true))
        ),

    // /admin-immunity
    new SlashCommandBuilder()
        .setName('admin-immunity')
        .setDescription('Toggle your own administration immunity')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable immunity?').setRequired(true)),

    // /safety
    safetyCommandDefinition,

    // /server
    serverCommandDefinition,

    // /rank & /leaderboard
    rankCommandDefinition,
    leaderboardCommandDefinition,

    // /logging
    loggingCommandDefinition,
];

export const registerCommands = async (token, clientId, guildId = null) => {
    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log(`🔄 Registering ${commands.length} slash commands...`);
        const body = commands.map(c => c.toJSON ? c.toJSON() : c);

        if (guildId) {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
            console.log(`✅ Registered ${commands.length} commands to guild ${guildId}`);
        } else {
            await rest.put(Routes.applicationCommands(clientId), { body });
            console.log(`✅ Registered ${commands.length} commands globally`);
        }
        return true;
    } catch (err) {
        console.error('❌ Failed to register commands:', err);
        return false;
    }
};

if (process.argv[1] && process.argv[1].includes('register.js')) {
    if (!TOKEN || !CLIENT_ID) {
        console.error('❌ DISCORD_TOKEN and DISCORD_CLIENT_ID are required in .env');
        process.exit(1);
    }
    registerCommands(TOKEN, CLIENT_ID, GUILD_ID).then(success => {
        process.exitCode = success ? 0 : 1;
    });
}
