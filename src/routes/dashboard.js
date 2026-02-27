const express = require('express');
const reportSystem = require('../utils/reportSystem');
const router = express.Router();

router.get('/dashboard/:guildId', async (req, res) => {
    try {
        const { guildId } = req.params;
        const data = await reportSystem.getDashboardData(guildId);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

router.get('/reports/:guildId', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { status, priority, limit } = req.query;
        const reports = await reportSystem.getReports(guildId, {
            status,
            priority,
            limit: limit ? parseInt(limit) : undefined
        });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

router.post('/reports', async (req, res) => {
    try {
        const { reporterId, reportedUserId, reason, guildId, isAnonymous } = req.body;
        const report = await reportSystem.createReport(
            reporterId,
            reportedUserId,
            reason,
            guildId,
            isAnonymous || false
        );
        res.status(201).json(report);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create report' });
    }
});

router.patch('/reports/:reportId/resolve', async (req, res) => {
    try {
        const { reportId } = req.params;
        const { moderatorId, resolution, note } = req.body;
        const report = await reportSystem.resolveReport(reportId, moderatorId, resolution, note);
        res.json(report);
    } catch (error) {
        if (error.message === 'Report not found') {
            return res.status(404).json({ error: 'Report not found' });
        }
        res.status(500).json({ error: 'Failed to resolve report' });
    }
});

router.post('/reports/:reportId/comments', async (req, res) => {
    try {
        const { reportId } = req.params;
        const { userId, comment } = req.body;
        const report = await reportSystem.addComment(reportId, userId, comment);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

router.get('/reports/:guildId/stats', async (req, res) => {
    try {
        const { guildId } = req.params;
        const stats = await reportSystem.getReportStats(guildId);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch report stats' });
    }
});

router.get('/appeals/:guildId', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { status, type, userId, limit } = req.query;
        const appeals = await reportSystem.getAppeals(guildId, {
            status,
            type,
            userId,
            limit: limit ? parseInt(limit) : undefined
        });
        res.json(appeals);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch appeals' });
    }
});

router.post('/appeals', async (req, res) => {
    try {
        const { userId, type, originalPunishmentId, reason, guildId } = req.body;
        const appeal = await reportSystem.createAppeal(
            userId,
            type,
            originalPunishmentId,
            reason,
            guildId
        );
        res.status(201).json(appeal);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create appeal' });
    }
});

router.patch('/appeals/:appealId/review', async (req, res) => {
    try {
        const { appealId } = req.params;
        const { moderatorId, decision, note } = req.body;
        const appeal = await reportSystem.reviewAppeal(appealId, moderatorId, decision, note);
        res.json(appeal);
    } catch (error) {
        if (error.message === 'Appeal not found') {
            return res.status(404).json({ error: 'Appeal not found' });
        }
        res.status(500).json({ error: 'Failed to review appeal' });
    }
});

router.get('/appeals/:guildId/stats', async (req, res) => {
    try {
        const { guildId } = req.params;
        const stats = await reportSystem.getAppealStats(guildId);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch appeal stats' });
    }
});

module.exports = router;
