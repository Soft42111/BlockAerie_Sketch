import databaseManager from '../src/utils/database.js';
import { startScheduler, createReminder, stopScheduler } from '../packages/scheduler/index.js';
import fs from 'fs';
import path from 'path';

async function verify() {
    console.log('--- Initializing Database ---');
    await databaseManager.initialize();

    console.log('--- Initializing Scheduler ---');
    startScheduler(() => { });

    // Add a test reminder to trigger sync
    createReminder({
        userId: 'test_user',
        channelId: 'test_chan',
        message: 'Sync test',
        fireAt: new Date(Date.now() + 60000)
    });

    console.log('--- Checking Files ---');
    const expectedFiles = [
        'registry.md',
        'reputation.md',
        'moderation_logs.md',
        'server_settings.md',
        'reminders.md'
    ];

    const memoryDir = path.join(process.cwd(), 'memory');
    for (const file of expectedFiles) {
        const filePath = path.join(memoryDir, file);
        if (fs.existsSync(filePath)) {
            console.log(`✅ ${file} exists.`);
        } else {
            console.log(`❌ ${file} NOT found.`);
        }
    }

    stopScheduler();
    console.log('\nVerification complete.');
}

verify().catch(err => {
    console.error(err);
    process.exit(1);
});
