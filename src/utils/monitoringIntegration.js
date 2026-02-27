import performanceMonitor from './utils/performanceMonitor.js';
import dashboardServer from './utils/dashboard.js';

class MonitoringIntegration {
    constructor() {
        this.perfMon = null;
        this.dashboard = null;
    }

    async initialize(config = {}) {
        try {
            this.perfMon = performanceMonitor;
            
            this.perfMon.initialize({
                thresholds: {
                    commandExecution: config.commandThreshold || 1000,
                    messageProcessing: config.messageThreshold || 500,
                    databaseQuery: config.databaseThreshold || 200,
                    memoryHeap: config.memoryHeapThreshold || 524288000,
                    cpuUsage: config.cpuThreshold || 80,
                    eventLoopLag: config.eventLoopThreshold || 100
                },
                historyRetention: config.historyRetention || 3600000,
                gcInterval: config.gcInterval || 60000
            });

            this.setupEventListeners();

            if (config.enableDashboard !== false) {
                this.dashboard = dashboardServer;
                this.dashboard.start();
                this.linkSystems();
            }

            console.log('[MonitoringIntegration] All systems initialized');
            return true;
        } catch (error) {
            console.error('[MonitoringIntegration] Initialization failed:', error);
            throw error;
        }
    }

    setupEventListeners() {
        this.perfMon.on('alert', (alert) => {
            console.log(`[Alert ${alert.severity}] ${alert.message}`);
            
            if (this.dashboard) {
                this.dashboard.notifications.push({
                    id: alert.id,
                    type: alert.severity,
                    message: alert.message,
                    timestamp: Date.now()
                });
                this.dashboard.broadcast('notification', {
                    type: alert.severity,
                    message: alert.message
                });
            }
        });

        this.perfMon.on('optimizationSuggestions', (suggestions) => {
            console.log('[Optimization Suggestions]:', suggestions);
            
            if (this.dashboard) {
                this.dashboard.autoOptimization = suggestions;
            }
        });

        this.perfMon.on('memoryMetrics', (metrics) => {
            if (this.dashboard) {
                this.dashboard.broadcast('memory', metrics);
            }
        });

        this.perfMon.on('commandExecution', (data) => {
            if (this.dashboard) {
                this.dashboard.broadcast('command', data);
            }
        });

        this.perfMon.on('databaseQuery', (data) => {
            if (this.dashboard) {
                this.dashboard.broadcast('database', data);
            }
        });
    }

    linkSystems() {
        this.dashboard.getDataForChannel = (channel) => {
            switch (channel) {
                case 'metrics':
                    return this.perfMon.getMetrics();
                case 'memory':
                    const mem = process.memoryUsage();
                    return {
                        heapUsed: mem.heapUsed,
                        heapTotal: mem.heapTotal,
                        rss: mem.rss,
                        external: mem.external
                    };
                case 'alerts':
                    return this.perfMon.alerts.filter(a => !a.acknowledged);
                case 'optimization':
                    return this.perfMon.autoOptimization;
                default:
                    return null;
            }
        };

        this.dashboard.handleAction = (action, data) => {
            switch (action) {
                case 'acknowledgeAlert':
                    if (data.alertId) {
                        this.perfMon.acknowledgeAlert(data.alertId);
                    }
                    break;
                case 'clearAlerts':
                    this.perfMon.clearAlerts();
                    break;
                case 'getPerformanceReport':
                    return this.perfMon.exportMetrics('json');
                case 'getPrometheusMetrics':
                    return this.perfMon.getPrometheusMetrics();
            }
        };
    }

    trackCommand(name, duration, metadata = {}) {
        if (this.perfMon) {
            this.perfMon.trackCommandExecution(name, duration, metadata);
        }
    }

    trackMessage(duration, channelType, success = true) {
        if (this.perfMon) {
            this.perfMon.trackMessageProcessing(duration, channelType, success);
        }
    }

    trackDatabaseQuery(type, duration, success = true) {
        if (this.perfMon) {
            this.perfMon.trackDatabaseQuery(type, duration, success);
        }
    }

    trackWebSocket(latency, connectionId) {
        if (this.perfMon) {
            this.perfMon.trackWebSocketLatency(latency, connectionId);
        }
    }

    updatePoolMetrics(metrics) {
        if (this.perfMon) {
            this.perfMon.updateConnectionPoolMetrics(metrics);
        }
    }

    async getFullReport() {
        return {
            timestamp: Date.now(),
            performance: this.perfMon?.getMetrics() || {},
            detailed: this.perfMon?.getDetailedMetrics() || {},
            dashboard: this.dashboard?.isRunning ? {
                clients: this.dashboard.clients.size,
                port: this.dashboard.port
            } : null
        };
    }

    shutdown() {
        if (this.perfMon) {
            this.perfMon.shutdown();
        }
        if (this.dashboard) {
            this.dashboard.stop();
        }
    }
}

const monitoringIntegration = new MonitoringIntegration();

export default monitoringIntegration;
export { MonitoringIntegration };
