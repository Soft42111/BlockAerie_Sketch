import databaseManager from './database.js';

const REPUTATION_TIERS = {
    NEW: { min: -100, name: 'New', color: '#808080', icon: '🌱' },
    REGULAR: { min: -50, name: 'Regular', color: '#4CAF50', icon: '⭐' },
    TRUSTED: { min: 0, name: 'Trusted', color: '#2196F3', icon: '🔵' },
    VETERAN: { min: 100, name: 'Veteran', color: '#9C27B0', icon: '🟣' },
    LEGEND: { min: 500, name: 'Legend', color: '#FFD700', icon: '👑' }
};

const REPUTATION_THRESHOLDS = {
    VIEW_LEADERBOARD: -50,
    GIFT_REPUTATION: 50,
    DOWNVOTE: 0,
    SPECIAL_PERMISSIONS: 200,
    MODERATOR_NOMINATION: 100
};

const DECAY_SETTINGS = {
    enabled: true,
    decayRate: 0.01,
    decayInterval: 86400000,
    minScore: -100,
    decayThreshold: 30
};

const VOTE_COOLDOWN = 3600000;
const MAX_DAILY_VOTES = 10;

class ReputationSystem {
    constructor() {
        this.voteHistory = new Map();
        this.dailyVoteCounts = new Map();
        this.reputationCache = new Map();
        this.auditLog = [];
        this.decayTimers = new Map();
    }

    async initialize() {
        await this.initializeTables();
        this.startDecaySystem();
    }

    async initializeTables() {
        const db = databaseManager.db;
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS reputation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                voter_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                reason TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                source TEXT NOT NULL
            )
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS reputation_gifts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id TEXT NOT NULL,
                receiver_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS reputation_decay_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                old_score INTEGER NOT NULL,
                new_score INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS reputation_votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                voter_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                vote_type INTEGER NOT NULL,
                message_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(voter_id, target_id, message_id)
            )
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS weekly_leaderboard (
                user_id TEXT PRIMARY KEY,
                week_start DATETIME NOT NULL,
                score INTEGER DEFAULT 0,
                rank INTEGER
            )
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_reputation_history_user ON reputation_history(user_id)
        `);
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_reputation_history_timestamp ON reputation_history(timestamp)
        `);
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_reputation_votes_voter ON reputation_votes(voter_id)
        `);
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_reputation_votes_target ON reputation_votes(target_id)
        `);
    }

    async getUserReputation(userId) {
        if (this.reputationCache.has(userId)) {
            return this.reputationCache.get(userId);
        }

        const user = await databaseManager.usersGetById(userId);
        const repRecord = await databaseManager.userReputationGet(userId);

        const reputation = {
            score: user?.reputation_score || 0,
            tier: this.calculateTier(user?.reputation_score || 0),
            positiveVotes: repRecord?.positive_votes || 0,
            negativeVotes: repRecord?.negative_votes || 0,
            totalVotes: (repRecord?.positive_votes || 0) + (repRecord?.negative_votes || 0),
            lastActivity: user?.updated_at || null,
            joinDate: user?.join_date || null
        };

        this.reputationCache.set(userId, reputation);
        return reputation;
    }

    calculateTier(score) {
        if (score >= REPUTATION_TIERS.LEGEND.min) return REPUTATION_TIERS.LEGEND;
        if (score >= REPUTATION_TIERS.VETERAN.min) return REPUTATION_TIERS.VETERAN;
        if (score >= REPUTATION_TIERS.TRUSTED.min) return REPUTATION_TIERS.TRUSTED;
        if (score >= REPUTATION_TIERS.REGULAR.min) return REPUTATION_TIERS.REGULAR;
        return REPUTATION_TIERS.NEW;
    }

    getAllTiers() {
        return REPUTATION_TIERS;
    }

    async modifyReputation(userId, voterId, amount, reason = '', source = 'manual') {
        if (amount < -5 || amount > 5) {
            throw new Error('Reputation change must be between -5 and +5');
        }

        const lastVote = this.voteHistory.get(`${voterId}:${userId}`);
        if (lastVote && Date.now() - lastVote < VOTE_COOLDOWN) {
            throw new Error('Vote cooldown active. Please wait before voting again.');
        }

        const dailyVotes = this.dailyVoteCounts.get(voterId) || 0;
        if (dailyVotes >= MAX_DAILY_VOTES) {
            throw new Error('Daily vote limit reached. Try again tomorrow.');
        }

        await databaseManager.usersCreate(userId, 'Unknown');
        await databaseManager.userReputationCreate(userId);

        if (amount > 0) {
            await databaseManager.userReputationUpvote(userId);
        } else {
            await databaseManager.userReputationDownvote(userId);
        }

        await databaseManager.usersIncrementReputation(userId, amount);

        const historyEntry = {
            userId,
            voterId,
            amount,
            reason,
            timestamp: new Date().toISOString(),
            source
        };

        await this.addToHistory(historyEntry);

        this.voteHistory.set(`${voterId}:${userId}`, Date.now());
        this.dailyVoteCounts.set(voterId, dailyVotes + 1);

        this.auditLog.push({
            action: 'REPUTATION_MODIFY',
            ...historyEntry
        });

        this.reputationCache.delete(userId);

        const newRep = await this.getUserReputation(userId);
        return {
            success: true,
            newScore: newRep.score,
            tier: newRep.tier,
            change: amount
        };
    }

    async addToHistory(entry) {
        const stmt = databaseManager.prepareStatement(`
            INSERT INTO reputation_history (user_id, voter_id, amount, reason, source)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(entry.userId, entry.voterId, entry.amount, entry.reason, entry.source);
    }

    async giftReputation(senderId, receiverId, amount) {
        if (amount < 1 || amount > 10) {
            throw new Error('Gift amount must be between 1 and 10');
        }

        const senderRep = await this.getUserReputation(senderId);
        if (senderRep.score < amount) {
            throw new Error('Insufficient reputation to gift this amount');
        }

        await databaseManager.usersIncrementReputation(senderId, -amount);
        await databaseManager.usersIncrementReputation(receiverId, amount);

        const stmt = databaseManager.prepareStatement(`
            INSERT INTO reputation_gifts (sender_id, receiver_id, amount)
            VALUES (?, ?, ?)
        `);
        stmt.run(senderId, receiverId, amount);

        this.auditLog.push({
            action: 'REPUTATION_GIFT',
            senderId,
            receiverId,
            amount,
            timestamp: new Date().toISOString()
        });

        this.reputationCache.delete(senderId);
        this.reputationCache.delete(receiverId);

        return {
            success: true,
            gifted: amount,
            newBalance: senderRep.score - amount
        };
    }

    async getReputationHistory(userId, limit = 50) {
        const stmt = databaseManager.prepareStatement(`
            SELECT * FROM reputation_history
            WHERE user_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);
        return stmt.all(userId, limit);
    }

    async getVoteHistory(userId, limit = 50) {
        const stmt = databaseManager.prepareStatement(`
            SELECT * FROM reputation_votes
            WHERE target_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);
        return stmt.all(userId, limit);
    }

    async getWeeklyLeaderboard(limit = 10) {
        const stmt = databaseManager.prepareStatement(`
            SELECT rh.user_id, SUM(rh.amount) as weekly_score,
                   COUNT(*) as vote_count
            FROM reputation_history rh
            WHERE rh.timestamp >= datetime('now', '-7 days')
            GROUP BY rh.user_id
            ORDER BY weekly_score DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    async getMonthlyLeaderboard(limit = 10) {
        const stmt = databaseManager.prepareStatement(`
            SELECT rh.user_id, SUM(rh.amount) as monthly_score,
                   COUNT(*) as vote_count
            FROM reputation_history rh
            WHERE rh.timestamp >= datetime('now', '-30 days')
            GROUP BY rh.user_id
            ORDER BY monthly_score DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    async getAllTimeLeaderboard(limit = 10) {
        return await databaseManager.usersGetTopReputation(limit);
    }

    async applyReputationDecay() {
        if (!DECAY_SETTINGS.enabled) return;

        const users = await databaseManager.usersGetAll(1000, 0);

        for (const user of users) {
            if (user.reputation_score <= DECAY_SETTINGS.minScore) continue;
            if (user.reputation_score < DECAY_SETTINGS.decayThreshold) continue;

            const daysSinceActivity = user.updated_at
                ? (Date.now() - new Date(user.updated_at).getTime()) / 86400000
                : 0;

            if (daysSinceActivity < 7) continue;

            const oldScore = user.reputation_score;
            const decayAmount = Math.floor(user.reputation_score * DECAY_SETTINGS.decayRate);

            if (decayAmount < 1) continue;

            const newScore = Math.max(DECAY_SETTINGS.minScore, oldScore - decayAmount);

            await databaseManager.usersIncrementReputation(user.discord_id, -decayAmount);

            const stmt = databaseManager.prepareStatement(`
                INSERT INTO reputation_decay_log (user_id, old_score, new_score)
                VALUES (?, ?, ?)
            `);
            stmt.run(user.discord_id, oldScore, newScore);

            this.reputationCache.delete(user.discord_id);
        }
    }

    startDecaySystem() {
        if (this.decayTimers.has('decay')) {
            clearInterval(this.decayTimers.get('decay'));
        }

        const decayInterval = setInterval(() => {
            this.applyReputationDecay();
        }, DECAY_SETTINGS.decayInterval);

        this.decayTimers.set('decay', decayInterval);
    }

    checkPermission(userId, permission) {
        const rep = this.reputationCache.get(userId) || null;
        return rep ? rep.score >= REPUTATION_THRESHOLDS[permission] : false;
    }

    async getReputationStats(guildId) {
        const users = await databaseManager.usersGetAll(1000, 0);

        const stats = {
            totalUsers: users.length,
            averageReputation: 0,
            tierDistribution: {
                NEW: 0,
                REGULAR: 0,
                TRUSTED: 0,
                VETERAN: 0,
                LEGEND: 0
            },
            topUsers: [],
            bottomUsers: []
        };

        if (users.length === 0) return stats;

        let totalScore = 0;
        for (const user of users) {
            const tier = this.calculateTier(user.reputation_score);
            stats.tierDistribution[tier.name]++;
            totalScore += user.reputation_score;
        }

        stats.averageReputation = Math.round(totalScore / users.length);

        const sortedByScore = [...users].sort((a, b) => b.reputation_score - a.reputation_score);
        stats.topUsers = sortedByScore.slice(0, 5).map(u => ({
            userId: u.discord_id,
            score: u.reputation_score,
            username: u.username
        }));
        stats.bottomUsers = sortedByScore.slice(-5).reverse().map(u => ({
            userId: u.discord_id,
            score: u.reputation_score,
            username: u.username
        }));

        return stats;
    }

    async voteOnMessage(voterId, targetId, messageId, voteType) {
        if (voteType !== 1 && voteType !== -1) {
            throw new Error('Vote type must be 1 (upvote) or -1 (downvote)');
        }

        const stmt = databaseManager.prepareStatement(`
            INSERT OR REPLACE INTO reputation_votes (voter_id, target_id, vote_type, message_id)
            VALUES (?, ?, ?, ?)
        `);

        try {
            stmt.run(voterId, targetId, voteType, messageId);
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                throw new Error('You have already voted on this message');
            }
            throw error;
        }

        await this.modifyReputation(targetId, voterId, voteType, `Vote on message ${messageId}`, 'message_vote');

        return {
            success: true,
            voteType: voteType === 1 ? 'upvote' : 'downvote'
        };
    }

    getAuditLog(limit = 100) {
        return this.auditLog.slice(-limit);
    }

    clearAuditLog() {
        this.auditLog = [];
    }

    async resetDailyVotes() {
        this.dailyVoteCounts.clear();
    }

    async exportUserData(userId) {
        const rep = await this.getUserReputation(userId);
        const history = await this.getReputationHistory(userId);
        const votes = await this.getVoteHistory(userId);
        const gifts = await this.getGiftHistory(userId);

        return {
            reputation: rep,
            history,
            votes,
            gifts,
            exportDate: new Date().toISOString()
        };
    }

    async getGiftHistory(userId, limit = 50) {
        const stmt = databaseManager.prepareStatement(`
            SELECT * FROM reputation_gifts
            WHERE sender_id = ? OR receiver_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);
        return stmt.all(userId, userId, limit);
    }

    async removeReputation(userId, moderatorId, amount, reason = '') {
        if (amount < 1 || amount > 10) {
            throw new Error('Removal amount must be between 1 and 10');
        }

        await databaseManager.usersIncrementReputation(userId, -amount);

        this.auditLog.push({
            action: 'REPUTATION_REMOVE',
            userId,
            moderatorId,
            amount,
            reason,
            timestamp: new Date().toISOString()
        });

        this.reputationCache.delete(userId);

        const newRep = await this.getUserReputation(userId);
        return {
            success: true,
            newScore: newRep.score,
            removed: amount
        };
    }
}

const reputationSystem = new ReputationSystem();

export default reputationSystem;
export { ReputationSystem, REPUTATION_TIERS, REPUTATION_THRESHOLDS, DECAY_SETTINGS };
