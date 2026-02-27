const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ReportSystem {
    constructor() {
        this.reportsPath = path.join(__dirname, '../../data/reports.json');
        this.appealsPath = path.join(__dirname, '../../data/appeals.json');
    }

    async initialize() {
        try {
            await fs.mkdir(path.dirname(this.reportsPath), { recursive: true });
            await fs.mkdir(path.dirname(this.appealsPath), { recursive: true });
            
            const reportsData = await this.readJson(this.reportsPath);
            const appealsData = await this.readJson(this.appealsPath);
            
            if (!reportsData) {
                await this.writeJson(this.reportsPath, { reports: [], stats: this.getInitialStats() });
            }
            if (!appealsData) {
                await this.writeJson(this.appealsPath, { appeals: [], stats: this.getInitialAppealStats() });
            }
        } catch (error) {
            console.error('ReportSystem initialization error:', error);
        }
    }

    getInitialStats() {
        return {
            total: 0,
            pending: 0,
            resolved: 0,
            dismissed: 0,
            byReason: {},
            byReporter: {},
            averageResolutionTime: 0
        };
    }

    getInitialAppealStats() {
        return {
            total: 0,
            pending: 0,
            approved: 0,
            denied: 0,
            banAppeals: 0,
            muteAppeals: 0,
            averageReviewTime: 0
        };
    }

    async readJson(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    async writeJson(filePath, data) {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async createReport(reporterId, reportedUserId, reason, guildId, isAnonymous = false) {
        const data = await this.readJson(this.reportsPath);
        const report = {
            id: uuidv4(),
            reporterId,
            reporterAnonymous: isAnonymous,
            reportedUserId,
            reason,
            guildId,
            status: 'pending',
            createdAt: new Date().toISOString(),
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: null,
            priority: this.calculatePriority(reason),
            attachments: [],
            comments: []
        };

        data.reports.unshift(report);
        data.stats.total++;
        data.stats.pending++;
        
        if (!data.stats.byReason[reason]) {
            data.stats.byReason[reason] = 0;
        }
        data.stats.byReason[reason]++;

        if (!isAnonymous && !data.stats.byReporter[reporterId]) {
            data.stats.byReporter[reporterId] = 0;
        }
        if (!isAnonymous) {
            data.stats.byReporter[reporterId]++;
        }

        await this.writeJson(this.reportsPath, data);
        return report;
    }

    calculatePriority(reason) {
        const highPriority = ['harassment', 'spam', 'scam', 'illegal', 'threats'];
        const mediumPriority = ['rudeness', 'disruption', 'spam'];

        const lowerReason = reason.toLowerCase();
        if (highPriority.some(p => lowerReason.includes(p))) return 'high';
        if (mediumPriority.some(p => lowerReason.includes(p))) return 'medium';
        return 'low';
    }

    async getReports(guildId, options = {}) {
        const data = await this.readJson(this.reportsPath);
        let reports = data.reports.filter(r => r.guildId === guildId);

        if (options.status) {
            reports = reports.filter(r => r.status === options.status);
        }
        if (options.reportedUserId) {
            reports = reports.filter(r => r.reportedUserId === options.reportedUserId);
        }
        if (options.priority) {
            reports = reports.filter(r => r.priority === options.priority);
        }

        if (options.limit) {
            reports = reports.slice(0, options.limit);
        }

        return reports;
    }

    async resolveReport(reportId, moderatorId, resolution, note = '') {
        const data = await this.readJson(this.reportsPath);
        const reportIndex = data.reports.findIndex(r => r.id === reportId);

        if (reportIndex === -1) {
            throw new Error('Report not found');
        }

        const report = data.reports[reportIndex];
        const previousStatus = report.status;

        report.status = resolution;
        report.resolvedAt = new Date().toISOString();
        report.resolvedBy = moderatorId;
        report.resolutionNote = note;

        data.stats[previousStatus]--;
        data.stats[resolution]++;

        if (report.resolvedAt && report.createdAt) {
            const resolutionTime = new Date(report.resolvedAt) - new Date(report.createdAt);
            const totalResolved = data.stats.resolved + data.stats.dismissed;
            data.stats.averageResolutionTime = 
                ((data.stats.averageResolutionTime * (totalResolved - 1)) + resolutionTime) / totalResolved;
        }

        data.reports[reportIndex] = report;
        await this.writeJson(this.reportsPath, data);

        return report;
    }

    async addComment(reportId, userId, comment) {
        const data = await this.readJson(this.reportsPath);
        const report = data.reports.find(r => r.id === reportId);

        if (!report) {
            throw new Error('Report not found');
        }

        report.comments.push({
            userId,
            comment,
            timestamp: new Date().toISOString()
        });

        await this.writeJson(this.reportsPath, data);
        return report;
    }

    async getReportStats(guildId) {
        const data = await this.readJson(this.reportsPath);
        const guildReports = data.reports.filter(r => r.guildId === guildId);

        return {
            total: guildReports.length,
            pending: guildReports.filter(r => r.status === 'pending').length,
            resolved: guildReports.filter(r => r.status === 'resolved').length,
            dismissed: guildReports.filter(r => r.status === 'dismissed').length,
            byPriority: {
                high: guildReports.filter(r => r.priority === 'high').length,
                medium: guildReports.filter(r => r.priority === 'medium').length,
                low: guildReports.filter(r => r.priority === 'low').length
            },
            byReason: this.countByField(guildReports, 'reason'),
            recentActivity: this.getRecentActivity(guildReports)
        };
    }

    countByField(reports, field) {
        const counts = {};
        reports.forEach(r => {
            const value = r[field];
            counts[value] = (counts[value] || 0) + 1;
        });
        return counts;
    }

    getRecentActivity(reports, limit = 10) {
        return reports
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    }

    async createAppeal(userId, type, originalPunishmentId, reason, guildId) {
        const data = await this.readJson(this.appealsPath);
        const appeal = {
            id: uuidv4(),
            userId,
            type,
            originalPunishmentId,
            reason,
            guildId,
            status: 'pending',
            createdAt: new Date().toISOString(),
            reviewedAt: null,
            reviewedBy: null,
            reviewerNote: null,
            evidence: [],
            previousAppeals: []
        };

        const previousAppeals = data.appeals.filter(a => a.userId === userId && a.type === type);
        appeal.previousAppeals = previousAppeals.map(a => a.id);

        data.appeals.unshift(appeal);
        data.stats.total++;
        data.stats.pending++;
        if (type === 'ban') {
            data.stats.banAppeals++;
        } else if (type === 'mute') {
            data.stats.muteAppeals++;
        }

        await this.writeJson(this.appealsPath, data);
        return appeal;
    }

    async getAppeals(guildId, options = {}) {
        const data = await this.readJson(this.appealsPath);
        let appeals = data.appeals.filter(a => a.guildId === guildId);

        if (options.status) {
            appeals = appeals.filter(a => a.status === options.status);
        }
        if (options.type) {
            appeals = appeals.filter(a => a.type === options.type);
        }
        if (options.userId) {
            appeals = appeals.filter(a => a.userId === options.userId);
        }

        if (options.limit) {
            appeals = appeals.slice(0, options.limit);
        }

        return appeals;
    }

    async reviewAppeal(appealId, moderatorId, decision, note = '') {
        const data = await this.readJson(this.appealsPath);
        const appealIndex = data.appeals.findIndex(a => a.id === appealId);

        if (appealIndex === -1) {
            throw new Error('Appeal not found');
        }

        const appeal = data.appeals[appealIndex];
        const previousStatus = appeal.status;

        appeal.status = decision;
        appeal.reviewedAt = new Date().toISOString();
        appeal.reviewedBy = moderatorId;
        appeal.reviewerNote = note;

        data.stats[previousStatus]--;
        data.stats[decision]++;

        if (appeal.reviewedAt && appeal.createdAt) {
            const reviewTime = new Date(appeal.reviewedAt) - new Date(appeal.createdAt);
            const totalReviewed = data.stats.approved + data.stats.denied;
            data.stats.averageReviewTime = 
                ((data.stats.averageReviewTime * (totalReviewed - 1)) + reviewTime) / totalReviewed;
        }

        data.appeals[appealIndex] = appeal;
        await this.writeJson(this.appealsPath, data);

        return appeal;
    }

    async getAppealStats(guildId) {
        const data = await this.readJson(this.appealsPath);
        const guildAppeals = data.appeals.filter(a => a.guildId === guildId);

        return {
            total: guildAppeals.length,
            pending: guildAppeals.filter(a => a.status === 'pending').length,
            approved: guildAppeals.filter(a => a.status === 'approved').length,
            denied: guildAppeals.filter(a => a.status === 'denied').length,
            byType: {
                ban: guildAppeals.filter(a => a.type === 'ban').length,
                mute: guildAppeals.filter(a => a.type === 'mute').length
            },
            repeatAppeals: guildAppeals.filter(a => a.previousAppeals.length > 0).length,
            recentActivity: this.getRecentActivity(guildAppeals)
        };
    }

    async getDashboardData(guildId) {
        const [reports, appeals, reportStats, appealStats] = await Promise.all([
            this.getReports(guildId, { limit: 20 }),
            this.getAppeals(guildId, { limit: 20 }),
            this.getReportStats(guildId),
            this.getAppealStats(guildId)
        ]);

        return {
            reports: reports.filter(r => r.status === 'pending'),
            appeals: appeals.filter(a => a.status === 'pending'),
            reportStats,
            appealStats,
            recentReports: reportStats.recentActivity,
            recentAppeals: appealStats.recentActivity
        };
    }
}

module.exports = new ReportSystem();
