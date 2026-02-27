import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PerformanceMonitor extends EventEmitter {
    constructor() {
        super();
        this.metrics = {
            commandExecutions: [],
            messageProcessing: [],
            databaseQueries: [],
            memoryUsage: [],
            cpuUsage: [],
            eventLoopLag: [],
            websocketLatency: [],
            rateLimits: []
        };
        this.slowOperations = [];
        this.alerts = [];
        this.memorySnapshots = [];
        this.historyRetention = 3600000;
        this.collectionInterval = null;
        this.eventLoopMonitor = null;
        this.isRunning = false;
        this.thresholds = {
            commandExecution: 1000,
            messageProcessing: 500,
            databaseQuery: 200,
            memoryHeap: 524288000,
            memoryRSS: 1048576000,
            cpuUsage: 80,
            eventLoopLag: 100,
            websocketLatency: 500
        };
        this.autoOptimization = [];
        this.lastGC = Date.now();
        this.gcInterval = 60000;
        this.connectionPoolMetrics = {
            activeConnections: 0,
            idleConnections: 0,
            waitingRequests: 0,
            queryWaitTime: []
        };
        this.startTime = Date.now();
    }

    initialize(config = {}) {
        this.thresholds = { ...this.thresholds, ...config.thresholds };
        this.historyRetention = config.historyRetention || this.historyRetention;
        this.gcInterval = config.gcInterval || this.gcInterval;
        this.startCollection();
        this.startEventLoopMonitoring();
        this.setupMemoryLeakDetection();
        console.log('[PerformanceMonitor] Initialized successfully');
        return this;
    }

    startCollection() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.collectionInterval = setInterval(() => this.collectMetrics(), 1000);
        this.emit('collectionStarted');
    }

    stopCollection() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }
        if (this.eventLoopMonitor) {
            clearInterval(this.eventLoopMonitor);
            this.eventLoopMonitor = null;
        }
        this.emit('collectionStopped');
    }

    collectMetrics() {
        try {
            this.collectMemoryMetrics();
            this.collectCPUMetrics();
            this.cleanupOldData();
            this.checkThresholds();
            this.detectMemoryLeaks();
            this.generateOptimizations();
        } catch (error) {
            console.error('[PerformanceMonitor] Collection error:', error.message);
        }
    }

    collectMemoryMetrics() {
        const memUsage = process.memoryUsage();
        const memData = {
            timestamp: Date.now(),
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss,
            external: memUsage.external,
            arrayBuffers: memUsage.arrayBuffers,
            gcEnabled: false
        };

        if (global.gc) {
            memData.gcEnabled = true;
            memData.sinceLastGC = Date.now() - this.lastGC;
        }

        this.metrics.memoryUsage.push(memData);
        if (this.metrics.memoryUsage.length > 300) {
            this.metrics.memoryUsage.shift();
        }

        this.emit('memoryMetrics', memData);
        return memData;
    }

    collectCPUMetrics() {
        const startUsage = process.cpuUsage();
        const startTime = Date.now();

        const cpuData = {
            timestamp: Date.now(),
            user: startUsage.user,
            system: startUsage.system,
            percent: 0
        };

        setImmediate(() => {
            const endUsage = process.cpuUsage();
            const endTime = Date.now();
            const elapsed = endTime - startTime;

            if (elapsed > 0) {
                cpuData.percent = ((endUsage.user - startUsage.user + endUsage.system - startUsage.system) / 1000 / elapsed) * 100;
            }

            this.metrics.cpuUsage.push(cpuData);
            if (this.metrics.cpuUsage.length > 300) {
                this.metrics.cpuUsage.shift();
            }

            this.emit('cpuMetrics', cpuData);
        });

        return cpuData;
    }

    startEventLoopMonitoring() {
        let lastCheck = Date.now();
        const checkInterval = 50;

        this.eventLoopMonitor = setInterval(() => {
            const now = Date.now();
            const lag = now - lastCheck;

            if (lag > 10) {
                this.metrics.eventLoopLag.push({
                    timestamp: now,
                    lag: lag
                });

                if (this.metrics.eventLoopLag.length > 300) {
                    this.metrics.eventLoopLag.shift();
                }

                if (lag > this.thresholds.eventLoopLag) {
                    this.createAlert('eventLoopLag', 'warning', `Event loop lag detected: ${lag}ms`);
                }
            }

            lastCheck = now;
        }, checkInterval);
    }

    trackCommandExecution(commandName, duration, metadata = {}) {
        const data = {
            timestamp: Date.now(),
            command: commandName,
            duration: duration,
            success: true,
            ...metadata
        };

        this.metrics.commandExecutions.push(data);
        if (this.metrics.commandExecutions.length > 1000) {
            this.metrics.commandExecutions.shift();
        }

        if (duration > this.thresholds.commandExecution) {
            this.slowOperations.push({
                ...data,
                type: 'slowCommand',
                severity: duration > this.thresholds.commandExecution * 2 ? 'critical' : 'warning'
            });

            if (this.slowOperations.length > 100) {
                this.slowOperations.shift();
            }

            this.createAlert('slowCommand', 'warning', `Slow command: ${commandName} took ${duration}ms`);
        }

        this.emit('commandExecution', data);
        return data;
    }

    trackMessageProcessing(duration, channelType, success = true) {
        const data = {
            timestamp: Date.now(),
            duration: duration,
            channelType: channelType,
            success: success,
            rate: this.calculateMessageRate()
        };

        this.metrics.messageProcessing.push(data);
        if (this.metrics.messageProcessing.length > 1000) {
            this.metrics.messageProcessing.shift();
        }

        if (duration > this.thresholds.messageProcessing) {
            this.createAlert('slowMessage', 'warning', `Slow message processing: ${duration}ms in ${channelType}`);
        }

        this.emit('messageProcessing', data);
        return data;
    }

    trackDatabaseQuery(queryType, duration, success = true) {
        const data = {
            timestamp: Date.now(),
            type: queryType,
            duration: duration,
            success: success
        };

        this.metrics.databaseQueries.push(data);
        if (this.metrics.databaseQueries.length > 1000) {
            this.metrics.databaseQueries.shift();
        }

        if (duration > this.thresholds.databaseQuery) {
            this.slowOperations.push({
                ...data,
                type: 'slowQuery',
                severity: duration > this.thresholds.databaseQuery * 3 ? 'critical' : 'warning'
            });

            this.createAlert('slowQuery', 'warning', `Slow database query (${queryType}): ${duration}ms`);
        }

        this.emit('databaseQuery', data);
        return data;
    }

    trackWebSocketLatency(latency, connectionId = 'default') {
        const data = {
            timestamp: Date.now(),
            latency: latency,
            connectionId: connectionId
        };

        this.metrics.websocketLatency.push(data);
        if (this.metrics.websocketLatency.length > 500) {
            this.metrics.websocketLatency.shift();
        }

        if (latency > this.thresholds.websocketLatency) {
            this.createAlert('highLatency', 'warning', `WebSocket latency: ${latency}ms for ${connectionId}`);
        }

        this.emit('websocketLatency', data);
        return data;
    }

    trackRateLimit(limitType, current, maximum, resetIn) {
        const data = {
            timestamp: Date.now(),
            type: limitType,
            current: current,
            maximum: maximum,
            percentage: (current / maximum) * 100,
            resetIn: resetIn
        };

        this.metrics.rateLimits.push(data);
        if (this.metrics.rateLimits.length > 200) {
            this.metrics.rateLimits.shift();
        }

        if (data.percentage > 80) {
            this.createAlert('rateLimit', 'warning', `Rate limit approaching: ${limitType} at ${data.percentage.toFixed(1)}%`);
        }

        this.emit('rateLimit', data);
        return data;
    }

    updateConnectionPoolMetrics(metrics) {
        this.connectionPoolMetrics = {
            ...this.connectionPoolMetrics,
            ...metrics,
            timestamp: Date.now()
        };

        if (metrics.queryWaitTime) {
            this.connectionPoolMetrics.queryWaitTime.push(...metrics.queryWaitTime);
            if (this.connectionPoolMetrics.queryWaitTime.length > 100) {
                this.connectionPoolMetrics.queryWaitTime = this.connectionPoolMetrics.queryWaitTime.slice(-100);
            }
        }

        if (this.connectionPoolMetrics.waitingRequests > 5) {
            this.createAlert('poolExhaustion', 'warning', `Connection pool exhaustion: ${this.connectionPoolMetrics.waitingRequests} waiting requests`);
        }

        this.emit('poolMetrics', this.connectionPoolMetrics);
    }

    calculateMessageRate() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const recentMessages = this.metrics.messageProcessing.filter(m => m.timestamp > oneMinuteAgo);
        return recentMessages.length;
    }

    calculateCommandRate() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const recentCommands = this.metrics.commandExecutions.filter(c => c.timestamp > oneMinuteAgo);
        return recentCommands.length;
    }

    calculateAverageQueryDuration() {
        const recent = this.metrics.databaseQueries.slice(-100);
        if (recent.length === 0) return 0;
        const total = recent.reduce((sum, q) => sum + q.duration, 0);
        return total / recent.length;
    }

    setupMemoryLeakDetection() {
        setInterval(() => this.detectMemoryLeaks(), 30000);
    }

    detectMemoryLeaks() {
        const memUsage = process.memoryUsage();
        const heapUsed = memUsage.heapUsed;
        const memHistory = this.metrics.memoryUsage.slice(-60);

        if (memHistory.length < 60) return;

        const trend = this.calculateTrend(memHistory.map(m => m.heapUsed));
        const growthRate = trend.slope;
        const memoryIncrease = heapUsed - memHistory[0].heapUsed;
        const percentIncrease = (memoryIncrease / memHistory[0].heapUsed) * 100;

        if (percentIncrease > 20 && growthRate > 100000) {
            this.createAlert('memoryLeak', 'critical', `Potential memory leak detected: ${percentIncrease.toFixed(1)}% increase over 1 minute`);
            this.slowOperations.push({
                timestamp: Date.now(),
                type: 'memoryLeak',
                severity: 'critical',
                message: `Memory growing at ${(growthRate / 1024 / 1024).toFixed(2)} MB/min`
            });
        }

        if (heapUsed > this.thresholds.memoryHeap) {
            this.createAlert('highMemory', 'warning', `High memory usage: ${(heapUsed / 1024 / 1024).toFixed(2)} MB heap`);
        }

        this.memorySnapshots.push({
            timestamp: Date.now(),
            heapUsed: heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss
        });

        if (this.memorySnapshots.length > 1440) {
            this.memorySnapshots.shift();
        }
    }

    calculateTrend(values) {
        if (values.length < 2) return { slope: 0, intercept: 0 };
        const n = values.length;
        const xSum = values.reduce((sum, _, i) => sum + i, 0);
        const ySum = values.reduce((sum, y) => sum + y, 0);
        const xySum = values.reduce((sum, y, i) => sum + i * y, 0);
        const xxSum = values.reduce((sum, _, i) => sum + i * i, 0);

        const slope = (n * xySum - xSum * ySum) / (n * xxSum - xSum * xSum);
        const intercept = (ySum - slope * xSum) / n;

        return { slope, intercept };
    }

    checkThresholds() {
        const memUsage = process.memoryUsage();

        if (memUsage.heapUsed > this.thresholds.memoryHeap) {
            this.createAlert('memoryThreshold', 'warning', `Heap memory (${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB) exceeds threshold`);
        }

        if (memUsage.rss > this.thresholds.memoryRSS) {
            this.createAlert('memoryRSS', 'warning', `RSS memory (${(memUsage.rss / 1024 / 1024).toFixed(2)} MB) exceeds threshold`);
        }

        const recentCPU = this.metrics.cpuUsage.slice(-5);
        if (recentCPU.length >= 5) {
            const avgCPU = recentCPU.reduce((sum, c) => sum + c.percent, 0) / recentCPU.length;
            if (avgCPU > this.thresholds.cpuUsage) {
                this.createAlert('highCPU', 'warning', `High CPU usage: ${avgCPU.toFixed(1)}%`);
            }
        }
    }

    generateOptimizations() {
        const suggestions = [];
        const memUsage = process.memoryUsage();
        const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

        if (heapPercent > 80) {
            suggestions.push({
                type: 'memory',
                priority: 'high',
                message: 'Heap usage above 80%. Consider calling global.gc() if enabled or optimizing object creation.',
                action: 'Review and minimize object allocations'
            });
        }

        const avgQueryTime = this.calculateAverageQueryDuration();
        if (avgQueryTime > 100) {
            suggestions.push({
                type: 'database',
                priority: 'medium',
                message: `Average query time is ${avgQueryTime.toFixed(1)}ms. Consider adding indexes or caching.`,
                action: 'Review database queries and add indexes'
            });
        }

        const recentSlowCommands = this.slowOperations.filter(op => 
            op.type === 'slowCommand' && Date.now() - op.timestamp < 300000
        );

        if (recentSlowCommands.length > 5) {
            const commandGroups = recentSlowCommands.reduce((acc, cmd) => {
                acc[cmd.command] = (acc[cmd.command] || 0) + 1;
                return acc;
            }, {});

            const problematicCommands = Object.entries(commandGroups)
                .filter(([_, count]) => count > 2)
                .map(([cmd, count]) => `${cmd} (${count} times)`);

            if (problematicCommands.length > 0) {
                suggestions.push({
                    type: 'performance',
                    priority: 'high',
                    message: `Commands with multiple slow executions: ${problematicCommands.join(', ')}`,
                    action: 'Optimize these command handlers'
                });
            }
        }

        if (this.connectionPoolMetrics.waitingRequests > 0) {
            suggestions.push({
                type: 'database',
                priority: 'high',
                message: `${this.connectionPoolMetrics.waitingRequests} requests waiting for database connections`,
                action: 'Consider increasing connection pool size or optimizing queries'
            });
        }

        this.autoOptimization = suggestions;
        if (suggestions.length > 0) {
            this.emit('optimizationSuggestions', suggestions);
        }
    }

    createAlert(type, severity, message) {
        const alert = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            severity,
            message,
            timestamp: Date.now(),
            acknowledged: false
        };

        this.alerts.push(alert);
        if (this.alerts.length > 200) {
            this.alerts.shift();
        }

        this.emit('alert', alert);
        return alert;
    }

    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = Date.now();
        }
        return alert;
    }

    clearAlerts(olderThan = null) {
        if (olderThan) {
            const cutoff = Date.now() - olderThan;
            this.alerts = this.alerts.filter(a => a.timestamp > cutoff);
        } else {
            this.alerts = [];
        }
    }

    cleanupOldData() {
        const cutoff = Date.now() - this.historyRetention;

        for (const key in this.metrics) {
            if (Array.isArray(this.metrics[key])) {
                this.metrics[key] = this.metrics[key].filter(d => d.timestamp > cutoff);
            }
        }

        this.slowOperations = this.slowOperations.filter(o => Date.now() - o.timestamp < 300000);
    }

    getMetrics() {
        const memUsage = process.memoryUsage();
        return {
            uptime: Date.now() - this.startTime,
            memory: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                heapPercent: (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(2),
                rss: memUsage.rss,
                external: memUsage.external
            },
            cpu: {
                current: this.metrics.cpuUsage.length > 0 
                    ? this.metrics.cpuUsage[this.metrics.cpuUsage.length - 1].percent.toFixed(2)
                    : 0
            },
            messageRate: this.calculateMessageRate(),
            commandRate: this.calculateCommandRate(),
            avgQueryTime: this.calculateAverageQueryDuration().toFixed(2),
            activeConnections: this.connectionPoolMetrics.activeConnections,
            pendingRequests: this.connectionPoolMetrics.waitingRequests,
            alerts: {
                total: this.alerts.length,
                unacknowledged: this.alerts.filter(a => !a.acknowledged).length,
                critical: this.alerts.filter(a => a.severity === 'critical').length
            }
        };
    }

    getDetailedMetrics() {
        return {
            ...this.metrics,
            slowOperations: this.slowOperations.slice(-50),
            alerts: this.alerts.slice(-100),
            connectionPool: this.connectionPoolMetrics,
            memorySnapshots: this.memorySnapshots.slice(-100),
            autoOptimization: this.autoOptimization,
            thresholds: this.thresholds
        };
    }

    getHistory(metricType, duration = 300000) {
        const cutoff = Date.now() - duration;
        if (this.metrics[metricType]) {
            return this.metrics[metricType].filter(d => d.timestamp > cutoff);
        }
        return [];
    }

    getPrometheusMetrics() {
        const memUsage = process.memoryUsage();
        const cpuData = this.metrics.cpuUsage[this.metrics.cpuUsage.length - 1] || { percent: 0 };
        
        let output = '';
        output += '# HELP bot_command_duration_seconds Command execution duration\n';
        output += '# TYPE bot_command_duration_seconds histogram\n';
        
        const recentCommands = this.metrics.commandExecutions.slice(-100);
        for (const cmd of recentCommands) {
            output += `bot_command_duration_seconds{command="${cmd.command}"} ${(cmd.duration / 1000).toFixed(6)}\n`;
        }

        output += '\n# HELP bot_memory_heap_bytes Process heap memory usage\n';
        output += '# TYPE bot_memory_heap_bytes gauge\n';
        output += `bot_memory_heap_bytes ${memUsage.heapUsed}\n`;

        output += '\n# HELP bot_memory_rss_bytes Process RSS memory usage\n';
        output += '# TYPE bot_memory_rss_bytes gauge\n';
        output += `bot_memory_rss_bytes ${memUsage.rss}\n`;

        output += '\n# HELP bot_cpu_usage_percent CPU usage percentage\n';
        output += '# TYPE bot_cpu_usage_percent gauge\n';
        output += `bot_cpu_usage_percent ${cpuData.percent.toFixed(2)}\n`;

        output += '\n# HELP bot_message_rate_messages_per_minute Message processing rate\n';
        output += '# TYPE bot_message_rate_messages_per_minute gauge\n';
        output += `bot_message_rate_messages_per_minute ${this.calculateMessageRate()}\n`;

        output += '\n# HELP bot_command_rate_commands_per_minute Command execution rate\n';
        output += '# TYPE bot_command_rate_commands_per_minute gauge\n';
        output += `bot_command_rate_commands_per_minute ${this.calculateCommandRate()}\n`;

        output += '\n# HELP bot_database_query_duration_seconds Database query duration\n';
        output += '# TYPE bot_database_query_duration_seconds histogram\n';
        const recentQueries = this.metrics.databaseQueries.slice(-100);
        for (const query of recentQueries) {
            output += `bot_database_query_duration_seconds{type="${query.type}"} ${(query.duration / 1000).toFixed(6)}\n`;
        }

        output += '\n# HELP bot_event_loop_lag_seconds Event loop lag\n';
        output += '# TYPE bot_event_loop_lag_seconds histogram\n';
        const recentLag = this.metrics.eventLoopLag.slice(-100);
        for (const lag of recentLag) {
            output += `bot_event_loop_lag_seconds ${(lag.lag / 1000).toFixed(6)}\n`;
        }

        output += '\n# HELP bot_websocket_latency_seconds WebSocket latency\n';
        output += '# TYPE bot_websocket_latency_seconds histogram\n';
        const recentLatency = this.metrics.websocketLatency.slice(-100);
        for (const ws of recentLatency) {
            output += `bot_websocket_latency_seconds{connection="${ws.connectionId}"} ${(ws.latency / 1000).toFixed(6)}\n`;
        }

        output += '\n# HELP bot_alerts_active Current number of active alerts\n';
        output += '# TYPE bot_alerts_active gauge\n';
        output += `bot_alerts_active ${this.alerts.filter(a => !a.acknowledged).length}\n`;

        return output;
    }

    exportMetrics(format = 'json') {
        if (format === 'json') {
            return JSON.stringify({
                timestamp: Date.now(),
                summary: this.getMetrics(),
                detailed: this.getDetailedMetrics()
            }, null, 2);
        }

        if (format === 'prometheus') {
            return this.getPrometheusMetrics();
        }

        return null;
    }

    shutdown() {
        this.stopCollection();
        this.emit('shutdown');
    }
}

const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor;
export { PerformanceMonitor };
