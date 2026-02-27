// Example: How to integrate Performance Monitor and Dashboard into index.js
// Add these imports and modifications to your existing src/index.js

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import performanceMonitor from './utils/performanceMonitor.js';
import dashboardServer from './utils/dashboard.js';

// ... existing imports

// Initialize Performance Monitoring
performanceMonitor.initialize({
    thresholds: {
        commandExecution: 1000,
        messageProcessing: 500,
        databaseQuery: 200,
        memoryHeap: 524288000,
        cpuUsage: 80,
        eventLoopLag: 100
    },
    historyRetention: 3600000
});

// Start Dashboard (optional, set DASHBOARD_ENABLED=false to disable)
if (process.env.DASHBOARD_ENABLED !== 'false') {
    dashboardServer.start();
}

// Track command execution time
const originalHandleCommand = async (interaction) => {
    const startTime = Date.now();
    try {
        // ... your command logic
        const duration = Date.now() - startTime;
        performanceMonitor.trackCommandExecution(
            interaction.commandName,
            duration,
            { guildId: interaction.guildId, userId: interaction.user.id }
        );
    } catch (error) {
        const duration = Date.now() - startTime;
        performanceMonitor.trackCommandExecution(
            interaction.commandName,
            duration,
            { success: false, error: error.message }
        );
        throw error;
    }
};

// Track message processing
client.on('messageCreate', async (message) => {
    const startTime = Date.now();
    try {
        // ... your message handling logic
        const duration = Date.now() - startTime;
        performanceMonitor.trackMessageProcessing(
            duration,
            message.channel.type,
            true
        );
    } catch (error) {
        const duration = Date.now() - startTime;
        performanceMonitor.trackMessageProcessing(
            duration,
            message.channel.type,
            false
        );
    }
});

// Track database queries (wrap your database calls)
async function trackedQuery(sql, params) {
    const startTime = Date.now();
    try {
        const result = await db.execute(sql, params);
        const duration = Date.now() - startTime;
        performanceMonitor.trackDatabaseQuery('custom', duration, true);
        return result;
    } catch (error) {
        const duration = Date.now() - startTime;
        performanceMonitor.trackDatabaseQuery('custom', duration, false);
        throw error;
    }
}

// Track WebSocket latency (for Discord gateway)
client.on('ready', () => {
    setInterval(() => {
        const ping = client.ws.ping;
        performanceMonitor.trackWebSocketLatency(ping, 'discord-gateway');
    }, 30000);
});

// Update connection pool metrics (if using pool)
if (databaseManager.db) {
    performanceMonitor.updateConnectionPoolMetrics({
        activeConnections: 1,
        idleConnections: 0,
        waitingRequests: 0
    });
}

// Clean shutdown
process.on('exit', () => {
    performanceMonitor.shutdown();
    dashboardServer.stop();
});
