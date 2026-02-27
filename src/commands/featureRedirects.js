/**
 * Feature Prefix Command Redirects
 * 
 * Bridges legacy prefix commands (!) to the new feature handlers 
 * (Leveling, Server, Safety, Logging).
 */
import { handleLevelCommand } from './levelCommands.js';
import { handleServerCommand } from './serverCommands.js';
import { handleSafetyCommand } from './safetyCommands.js';
import { handleLoggingCommand } from './loggingCommands.js';
import { buildPrefixAdapter } from '../utils/prefixAdapter.js';
import { createErrorEmbed } from '../utils/messageFormatter.js';

export async function handlePrefixRank(message, args) {
    const adapter = buildPrefixAdapter(message);
    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);

    await handleLevelCommand({
        commandName: 'rank',
        user: targetUser
    }, adapter, message.guild);
}

export async function handlePrefixLeaderboard(message, args) {
    const adapter = buildPrefixAdapter(message);
    await handleLevelCommand({
        commandName: 'leaderboard'
    }, adapter, message.guild);
}

export async function handlePrefixServer(message, args) {
    const adapter = buildPrefixAdapter(message);
    // Usage: !server backup create | !server restore <id>
    const arg0 = args[0]?.toLowerCase(); // backup, restore
    const arg1 = args[1]?.toLowerCase(); // create, list, info OR <id>

    let params = {};

    if (arg0 === 'backup') {
        params = {
            subcommandGroup: 'backup',
            subcommand: arg1,
            backupId: args[2] // e.g. !server backup info <id>
        };
    } else if (arg0 === 'restore') {
        params = {
            subcommand: 'restore',
            backupId: args[1]
        };
    } else {
        // Fallback/Help
        await adapter.reply('ℹ️ **Server Usage:**\n`!server backup create`\n`!server backup list`\n`!server restore <id>`');
        return;
    }

    await handleServerCommand(params, adapter, message.guild);
}

export async function handlePrefixSafety(message, args) {
    const adapter = buildPrefixAdapter(message);
    // Usage: !safety user @user | !safety role @role | !safety scan on/off | !safety whitelist list
    const subcommand = args[0]?.toLowerCase();

    let params = {};

    if (subcommand === 'whitelist') {
        // !safety whitelist list
        // !safety whitelist add @user
        // !safety whitelist remove @role
        const action = args[1]?.toLowerCase();

        params.subcommandGroup = 'whitelist';
        params.subcommand = action;

        if (action === 'add' || action === 'remove') {
            params.user = message.mentions.users.first();
            params.role = message.mentions.roles.first();
            if (!params.user && !params.role) {
                await adapter.reply(`❌ Usage: \`!safety whitelist ${action} @user/@role\``);
                return;
            }
        } else if (action !== 'list') {
            await adapter.reply('❌ Usage: `!safety whitelist <add|remove|list>`');
            return;
        }

    } else if (subcommand === 'scan' || subcommand === 'scanner') {
        // !safety scan on/off
        const state = args[1]?.toLowerCase();
        if (state !== 'on' && state !== 'off') {
            await adapter.reply('❌ Usage: `!safety scan <on|off>`');
            return;
        }
        params.subcommand = 'config';
        params.scanner = (state === 'on');
    } else {
        await adapter.reply('ℹ️ **Safety Usage:**\n`!safety whitelist list`\n`!safety whitelist add @user`\n`!safety scan on`');
        return;
    }

    await handleSafetyCommand(params, adapter);
}

export async function handlePrefixLogging(message, args) {
    const adapter = buildPrefixAdapter(message);
    // Usage: !logging test
    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'test') {
        await handleLoggingCommand({ subcommand: 'test' }, adapter, message.guild);
    } else {
        await adapter.reply('ℹ️ **Logging Usage:** `!logging test`');
    }
}
