#!/usr/bin/env node

console.log('🚀 Starting BlockAerie Sketch...\n');

async function main() {
    const errors = [];
    const modules = [
        { name: 'Database', path: './src/utils/database.js' },
        { name: 'Performance Monitor', path: './src/utils/performanceMonitor.js' },
        { name: 'Anti-Spam', path: './src/utils/antiSpam.js' },
        { name: 'Auto-Moderation', path: './src/utils/autoModeration.js' },
        { name: 'Webhook Manager', path: './src/utils/webhookManager.js' },
        { name: 'Reputation System', path: './src/utils/reputationSystem.js' },
        { name: 'Dashboard', path: './src/utils/dashboard.js' }
    ];

    console.log('🔍 Checking modules...');
    for (const mod of modules) {
        try {
            await import(mod.path);
            console.log(`✅ ${mod.name}`);
        } catch (error) {
            console.log(`❌ ${mod.name}: ${error.message}`);
            errors.push(mod.name);
        }
    }

    if (errors.length > 0) {
        console.log(`\n❌ ${errors.length} module(s) failed to load`);
        process.exit(1);
    }

    console.log('\n✅ All modules loaded successfully!');
    console.log('🚀 Starting main bot...');
    
    // Start the main bot
    const { default: dashboardServer } = await import('./src/utils/dashboard.js');
    dashboardServer.start();
    console.log(`📊 Dashboard: http://localhost:${dashboardServer.port}`);
    
    console.log('\n🛑 Press Ctrl+C to stop\n');
}

main().catch(e => {
    console.error('❌ Startup error:', e.message);
    process.exit(1);
});
