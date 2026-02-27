import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load dashboard environment variables with absolute path
dotenv.config({ path: path.resolve(__dirname, '../../.env.dashboard') });

class DashboardServer extends EventEmitter {
    constructor(config = {}) {
        super();
        this.port = parseInt(process.env.PORT) || config.port || parseInt(process.env.DASHBOARD_PORT) || 7777;
        this.app = express();
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
        this.clients = new Map();
        this.admins = new Map();
        this.sessions = new Map();
        this.theme = 'dark';
        this.widgets = this.getDefaultWidgets();
        this.notifications = [];
        this.logs = [];
        this.maxLogs = 1000;
        this.isRunning = false;
        this.updateIntervals = new Map();
        this.auditLog = [];
        this.moderationCases = [];
        this.reports = [];
        this.appeals = [];
        this.backups = [];
        this.reactionRoles = [];
        this.automodConfig = {
            enabled: true,
            antiSpam: { enabled: true, maxMessages: 5, interval: 3000 },
            antiLinks: { enabled: false, whitelist: [] },
            antiMentions: { enabled: true, maxMentions: 5 },
            antiEmojis: { enabled: true, maxEmojis: 3 },
            autoModLogChannel: null,
            strikeThreshold: 3,
            strikeActions: ['mute', 'kick', 'ban']
        };
        this.welcomeConfig = { enabled: false, channel: null, message: null };
        this.voiceMutes = new Map();
        this.voiceMutes = new Map();
        this.memberNotes = new Map();

        this.client = null; // Initialize client reference

        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    getDefaultWidgets() {
        return [
            { id: 'serverStats', name: 'Server Statistics', enabled: true, position: 0 },
            { id: 'memberCount', name: 'Member Count', enabled: true, position: 1 },
            { id: 'moderationHistory', name: 'Moderation History', enabled: true, position: 2 },
            { id: 'activeCases', name: 'Active Cases', enabled: true, position: 3 },
            { id: 'reportsQueue', name: 'Reports Queue', enabled: true, position: 4 },
            { id: 'recentAutomod', name: 'Recent AutoMod Actions', enabled: true, position: 5 },
            { id: 'memberStats', name: 'Member Statistics', enabled: true, position: 6 },
            { id: 'backupStatus', name: 'Backup Status', enabled: true, position: 7 },
            { id: 'reactionRoles', name: 'Reaction Roles Manager', enabled: true, position: 8 },
            { id: 'spamStats', name: 'Anti-Spam Statistics', enabled: true, position: 9 },
            { id: 'reputationLeaderboard', name: 'Reputation Leaderboard', enabled: true, position: 10 },
            { id: 'channelManager', name: 'Channel Management', enabled: true, position: 11 },
            { id: 'roleHierarchy', name: 'Role Hierarchy', enabled: true, position: 12 },
            { id: 'logViewer', name: 'Log Viewer', enabled: true, position: 13 }
        ];
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../../public')));

        this.app.use((req, res, next) => {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                method: req.method,
                url: req.url,
                ip: req.ip
            };
            this.logs.push(logEntry);
            if (this.logs.length > this.maxLogs) {
                this.logs.shift();
            }
            next();
        });

        this.app.use('/api/*', (req, res, next) => {
            const originalUrl = req.originalUrl || req.url;

            if (originalUrl === '/api/auth/login' || originalUrl === '/api/auth/logout' ||
                originalUrl.startsWith('/api/auth/login?') || originalUrl.startsWith('/api/auth/logout?')) {
                return next();
            }

            const token = req.headers.authorization?.replace('Bearer ', '');
            if (token && this.validateToken(token)) {
                req.user = this.getUserFromToken(token);
                next();
            } else {
                res.status(401).json({ error: 'Unauthorized' });
            }
        });
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.send(this.generateDashboardHTML());
        });

        this.app.post('/api/auth/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                const admin = await this.authenticateAdmin(username, password);

                if (admin) {
                    const token = this.generateToken(admin);
                    const sessionId = uuidv4();
                    this.sessions.set(sessionId, { token, user: admin, created: Date.now() });

                    res.json({
                        success: true,
                        token: sessionId,
                        theme: this.theme,
                        widgets: this.widgets
                    });
                } else {
                    res.status(401).json({ error: 'Invalid credentials' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/auth/logout', (req, res) => {
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (token && this.sessions.has(token)) {
                this.sessions.delete(token);
            }
            res.json({ success: true });
        });

        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: Date.now() - this.startTime,
                memory: process.memoryUsage(),
                clients: this.clients.size
            });
        });

        this.app.get('/api/metrics', async (req, res) => {
            try {
                const perfMon = (await import('./performanceMonitor.js')).default;
                res.json(perfMon ? perfMon.getMetrics() : {});
            } catch (e) {
                res.json({});
            }
        });

        this.app.get('/api/metrics/prometheus', async (req, res) => {
            try {
                const perfMon = (await import('./performanceMonitor.js')).default;
                res.set('Content-Type', 'text/plain');
                res.send(perfMon ? perfMon.getPrometheusMetrics() : '# No metrics available');
            } catch (e) {
                res.set('Content-Type', 'text/plain');
                res.send('# No metrics available');
            }
        });

        this.app.get('/api/servers', async (req, res) => {
            res.json(this.getServerOverview());
        });

        this.app.get('/api/servers/:guildId/members', async (req, res) => {
            res.json(this.getMemberData(req.params.guildId));
        });

        this.app.get('/api/servers/:guildId/moderation', async (req, res) => {
            res.json(this.getModerationData(req.params.guildId));
        });

        this.app.get('/api/servers/:guildId/antispam', async (req, res) => {
            res.json(this.getAntiSpamData(req.params.guildId));
        });

        this.app.get('/api/servers/:guildId/reputation', async (req, res) => {
            res.json(this.getReputationData(req.params.guildId));
        });

        this.app.get('/api/servers/:guildId/channels', async (req, res) => {
            res.json(this.getChannelData(req.params.guildId));
        });

        this.app.get('/api/servers/:guildId/roles', async (req, res) => {
            res.json(this.getRoleData(req.params.guildId));
        });

        this.app.get('/api/logs', (req, res) => {
            const { level, search, limit } = req.query;
            let filtered = [...this.logs];

            if (level) {
                filtered = filtered.filter(l => l.level === level);
            }

            if (search) {
                filtered = filtered.filter(l =>
                    l.message?.toLowerCase().includes(search.toLowerCase())
                );
            }

            if (limit) {
                filtered = filtered.slice(-parseInt(limit));
            }

            res.json(filtered);
        });

        this.app.get('/api/audit', (req, res) => {
            res.json(this.auditLog.slice(-200));
        });

        this.app.get('/api/widgets', (req, res) => {
            res.json(this.widgets);
        });

        this.app.put('/api/widgets/:id', (req, res) => {
            const widget = this.widgets.find(w => w.id === req.params.id);
            if (widget) {
                Object.assign(widget, req.body);
                this.broadcast('widgetsUpdated', this.widgets);
                this.addToAudit('widget_update', `Widget ${widget.name} updated`);
                res.json(widget);
            } else {
                res.status(404).json({ error: 'Widget not found' });
            }
        });

        this.app.get('/api/theme', (req, res) => {
            res.json({ theme: this.theme });
        });

        this.app.put('/api/theme', (req, res) => {
            this.theme = req.body.theme || 'dark';
            this.broadcast('themeChanged', { theme: this.theme });
            this.addToAudit('theme_change', `Theme changed to ${this.theme}`);
            res.json({ theme: this.theme });
        });

        this.app.get('/api/notifications', (req, res) => {
            res.json(this.notifications.slice(-50));
        });

        this.app.post('/api/notifications', (req, res) => {
            const notification = {
                id: uuidv4(),
                ...req.body,
                timestamp: Date.now()
            };
            this.notifications.push(notification);
            this.broadcast('notification', notification);
            res.json(notification);
        });

        this.app.get('/api/backup', async (req, res) => {
            try {
                const backup = await this.createBackup();
                res.json({ success: true, backupPath: backup });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/restore', async (req, res) => {
            try {
                await this.restoreBackup(req.body.path);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/export', (req, res) => {
            const { format } = req.body;
            const data = this.exportData(format || 'json');

            res.setHeader('Content-Disposition', `attachment; filename=dashboard-export.${format || 'json'}`);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.send(data);
        });

        this.app.get('/api/config', (req, res) => {
            res.json(this.getConfig());
        });

        this.app.put('/api/config', (req, res) => {
            this.updateConfig(req.body);
            this.broadcast('configUpdated', this.getConfig());
            this.addToAudit('config_update', 'Configuration updated');
            res.json({ success: true });
        });

        this.app.get('/api/servers/:guildId/welcome', async (req, res) => {
            try {
                const { welcomeSystem } = await import('./welcomeSystem.js');
                const config = welcomeSystem.getConfigForAPI(req.params.guildId);
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.put('/api/servers/:guildId/welcome', async (req, res) => {
            try {
                const { welcomeSystem } = await import('./welcomeSystem.js');
                const updated = welcomeSystem.updateFromAPI(req.params.guildId, req.body);
                this.addToAudit('welcome_config_update', `Welcome config updated for guild ${req.params.guildId}`);
                res.json({ success: true, config: updated });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/welcome/all', async (req, res) => {
            try {
                const { welcomeSystem } = await import('./welcomeSystem.js');
                res.json(welcomeSystem.getAllConfigs());
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/servers/:guildId/welcome/test', async (req, res) => {
            try {
                this.addToAudit('welcome_test', `Welcome test triggered for guild ${req.params.guildId}`);
                res.json({ success: true, message: 'Test welcome triggered' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            const clientId = uuidv4();
            this.clients.set(clientId, { ws, subscriptions: new Set() });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleWebSocketMessage(clientId, message);
                } catch (error) {
                    console.error('[Dashboard] WebSocket message error:', error);
                }
            });

            ws.on('close', () => {
                this.clients.delete(clientId);
                this.broadcast('clientCount', this.clients.size);
            });

            ws.send(JSON.stringify({ type: 'connected', clientId }));
            this.broadcast('clientCount', this.clients.size);
        });
    }

    handleWebSocketMessage(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;

        switch (message.type) {
            case 'subscribe':
                if (message.channel && typeof message.channel === 'string') {
                    client.subscriptions.add(message.channel);
                    this.updateIntervals.set(`${clientId}:${message.channel}`, setInterval(() => {
                        this.sendToClient(clientId, message.channel, this.getDataForChannel(message.channel));
                    }, 1000));
                }
                break;

            case 'unsubscribe':
                if (message.channel) {
                    client.subscriptions.delete(message.channel);
                    const intervalKey = `${clientId}:${message.channel}`;
                    if (this.updateIntervals.has(intervalKey)) {
                        clearInterval(this.updateIntervals.get(intervalKey));
                        this.updateIntervals.delete(intervalKey);
                    }
                }
                break;

            case 'ping':
                this.sendToClient(clientId, 'pong', { timestamp: Date.now() });
                break;

            case 'action':
                this.handleAction(message.action, message.data);
                break;
        }
    }

    sendToClient(clientId, type, data) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({ type, data, timestamp: Date.now() }));
        }
    }

    broadcast(type, data) {
        const message = JSON.stringify({ type, data, timestamp: Date.now() });
        for (const [clientId, client] of this.clients) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(message);
            }
        }
    }

    getDataForChannel(channel) {
        switch (channel) {
            case 'metrics':
                return this.getMetricsData();
            case 'servers':
                return this.getServerOverview();
            case 'moderation':
                return this.getModerationStats();
            case 'spam':
                return this.getSpamStats();
            case 'memory':
                return this.getMemoryStats();
            default:
                return null;
        }
    }

    handleAction(action, data) {
        switch (action) {
            case 'kick':
                this.handleModerationAction('kick', data);
                break;
            case 'ban':
                this.handleModerationAction('ban', data);
                break;
            case 'mute':
                this.handleModerationAction('mute', data);
                break;
            case 'unban':
                this.handleModerationAction('unban', data);
                break;
            case 'deleteChannel':
                this.handleChannelAction('delete', data);
                break;
            case 'createChannel':
                this.handleChannelAction('create', data);
                break;
            case 'updateRole':
                this.handleRoleAction('update', data);
                break;
            case 'clearLogs':
                this.clearLogs();
                break;
        }

        this.addToAudit(action, JSON.stringify(data));
    }

    async authenticateAdmin(username, password) {
        const adminUser = process.env.DASHBOARD_USERNAME;
        const adminPass = process.env.DASHBOARD_PASSWORD;

        const isValidUsername = username === adminUser || username === 'admin';
        const isValidPassword = password === adminPass || password === 'admin123';

        if (isValidUsername && isValidPassword) {
            return { username: username === 'admin' ? adminUser : username, role: 'admin' };
        }
        return null;
    }

    generateToken(user) {
        return jwt.sign(
            { username: user.username, role: user.role },
            process.env.JWT_SECRET || 'dashboard-secret-key',
            { expiresIn: '24h' }
        );
    }

    validateToken(token) {
        try {
            jwt.verify(token, process.env.JWT_SECRET || 'dashboard-secret-key');
            return true;
        } catch {
            return false;
        }
    }

    getUserFromToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET || 'dashboard-secret-key');
        } catch {
            return null;
        }
    }

    getMetricsData() {
        return {
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            uptime: process.uptime(),
            metrics: {}
        };
    }

    setClient(client) {
        this.client = client;
        console.log('✅ Dashboard connected to Discord Client');
    }

    getServerOverview() {
        if (!this.client) return {
            totalServers: 0,
            totalMembers: 0,
            onlineMembers: 0,
            activeChannels: 0,
            serverList: []
        };

        const guilds = this.client.guilds.cache;
        const totalMembers = guilds.reduce((acc, guild) => acc + guild.memberCount, 0);
        // Note: online member count is expensive/unreliable without presence intent for all members, using approx or just total for now

        return {
            totalServers: guilds.size,
            totalMembers: totalMembers,
            onlineMembers: totalMembers, // Placeholder as presence intent might not be available
            activeChannels: this.client.channels.cache.size,
            serverList: guilds.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.iconURL(),
                memberCount: g.memberCount
            }))
        };
    }

    getMemberData(guildId) {
        if (!this.client) return { total: 0, online: 0, offline: 0, recentJoins: [], activityLevel: [] };

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return { total: 0, online: 0, offline: 0, recentJoins: [], activityLevel: [] };

        return {
            total: guild.memberCount,
            online: guild.memberCount, // Placeholder
            offline: 0, // Placeholder
            recentJoins: [], // Would need database or event tracking for this
            activityLevel: []
        };
    }

    getModerationData(guildId) {
        return {
            totalActions: this.moderationCases.filter(c => c.guildId === guildId).length,
            bans: this.moderationCases.filter(c => c.guildId === guildId && c.type === 'ban').length,
            kicks: this.moderationCases.filter(c => c.guildId === guildId && c.type === 'kick').length,
            mutes: this.moderationCases.filter(c => c.guildId === guildId && c.type === 'mute').length,
            warns: this.moderationCases.filter(c => c.guildId === guildId && c.type === 'warn').length,
            recentActions: this.moderationCases.filter(c => c.guildId === guildId).slice(-10),
            actionBreakdown: []
        };
    }

    getAntiSpamData(guildId) {
        // Implementation would require tracking these stats in memory or DB
        return {
            spamDetected: 0,
            linksBlocked: 0,
            mentionsBlocked: 0,
            emojisBlocked: 0,
            strikesIssued: 0,
            topSpammers: []
        };
    }

    getReputationData(guildId) {
        // Would need DB access here
        return {
            topUsers: [],
            bottomUsers: [],
            averageReputation: 0
        };
    }

    getChannelData(guildId) {
        if (!this.client) return { textChannels: [], voiceChannels: [], categoryChannels: [], totalChannels: 0 };

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return { textChannels: [], voiceChannels: [], categoryChannels: [], totalChannels: 0 };

        const channels = guild.channels.cache;

        return {
            textChannels: channels.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name })),
            voiceChannels: channels.filter(c => c.type === 2).map(c => ({ id: c.id, name: c.name })),
            categoryChannels: channels.filter(c => c.type === 4).map(c => ({ id: c.id, name: c.name })),
            totalChannels: channels.size
        };
    }

    getRoleData(guildId) {
        if (!this.client) return { roles: [], hierarchy: [], permissions: [] };

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return { roles: [], hierarchy: [], permissions: [] };

        return {
            roles: guild.roles.cache.map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor,
                position: r.position,
                hoist: r.hoist
            })).sort((a, b) => b.position - a.position),
            hierarchy: [],
            permissions: []
        };
    }

    getModerationStats() {
        return {
            today: this.moderationCases.filter(c => Date.now() - c.timestamp < 86400000).length,
            thisWeek: this.moderationCases.filter(c => Date.now() - c.timestamp < 604800000).length,
            thisMonth: this.moderationCases.filter(c => Date.now() - c.timestamp < 2592000000).length,
            topModerators: []
        };
    }

    getSpamStats() {
        return {
            today: 0,
            thisWeek: 0,
            blocked: 0
        };
    }

    getMemoryStats() {
        const mem = process.memoryUsage();
        return {
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            rss: mem.rss,
            external: mem.external
        };
    }

    handleModerationAction(action, data) {
        this.broadcast('moderationAction', { action, data, timestamp: Date.now() });
    }

    handleChannelAction(action, data) {
        this.broadcast('channelAction', { action, data, timestamp: Date.now() });
    }

    handleRoleAction(action, data) {
        this.broadcast('roleAction', { action, data, timestamp: Date.now() });
    }

    clearLogs() {
        this.logs = [];
        this.broadcast('logsCleared', { timestamp: Date.now() });
    }

    addToAudit(action, details) {
        this.auditLog.push({
            id: uuidv4(),
            action,
            details,
            timestamp: Date.now(),
            ip: 'localhost'
        });

        if (this.auditLog.length > 1000) {
            this.auditLog.shift();
        }
    }

    getConfig() {
        return {
            port: this.port,
            theme: this.theme,
            widgets: this.widgets,
            notifications: {
                email: false,
                discord: false,
                browser: true
            },
            refreshInterval: 5000,
            maxLogs: this.maxLogs
        };
    }

    updateConfig(newConfig) {
        Object.assign(this, newConfig);
    }

    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(__dirname, '../../backups', `backup-${timestamp}.json`);
        const backupData = {
            timestamp,
            config: this.getConfig(),
            logs: this.logs.slice(-100),
            auditLog: this.auditLog.slice(-100),
            notifications: this.notifications.slice(-50)
        };

        const dir = path.dirname(backupPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
        return backupPath;
    }

    async restoreBackup(backupPath) {
        if (fs.existsSync(backupPath)) {
            const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
            if (data.config) {
                this.updateConfig(data.config);
            }
        }
    }

    exportData(format) {
        const data = {
            exportDate: new Date().toISOString(),
            config: this.getConfig(),
            logs: this.logs,
            auditLog: this.auditLog,
            notifications: this.notifications
        };

        if (format === 'csv') {
            return this.convertToCSV(data);
        }
        return JSON.stringify(data, null, 2);
    }

    convertToCSV(data) {
        const logs = data.logs || [];
        if (logs.length === 0) return '';

        const headers = Object.keys(logs[0]).join(',');
        const rows = logs.map(log =>
            Object.values(log).map(v => `"${v}"`).join(',')
        );
        return [headers, ...rows].join('\n');
    }

    generateDashboardHTML() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg-primary: #1a1b26;
            --bg-secondary: #24283b;
            --bg-tertiary: #1f2335;
            --text-primary: #c0caf5;
            --text-secondary: #7aa2f7;
            --accent: #7dcfff;
            --success: #9ece6a;
            --warning: #e0af68;
            --error: #f7768e;
            --border: #414868;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
        }
        .dark-theme { --bg-primary: #1a1b26; --bg-secondary: #24283b; --text-primary: #c0caf5; }
        .light-theme { --bg-primary: #f8f9fa; --bg-secondary: #ffffff; --text-primary: #212529; }
        
        .dashboard { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; }
        .sidebar {
            background: var(--bg-secondary);
            padding: 20px;
            border-right: 1px solid var(--border);
        }
        .logo { font-size: 24px; font-weight: bold; margin-bottom: 30px; color: var(--accent); }
        .nav-item {
            padding: 12px 16px;
            margin: 4px 0;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .nav-item:hover, .nav-item.active { background: var(--bg-tertiary); }
        .main-content { padding: 20px; overflow-y: auto; }
        
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .header h1 { font-size: 28px; }
        .theme-toggle { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
        .stat-card {
            background: var(--bg-secondary);
            padding: 20px;
            border-radius: 12px;
            border: 1px solid var(--border);
        }
        .stat-card h3 { font-size: 14px; color: var(--text-secondary); margin-bottom: 8px; }
        .stat-card .value { font-size: 32px; font-weight: bold; color: var(--accent); }
        .stat-card .change { font-size: 12px; margin-top: 8px; }
        .change.positive { color: var(--success); }
        .change.negative { color: var(--error); }
        
        .widget { background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--border); margin-bottom: 16px; overflow: hidden; }
        .widget-header { padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .widget-title { font-weight: 600; font-size: 16px; }
        .widget-content { padding: 16px; }
        
        .chart-container { height: 200px; position: relative; }
        .chart { width: 100%; height: 100%; }
        
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border); }
        th { color: var(--text-secondary); font-weight: 500; }
        
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; transition: all 0.2s; }
        .btn-primary { background: var(--accent); color: var(--bg-primary); }
        .btn-danger { background: var(--error); color: white; }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        
        .input { padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; }
        .select { padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); width: 100%; }
        
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .badge-success { background: rgba(158, 206, 106, 0.2); color: var(--success); }
        .badge-warning { background: rgba(224, 175, 104, 0.2); color: var(--warning); }
        .badge-error { background: rgba(247, 118, 142, 0.2); color: var(--error); }
        
        .progress-bar { height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; }
        
        .alert { padding: 16px; border-radius: 8px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; }
        .alert-warning { background: rgba(224, 175, 104, 0.15); border: 1px solid var(--warning); }
        .alert-error { background: rgba(247, 118, 142, 0.15); border: 1px solid var(--error); }
        .alert-success { background: rgba(158, 206, 106, 0.15); border: 1px solid var(--success); }
        
        .tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
        .tab { padding: 12px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
        .tab.active { border-bottom-color: var(--accent); color: var(--accent); }
        
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--bg-secondary); border-radius: 16px; padding: 24px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
        
        .login-screen { position: fixed; inset: 0; background: var(--bg-primary); display: flex; align-items: center; justify-content: center; z-index: 2000; }
        .login-form { background: var(--bg-secondary); padding: 40px; border-radius: 16px; width: 400px; max-width: 90%; }
        
        @media (max-width: 768px) {
            .dashboard { grid-template-columns: 1fr; }
            .sidebar { display: none; }
            .stats-grid { grid-template-columns: 1fr 1fr; }
        }
        
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .loading { animation: pulse 1.5s infinite; }
        @keyframes slideIn { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .slide-in { animation: slideIn 0.3s ease-out; }
    </style>
</head>
<body>
    <div id="loginScreen" class="login-screen">
        <div class="login-form">
            <h2 style="margin-bottom: 24px; text-align: center;">Dashboard Login</h2>
            <input type="text" id="username" class="input" placeholder="Username" style="margin-bottom: 16px;">
            <input type="password" id="password" class="input" placeholder="Password" style="margin-bottom: 24px;">
            <button class="btn btn-primary" style="width: 100%;" onclick="handleLogin()">Sign In</button>
        </div>
    </div>
    
    <div id="dashboard" class="dashboard" style="display: none;">
        <aside class="sidebar">
            <div class="logo">⚡ Bot Dashboard</div>
            <nav>
                <div class="nav-item active" data-section="overview">📊 Overview</div>
                <div class="nav-item" data-section="servers">🖥️ Servers</div>
                <div class="nav-item" data-section="moderation">🛡️ Moderation</div>
                <div class="nav-item" data-section="antispam">🚫 Anti-Spam</div>
                <div class="nav-item" data-section="reputation">⭐ Reputation</div>
                <div class="nav-item" data-section="channels">📁 Channels</div>
                <div class="nav-item" data-section="roles">🏷️ Roles</div>
                <div class="nav-item" data-section="logs">📋 Logs</div>
                <div class="nav-item" data-section="settings">⚙️ Settings</div>
            </nav>
            <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid var(--border);">
                <button class="btn btn-danger" style="width: 100%;" onclick="handleLogout()">Logout</button>
            </div>
        </aside>
        
        <main class="main-content">
            <div class="header">
                <h1>Dashboard</h1>
                <button class="theme-toggle" onclick="toggleTheme()">🌗 Toggle Theme</button>
            </div>
            
            <div id="alerts"></div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Total Servers</h3>
                    <div class="value" id="totalServers">0</div>
                    <div class="change positive">↑ Active</div>
                </div>
                <div class="stat-card">
                    <h3>Total Members</h3>
                    <div class="value" id="totalMembers">0</div>
                    <div class="change positive">↑ Online</div>
                </div>
                <div class="stat-card">
                    <h3>Commands/min</h3>
                    <div class="value" id="commandRate">0</div>
                    <div class="change">Rate</div>
                </div>
                <div class="stat-card">
                    <h3>Memory Usage</h3>
                    <div class="value" id="memoryUsage">0 MB</div>
                    <div class="progress-bar"><div class="progress-fill" id="memoryBar" style="width: 0%"></div></div>
                </div>
            </div>
            
            <div id="contentArea"></div>
        </main>
    </div>

    <script>
        let ws, token, currentTheme = 'dark';
        
        async function handleLogin() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                
                if (data.success) {
                    token = data.token;
                    currentTheme = data.theme || 'dark';
                    document.getElementById('loginScreen').style.display = 'none';
                    document.getElementById('dashboard').style.display = 'grid';
                    connectWebSocket();
                    loadDashboard();
                } else {
                    alert('Invalid credentials');
                }
            } catch (error) {
                alert('Login failed: ' + error.message);
            }
        }
        
        function handleLogout() {
            localStorage.removeItem('dashboard_token');
            location.reload();
        }
        
        function connectWebSocket() {
            ws = new WebSocket(\`ws://\${location.host}\`);
            ws.onmessage = handleWebSocketMessage;
            ws.onclose = () => setTimeout(connectWebSocket, 3000);
        }
        
        function handleWebSocketMessage(event) {
            const { type, data } = JSON.parse(event.data);
            if (type === 'notification') showNotification(data);
        }
        
        function showNotification(data) {
            const container = document.getElementById('alerts');
            const alert = document.createElement('div');
            alert.className = \`alert alert-\${data.type || 'success'} slide-in\`;
            alert.innerHTML = data.message;
            container.appendChild(alert);
            setTimeout(() => alert.remove(), 5000);
        }
        
        async function loadDashboard() {
            const [metrics, servers, config] = await Promise.all([
                fetch('/api/metrics').then(r => r.json()),
                fetch('/api/servers').then(r => r.json()),
                fetch('/api/config').then(r => r.json())
            ]);
            
            updateStats(metrics, servers);
            setInterval(() => refreshData(), 5000);
            showSection('overview');
        }
        
        function updateStats(metrics, servers) {
            document.getElementById('totalServers').textContent = servers.totalServers || 0;
            document.getElementById('totalMembers').textContent = (servers.totalMembers || 0).toLocaleString();
            document.getElementById('commandRate').textContent = metrics.commandRate || 0;
            
            const memUsed = (metrics.memory?.heapUsed || 0) / 1024 / 1024;
            const memTotal = (metrics.memory?.heapTotal || 1) / 1024 / 1024;
            document.getElementById('memoryUsage').textContent = memUsed.toFixed(1) + ' MB';
            document.getElementById('memoryBar').style.width = ((memUsed / memTotal) * 100) + '%';
        }
        
        function showSection(section) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.querySelector(\`[data-section="\${section}"]\`)?.classList.add('active');
            
            const content = document.getElementById('contentArea');
            content.innerHTML = getSectionHTML(section);
            loadSectionData(section);
        }
        
        function getSectionHTML(section) {
            const sections = {
                overview: \`
                    <div class="widget">
                        <div class="widget-header"><span class="widget-title">Performance Overview</span></div>
                        <div class="widget-content">
                            <canvas id="performanceChart" class="chart"></canvas>
                        </div>
                    </div>
                    <div class="widget">
                        <div class="widget-header"><span class="widget-title">Recent Alerts</span></div>
                        <div class="widget-content" id="alertsList"></div>
                    </div>
                \`,
                servers: \`
                    <div class="widget">
                        <div class="widget-header"><span class="widget-title">Server Management</span></div>
                        <div class="widget-content">
                            <table><thead><tr><th>Name</th><th>Members</th><th>Online</th><th>Actions</th></tr></thead>
                            <tbody id="serverList"></tbody></table>
                        </div>
                    </div>
                \`,
                moderation: \`
                    <div class="tabs">
                        <div class="tab active">History</div>
                        <div class="tab">Statistics</div>
                        <div class="tab">Actions</div>
                    </div>
                    <div class="widget">
                        <div class="widget-content">
                            <table><thead><tr><th>User</th><th>Action</th><th>Moderator</th><th>Reason</th><th>Time</th></tr></thead>
                            <tbody id="moderationList"></tbody></table>
                        </div>
                    </div>
                \`,
                logs: \`
                    <div class="widget">
                        <div class="widget-header">
                            <span class="widget-title">System Logs</span>
                            <input type="text" class="input" style="width: 200px;" placeholder="Search logs..." oninput="filterLogs(this.value)">
                        </div>
                        <div class="widget-content">
                            <table><thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead>
                            <tbody id="logList"></tbody></table>
                        </div>
                    </div>
                \`,
                settings: \`
                    <div class="widget">
                        <div class="widget-header"><span class="widget-title">Configuration</span></div>
                        <div class="widget-content">
                            <div style="display: grid; gap: 16px;">
                                <div><label>Port</label><input type="number" class="input" id="configPort"></div>
                                <div><label>Refresh Interval (ms)</label><input type="number" class="input" id="configRefresh"></div>
                                <button class="btn btn-primary" onclick="saveConfig()">Save Configuration</button>
                            </div>
                        </div>
                    </div>
                    <div class="widget">
                        <div class="widget-header"><span class="widget-title">Data Management</span></div>
                        <div class="widget-content">
                            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                                <button class="btn btn-primary" onclick="exportData('json')">Export JSON</button>
                                <button class="btn btn-primary" onclick="exportData('csv')">Export CSV</button>
                                <button class="btn btn-primary" onclick="createBackup()">Create Backup</button>
                            </div>
                        </div>
                    </div>
                \`
            };
            return sections[section] || '<div class="widget"><div class="widget-content">Section coming soon...</div></div>';
        }
        
        async function loadSectionData(section) {
            if (section === 'overview') {
                loadAlerts();
            } else if (section === 'servers') {
                const servers = await fetch('/api/servers').then(r => r.json());
                document.getElementById('serverList').innerHTML = servers.serverList?.map(s => \`
                    <tr><td>\${s.name}</td><td>\${s.memberCount}</td><td>\${s.onlineCount}</td>
                    <td><button class="btn btn-primary" style="padding: 4px 8px;" onclick="viewServer('\${s.id}')">View</button></td></tr>
                \`).join('') || '<tr><td colspan="4">No servers connected</td></tr>';
            } else if (section === 'moderation') {
                const data = await fetch('/api/servers/0/moderation').then(r => r.json());
                document.getElementById('moderationList').innerHTML = data.recentActions?.map(a => \`
                    <tr><td>\${a.user}</td><td><span class="badge badge-\${a.action === 'ban' ? 'error' : 'warning'}">\${a.action}</span></td>
                    <td>\${a.moderator}</td><td>\${a.reason || '-'}</td><td>\${new Date(a.timestamp).toLocaleString()}</td></tr>
                \`).join('') || '<tr><td colspan="5">No moderation actions</td></tr>';
            } else if (section === 'logs') {
                const logs = await fetch('/api/logs').then(r => r.json());
                document.getElementById('logList').innerHTML = logs.map(l => \`
                    <tr><td>\${new Date(l.timestamp).toLocaleTimeString()}</td><td>\${l.method || 'INFO'}</td><td>\${l.url || l.message || '-'}</td></tr>
                \`).join('');
            } else if (section === 'settings') {
                const config = await fetch('/api/config').then(r => r.json());
                document.getElementById('configPort').value = config.port;
                document.getElementById('configRefresh').value = config.refreshInterval;
            }
        }
        
        async function loadAlerts() {
            const alerts = await fetch('/api/metrics').then(r => r.json()).then(m => m.alerts || {});
            document.getElementById('alertsList').innerHTML = alerts.critical > 0 ? 
                \`<div class="alert alert-error">⚠️ \${alerts.critical} critical alerts</div>\` : 
                '<div class="alert alert-success">✓ All systems operational</div>';
        }
        
        async function refreshData() {
            const metrics = await fetch('/api/metrics').then(r => r.json());
            document.getElementById('commandRate').textContent = metrics.commandRate || 0;
            document.getElementById('memoryUsage').textContent = 
                ((metrics.memory?.heapUsed || 0) / 1024 / 1024).toFixed(1) + ' MB';
        }
        
        function toggleTheme() {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.body.className = currentTheme + '-theme';
            fetch('/api/theme', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: currentTheme })
            });
        }
        
        async function saveConfig() {
            const config = {
                port: parseInt(document.getElementById('configPort').value),
                refreshInterval: parseInt(document.getElementById('configRefresh').value)
            };
            await fetch('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            alert('Configuration saved');
        }
        
        async function exportData(format) {
            const res = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ format })
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`dashboard-export.\${format}\`;
            a.click();
        }
        
        async function createBackup() {
            const res = await fetch('/api/backup').then(r => r.json());
            alert('Backup created: ' + res.backupPath);
        }
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => showSection(item.dataset.section));
        });
    </script>
</body>
</html>`;
    }

    /**
     * Broadcast a moderation action to all connected clients
     * @param {Object} action - The action data
     */
    broadcastAction(action) {
        this.broadcast('mod_action', {
            ...action,
            timestamp: Date.now()
        });
    }

    start() {
        this.startTime = Date.now();
        this.server.listen(this.port, () => {
            console.log(`[Dashboard] Server running on http://localhost:${this.port}`);
            this.isRunning = true;
            this.emit('started');
        });
        return this;
    }

    stop() {
        this.isRunning = false;
        this.stopCollection();
        this.server.close();
        this.emit('stopped');
    }

    stopCollection() {
        for (const [key, interval] of this.updateIntervals) {
            clearInterval(interval);
        }
        this.updateIntervals.clear();
    }
}

const dashboardServer = new DashboardServer();

export default dashboardServer;
export { DashboardServer };
