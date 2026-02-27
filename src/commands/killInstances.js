import { exec } from 'child_process';
import { logInfo, logError, logSuccess } from '../utils/errorHandler.js';
import { config } from '../config.js';

export async function handleKillInstances(message) {
    // Basic security: Check if user has Administrator permission in Discord
    // OR check against a specific hardcoded ID if preferred. 
    // For now, we'll use Discord's "Administrator" permission or check if they are the bot owner.

    // You can add your ID here if you want strict locking
    // const ADMIN_ID = '935757941468954644'; 
    // if (message.author.id !== ADMIN_ID) return;

    if (!message.member.permissions.has('Administrator')) {
        return message.reply('❌ You do not have permission to use this command.');
    }

    const findingMsg = await message.reply('🔍 Scanning for zombie node processes...');

    // Windows specific command to find node processes
    const cmd = 'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH';

    exec(cmd, async (error, stdout, stderr) => {
        if (error) {
            logError('Failed to list processes', error);
            return findingMsg.edit('❌ Failed to scan processes.');
        }

        // Parse CSV output
        const lines = stdout.trim().split('\r\n');
        const processes = lines.map(line => {
            const parts = line.split('","');
            if (parts.length < 2) return null;
            return {
                name: parts[0].replace('"', ''),
                pid: parts[1].replace('"', '')
            };
        }).filter(p => p && p.name === 'node.exe');

        const myPid = process.pid.toString();
        const targets = processes.filter(p => p.pid !== myPid);

        if (targets.length === 0) {
            return findingMsg.edit('✅ No other pending node processes found.');
        }

        await findingMsg.edit(`⚠️ Found ${targets.length} other node processes. Killing them...`);

        let killedCount = 0;

        for (const p of targets) {
            try {
                process.kill(parseInt(p.pid), 'SIGKILL');
                killedCount++;
                logInfo(`Killed zombie process PID: ${p.pid}`);
            } catch (e) {
                logError(`Failed to kill PID ${p.pid}`, e);
            }
        }

        await message.channel.send(`💀 **Killed ${killedCount} zombie instances.** Clean slate!`);
    });
}
