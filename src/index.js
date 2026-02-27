import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { handleGeneratePfp } from './commands/generatePfp.js';
import { handleImagine } from './commands/imagineCommand.js';
import { handleChat } from './chatHandler.js';
import { imageGenerator } from './imageGenerator.js';
import { auditManager } from './utils/auditManager.js';
import { securityManager } from './utils/securityManager.js';
import { createPairingEmbed, createErrorEmbed, createInfoEmbed } from './utils/messageFormatter.js';
import { handleAddSlur, handleAddSlurs, handleRemoveSlur, handleListSlurs } from './commands/manageSlurs.js';
import { handleAdminImmunity } from './commands/adminCommands.js';
import { handleModelStatus } from './commands/utilityCommands.js';
import { naturalLanguageParser } from './utils/naturalLanguageParser.js';
import { testGeminiConnection, testModel } from './geminiTest.js';
import { moderationManager } from './utils/moderationManager.js';
import {
    handleModLogChannel, handleAutoModRule, handleRaidProtection,
    handleClear, handleLock, handleLockImmunity, handleWarnings, handleClearWarnings,
    handleRemoveTimeout
} from './commands/moderationCommands.js';
import {
    handlePrefixRole, handlePrefixWebhook, handlePrefixBan,
    handlePrefixKick, handlePrefixTimeout, handlePrefixWarn,
    handlePrefixUnban
} from './commands/moderationRedirects.js';
import {
    handlePrefixRank, handlePrefixLeaderboard,
    handlePrefixServer, handlePrefixSafety,
    handlePrefixLogging
} from './commands/featureRedirects.js';
import { handleModGuide } from './commands/modGuide.js';
import { handleNote } from './commands/memberNotes.js';
import { handleReport } from './commands/report.js';
import { handleHelp } from './commands/helpCommand.js';
import dashboardServer from './utils/dashboard.js';
import { autoConfig } from './utils/autoConfig.js';
import performanceMonitor from './utils/performanceMonitor.js';
import fs from 'fs';
import path from 'path';

// ── New: Slash command handler + NL router + Scheduler ──────────
import { handleInteraction } from './slashCommands/handler.js';
import { routeNaturalLanguage } from './slashCommands/naturalLanguageRouter.js';
import { startScheduler } from '../packages/scheduler/index.js';
import { registerCommands } from './slashCommands/register.js';
import { buildPrefixAdapter } from './utils/prefixAdapter.js';
import {
    handleAskCommand, handleImagineCommand, handleEditCommand,
    handleVideoCommand, handleAngles360Command, handleRemindCommand,
    handleMemoryCommand
} from './slashCommands/handlers.js';

// Logging functions
const logError = (message, error = null) => {
    console.error(`❌ ${message}`, error || '');
};

const logWarning = (message) => {
    console.warn(`⚠️ ${message}`);
};

const logInfo = (message) => {
    console.log(`ℹ️ ${message}`);
};

const logSuccess = (message) => {
    console.log(`✅ ${message}`);
};

// LOCK SYSTEM: Prevent multiple apps from triggering
const lockFile = path.join(process.cwd(), 'bot.lock');
if (fs.existsSync(lockFile)) {
    const oldPid = fs.readFileSync(lockFile, 'utf8');
    try {
        process.kill(parseInt(oldPid), 0);
        console.error(`❌ ERROR: Another instance of the bot is already running (PID: ${oldPid}).`);
        process.exit(1);
    } catch (e) {
        fs.writeFileSync(lockFile, process.pid.toString());
    }
} else {
    fs.writeFileSync(lockFile, process.pid.toString());
}

// Create Discord client with enhanced moderation intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
    ],
});

// Bot ready event
client.once('ready', async () => {
    logSuccess(`Bot is online as ${client.user.tag}!`);
    logInfo(`Serving ${client.guilds.cache.size} servers`);

    // Auto-register slash commands if GUILD_ID is provided (instant sync)
    if (process.env.DISCORD_GUILD_ID) {
        logInfo(`Syncing slash commands for guild: ${process.env.DISCORD_GUILD_ID}`);
        await registerCommands(config.discord.token, client.user.id, process.env.DISCORD_GUILD_ID);
    }

    // Initialize Dashboard
    logInfo('Initializing Dashboard...');
    dashboardServer.setClient(client);
    dashboardServer.start();

    // Test Gemini API connection
    logInfo('Testing Gemini API connection...');
    const geminiWorks = await testGeminiConnection();
    if (geminiWorks) {
        logInfo('✅ Gemini API is working');
        await testModel(config.gemini.model);
    } else {
        logError('❌ Gemini API connection failed');
    }

    // Pre-initialize Sogni V4 connection
    try {
        logInfo('Pre-connecting to Sogni AI Supernet (V4)...');
        await imageGenerator.login().catch(err => {
            logWarning(`Sogni Supernet login deferred: ${err.message}`);
        });
    } catch (error) {
        logWarning(`Failed to initialize Sogni gateway: ${error.message}`);
    }
    // Start reminder scheduler
    startScheduler(async (reminder) => {
        try {
            const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
            if (channel) {
                await channel.send(`⏰ **Reminder** for <@${reminder.user_id}>:\n📝 ${reminder.message}`);
            }
        } catch (err) {
            console.error('[Scheduler] Delivery error:', err.message);
            throw err;
        }
    });
    logSuccess('Scheduler initialized');
});

// ── Slash Command Interactions ───────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    await handleInteraction(interaction, client);
});

// Guild Member Join event (Raid Protection & Welcome)
client.on('guildMemberAdd', async (member) => {
    try {
        // Check for raid activity
        const raidCheck = moderationManager.checkRaid(member.guild.id, member.id);
        const guildData = moderationManager.getGuildData(member.guild.id);

        if (raidCheck.isRaid) {
            console.log(`🚨 RAID DETECTED in ${member.guild.name}! ${raidCheck.joinsInWindow} joins in window`);

            // Log the raid
            if (guildData.logChannelId) {
                const logChannel = await member.guild.channels.fetch(guildData.logChannelId).catch(() => null);
                if (logChannel) {
                    await logChannel.send({
                        embeds: [{
                            color: 0xFF0000,
                            title: '🚨 RAID DETECTED',
                            description: `**Guild:** ${member.guild.name}\n**Joins in window:** ${raidCheck.joinsInWindow}\n**Action:** ${raidCheck.action}`,
                            timestamp: new Date().toISOString()
                        }]
                    });
                }
            }

            // Execute raid protection action
            if (raidCheck.action === 'lockdown') {
                try {
                    await member.guild.setVerificationLevel(4, 'Raid protection activated');
                    console.log(`🔒 Raid protection: Enabled highest verification level`);

                    setTimeout(async () => {
                        try {
                            await member.guild.setVerificationLevel(1, 'Raid protection deactivated');
                            console.log(`🔓 Raid protection: Restored verification level`);
                        } catch (e) {
                            console.error('Failed to restore verification level:', e);
                        }
                    }, 10 * 60 * 1000);
                } catch (e) {
                    console.error('Failed to enable raid lockdown:', e);
                }
            }
        }

        // 1. New Account Protection
        const accountAgeMs = Date.now() - member.user.createdTimestamp;
        const minimumAgeMs = 1000 * 60 * 60 * 24 * 7; // 7 days

        if (accountAgeMs < minimumAgeMs) {
            // Report suspicious new account
            await moderationManager.logAction({
                type: 'warn',
                guild: member.guild,
                target: member.user,
                moderator: client.user,
                reason: `Brand new account joined (Age: ${Math.floor(accountAgeMs / (1000 * 60 * 60 * 24))} days)`
            });
            // Optional: Kick or assign 'Suspicious' role logic here
        }

        // Handle welcome message
        const { welcomeSystem } = await import('./utils/welcomeSystem.js');
        await welcomeSystem.handleMemberJoin(member);
    } catch (error) {
        logError('Guild member add error:', error);
    }
});

// Guild Join event (Auto-Config)
client.on('guildCreate', async (guild) => {
    try {
        logInfo(`Joined a new guild: ${guild.name} (${guild.id})`);
        await autoConfig.runAutoConfig(guild);
    } catch (error) {
        logError('Guild create error:', error);
    }
});

// Message event handler for bot mentions and replies
client.on('messageCreate', async (message) => {
    const msgStart = Date.now();
    // Ignore bot messages
    if (message.author.bot) return;

    // --- CHANNEL LOCK CHECK ---
    if (moderationManager.isLocked(message.guild.id, message.channel.id)) {
        const isImmune = moderationManager.isImmuneToLock(message.member);
        if (!isImmune) {
            await message.delete().catch(() => { });
            return; // Stop matching commands or chat in a locked channel
        }
    }

    // --- GLOBAL SAFETY CHECK (AI & KEYWORDS) ---
    try {
        // 1. AI Safety Scan (New Phase 18)
        const { safetyScanner } = await import('./utils/safetyScanner.js');
        const isUnsafe = await safetyScanner.scanMessage(message);
        if (isUnsafe) return; // Message deleted/handled

        // 2. Keyword/Slur Check (Legacy but fast)
        const safetyCheck = securityManager.checkKeywords(message.content, message.author.id);
        if (!safetyCheck.safe && safetyCheck.isSlur) {
            // Delete the message immediately
            await message.delete().catch(() => { });

            // Report to mod channel
            await securityManager.reportViolation(message, safetyCheck.reason, true, client);

            // Warn the user (temporarily)
            const warningMsg = await message.channel.send(`⚠️ <@${message.author.id}>, that language is not allowed here.`);
            setTimeout(() => warningMsg.delete().catch(() => { }), 5000);

            return; // Stop processing this message
        }

        // 2. Advanced Auto-Mod (Invites, Emojis, Spam)
        // Check if configured (skip for admins if desired, logic inside checks)
        const contentCheck = moderationManager.checkContent(message);
        if (contentCheck.violation) {
            await message.delete().catch(() => { });
            await securityManager.reportViolation(message, contentCheck.reason, false, client);
            const warningMsg = await message.channel.send(`⚠️ <@${message.author.id}>, ${contentCheck.reason}.`);
            setTimeout(() => warningMsg.delete().catch(() => { }), 5000);
            return;
        }

    } catch (error) {
        logError('Safety check error:', error);
    }

    // --- XP & LEVELING (Phase 20) ---
    // Only award XP if message is safe and not a command (prefix or otherwise)
    if (!message.content.startsWith(config.discord.commandPrefix) && !message.author.bot) {
        try {
            const { levelingManager } = await import('./utils/levelingManager.js');
            const result = levelingManager.addXp(message.guild.id, message.author.id);

            if (result.leveledUp) {
                const { createSuccessEmbed } = await import('./utils/messageFormatter.js');
                const levelEmbed = createSuccessEmbed('Level Up! 🎉', `<@${message.author.id}> has reached **Level ${result.newLevel}**!`);
                await message.channel.send({ embeds: [levelEmbed] }).then(m => setTimeout(() => m.delete().catch(() => { }), 10000));
            }
        } catch (err) {
            console.error('[Leveling] Error awarding XP:', err);
        }
    }

    // 1. Handle Direct Commands (Priority)
    // Check if message starts with command prefix (e.g., '!')
    if (message.content.startsWith(config.discord.commandPrefix)) {
        const args = message.content.slice(config.discord.commandPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        try {
            // --- GLOBAL ADMIN FAIL-SAFE ---
            const adminCommands = ['add-slur', 'add-slurs', 'remove-slur', 'list-slurs', 'admin-immunity', 'modlog', 'automod', 'raid', 'role', 'webhook'];
            if (adminCommands.includes(commandName)) {
                if (!securityManager.isAdmin(message.member)) {
                    console.warn(`[Security] Unauthorized admin command attempt: !${commandName} by ${message.author.tag} (${message.author.id})`);
                    return await message.reply({ embeds: [createErrorEmbed('Access Denied', 'This command is restricted to bot administrators and server owners.')] });
                }
            }

            switch (commandName) {
                case 'pfp':
                case 'generate-pfp':
                    await handleGeneratePfp(message);
                    return; // Stop further processing

                case 'imagine':
                case 'img':
                    await handleImagine(message);
                    return; // Stop further processing

                // Add simple help command for convenience
                case 'help':
                case 'commands':
                    await handleHelp(message);
                    return;

                case 'ask': {
                    const prompt = args.join(' ');
                    if (!prompt) return message.reply('💭 **Usage:** `!ask <your question>`');
                    const adapter = buildPrefixAdapter(message);
                    await handleAskCommand({ prompt }, adapter);
                    return;
                }

                case 'edit': {
                    const prompt = args.join(' ');
                    const attachment = await getAttachment(message);
                    if (!prompt || !attachment) return message.reply('✏️ **Usage:** Reply to an image with `!edit <instructions>` or attach one.');
                    const adapter = buildPrefixAdapter(message);
                    await handleEditCommand({ prompt, imageUrl: attachment.url }, adapter);
                    return;
                }

                case 'video': {
                    const prompt = args.join(' ');
                    if (!prompt) return message.reply('🎬 **Usage:** `!video <description>`');
                    const attachment = await getAttachment(message);
                    const adapter = buildPrefixAdapter(message);
                    await handleVideoCommand({ prompt, refImageUrl: attachment?.url }, adapter);
                    return;
                }

                case 'angles360':
                case '360': {
                    const prompt = args.join(' ');
                    const attachment = await getAttachment(message);
                    if (!prompt || !attachment) return message.reply('🔄 **Usage:** Reply to an image with `!angles360 <prompt>` or attach one.');
                    const adapter = buildPrefixAdapter(message);
                    await handleAngles360Command({ prompt, imageUrl: attachment.url, makeVideo: true }, adapter);
                    return;
                }

                case 'remind': {
                    const splitIdx = args.indexOf('in');
                    if (splitIdx === -1) return message.reply('⏰ **Usage:** `!remind <message> in <time>` (e.g., `!remind water plants in 2 hours`)');
                    const reminderMsg = args.slice(0, splitIdx).join(' ');
                    const timeStr = args.slice(splitIdx).join(' ');
                    const adapter = buildPrefixAdapter(message);
                    await handleRemindCommand({ message: reminderMsg, when: timeStr }, adapter);
                    return;
                }

                case 'memory': {
                    const action = args[0]?.toLowerCase();
                    const key = args[1];
                    const value = args.slice(2).join(' ');
                    if (!['save', 'get', 'list', 'delete'].includes(action)) {
                        return message.reply('🧠 **Usage:** `!memory <save|get|list|delete> [key] [value]`');
                    }
                    const adapter = buildPrefixAdapter(message);
                    await handleMemoryCommand({ action, key, value }, adapter);
                    return;
                }

                case 'ping':
                    await message.reply(`Pong! 🏓 Latency: ${Date.now() - message.createdTimestamp}ms`);
                    return;

                // --- MODERATION COMMANDS ---
                case 'ban': await handlePrefixBan(message, args); return;
                case 'kick': await handlePrefixKick(message, args); return;
                case 'warn': await handlePrefixWarn(message, args); return;
                case 'warnings': await handleWarnings(message, args); return;
                case 'clearwarnings': await handleClearWarnings(message, args); return;
                case 'timeout':
                case 'mute': await handlePrefixTimeout(message, args); return;
                case 'untimeout':
                case 'unmute': await handleRemoveTimeout(message, args); return;
                case 'unban': await handlePrefixUnban(message, args); return;
                case 'role': await handlePrefixRole(message, args); return;
                case 'webhook': await handlePrefixWebhook(message, args); return;
                case 'modlog': await handleModLogChannel(message, args); return;
                case 'automod': await handleAutoModRule(message, args); return;
                case 'raid': await handleRaidProtection(message, args); return;
                case 'clear':
                case 'purge': await handleClear(message, args); return;
                case 'lock':
                case 'view-only':
                case 'viewonly': await handleLock(message, args); return;
                case 'lock-immunity': await handleLockImmunity(message, args); return;
                case 'mod-guide':
                case 'modhelp': await handleModGuide(message); return;
                case 'note': await handleNote(message, args); return; // New Note Command
                case 'report': await handleReport(message, args); return; // New Report Command

                // --- ADMIN COMMANDS ---
                case 'add-slur': await handleAddSlur(message, args); return;
                case 'remove-slur': await handleRemoveSlur(message, args); return;
                case 'list-slurs': await handleListSlurs(message, args); return;
                case 'admin-immunity': await handleAdminImmunity(message, args); return;

                // --- NEW FEATURE COMMANDS (Phase 20-21) ---
                case 'rank':
                case 'level':
                case 'xp': await handlePrefixRank(message, args); return;

                case 'leaderboard':
                case 'lb':
                case 'top': await handlePrefixLeaderboard(message, args); return;

                case 'server':
                case 'backup': await handlePrefixServer(message, args); return;

                case 'safety': await handlePrefixSafety(message, args); return;

                case 'logging':
                case 'audit': await handlePrefixLogging(message, args); return;

                // --- UTILITY COMMANDS ---
                case 'status': await handleModelStatus(message); return;
            }
        } catch (error) {
            logError(`Error executing command ${commandName}:`, error);
            await message.reply('❌ An error occurred while executing that command.');
            return;
        }
    }

    // 2. Handle DMs (unless configured to be open)
    if (message.channel.type === 'DM' && config.security.dmPolicy !== 'open') return;

    // 3. Handle Chat (Mentions & Replies)
    // Check if bot is mentioned
    const isMentioned = message.mentions.users.has(client.user.id);
    let isReply = message.reference?.messageId && message.reference?.channelId === message.channel.id;

    // Get the original message if this is a reply
    let originalMessage = null;
    if (isReply) {
        try {
            originalMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (originalMessage.author.id === client.user.id) {
                isReply = true;
            } else {
                isReply = false;
            }
        } catch (error) {
            isReply = false;
        }
    }

    // If bot is mentioned or replied to
    if (isMentioned || isReply) {
        try {
            // Extract the actual message content (remove mentions)
            let content = message.content;
            if (isMentioned) {
                // Remove bot mention from content
                content = content.replace(new RegExp(`<@!?${client.user.id}>`), '').trim();
            }

            // Handle empty messages
            if (!content) {
                await message.reply({ content: '💬 How can I help you? Try `!help` for available commands.', ephemeral: true });
                return;
            }

            // Try natural language routing first (image gen, video, remind, etc.)
            const handled = await routeNaturalLanguage(message, content, client);
            if (handled) return;

            // Fall through to general chat if NL router didn't handle it
            await handleChat(message, content);

        } catch (error) {
            logError('Chat handling error:', error);
            await message.reply({ content: '❌ Something went wrong. Please try again.', ephemeral: true });
        }
    }
    performanceMonitor.trackMessageProcessing(Date.now() - msgStart, message.channel.type);
});

// --- STARBOARD (Phase 20) ---
client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot) return; // Ignore bots
        const { starboardManager } = await import('./utils/starboardManager.js');
        await starboardManager.handleReactionAdd(reaction, user);
    } catch (error) {
        console.error('Starboard error:', error);
    }
});

// Global Cleanup
process.on('exit', () => fs.existsSync(lockFile) && fs.unlinkSync(lockFile));
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

// Global Exception Handlers
process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled Rejection at:', promise);
    logError('Reason:', reason);
});

process.on('uncaughtException', (err) => {
    logError('Uncaught Exception:', err);
});

// Login to Discord
client.login(config.discord.token).catch((error) => {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
});
