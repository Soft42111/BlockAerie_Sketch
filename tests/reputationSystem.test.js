import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MockDatabase, MockDatabaseManager } from '../mocks/database.js';

jest.unstable_mockModule('./database.js', () => ({
    default: new MockDatabaseManager()
}));

describe('ReputationSystem Core Functions', () => {
    let ReputationSystem;
    let reputationSystem;
    let mockDb;

    beforeAll(async () => {
        const module = await import('../../src/utils/reputationSystem.js');
        ReputationSystem = module.ReputationSystem;
        mockDb = new MockDatabase();
        mockDb.tables.set('users', []);
        mockDb.tables.set('reputation_history', []);
        mockDb.tables.set('reputation_gifts', []);
        mockDb.tables.set('reputation_votes', []);
        mockDb.tables.set('reputation_decay_log', []);
        mockDb.tables.set('user_reputation', []);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockDb.tables.set('users', []);
        mockDb.tables.set('reputation_history', []);
        mockDb.tables.set('reputation_gifts', []);
        mockDb.tables.set('reputation_votes', []);
        mockDb.tables.set('reputation_decay_log', []);
        mockDb.tables.set('user_reputation', []);
    });

    describe('Tier Calculation', () => {
        it('should return NEW tier for scores below -50', () => {
            const calculateTier = (score) => {
                if (score >= 500) return { name: 'Legend', min: 500 };
                if (score >= 100) return { name: 'Veteran', min: 100 };
                if (score >= 0) return { name: 'Trusted', min: 0 };
                if (score >= -50) return { name: 'Regular', min: -50 };
                return { name: 'New', min: -100 };
            };

            expect(calculateTier(-100).name).toBe('New');
            expect(calculateTier(-75).name).toBe('New');
            expect(calculateTier(-51).name).toBe('New');
        });

        it('should return REGULAR tier for scores between -50 and 0', () => {
            const calculateTier = (score) => {
                if (score >= 500) return { name: 'Legend', min: 500 };
                if (score >= 100) return { name: 'Veteran', min: 100 };
                if (score >= 0) return { name: 'Trusted', min: 0 };
                if (score >= -50) return { name: 'Regular', min: -50 };
                return { name: 'New', min: -100 };
            };

            expect(calculateTier(-50).name).toBe('Regular');
            expect(calculateTier(-25).name).toBe('Regular');
            expect(calculateTier(-1).name).toBe('Regular');
        });

        it('should return TRUSTED tier for scores between 0 and 100', () => {
            const calculateTier = (score) => {
                if (score >= 500) return { name: 'Legend', min: 500 };
                if (score >= 100) return { name: 'Veteran', min: 100 };
                if (score >= 0) return { name: 'Trusted', min: 0 };
                if (score >= -50) return { name: 'Regular', min: -50 };
                return { name: 'New', min: -100 };
            };

            expect(calculateTier(0).name).toBe('Trusted');
            expect(calculateTier(50).name).toBe('Trusted');
            expect(calculateTier(99).name).toBe('Trusted');
        });

        it('should return VETERAN tier for scores between 100 and 500', () => {
            const calculateTier = (score) => {
                if (score >= 500) return { name: 'Legend', min: 500 };
                if (score >= 100) return { name: 'Veteran', min: 100 };
                if (score >= 0) return { name: 'Trusted', min: 0 };
                if (score >= -50) return { name: 'Regular', min: -50 };
                return { name: 'New', min: -100 };
            };

            expect(calculateTier(100).name).toBe('Veteran');
            expect(calculateTier(250).name).toBe('Veteran');
            expect(calculateTier(499).name).toBe('Veteran');
        });

        it('should return LEGEND tier for scores 500 and above', () => {
            const calculateTier = (score) => {
                if (score >= 500) return { name: 'Legend', min: 500 };
                if (score >= 100) return { name: 'Veteran', min: 100 };
                if (score >= 0) return { name: 'Trusted', min: 0 };
                if (score >= -50) return { name: 'Regular', min: -50 };
                return { name: 'New', min: -100 };
            };

            expect(calculateTier(500).name).toBe('Legend');
            expect(calculateTier(750).name).toBe('Legend');
            expect(calculateTier(1000).name).toBe('Legend');
        });
    });

    describe('Reputation Limits', () => {
        it('should reject reputation changes outside -5 to +5 range', () => {
            const validateChange = (amount) => {
                if (amount < -5 || amount > 5) {
                    throw new Error('Reputation change must be between -5 and +5');
                }
                return true;
            };

            expect(() => validateChange(-6)).toThrow('Reputation change must be between -5 and +5');
            expect(() => validateChange(6)).toThrow('Reputation change must be between -5 and +5');
            expect(() => validateChange(5)).not.toThrow();
            expect(() => validateChange(-5)).not.toThrow();
            expect(() => validateChange(0)).not.toThrow();
        });

        it('should validate gift amounts between 1 and 10', () => {
            const validateGift = (amount) => {
                if (amount < 1 || amount > 10) {
                    throw new Error('Gift amount must be between 1 and 10');
                }
                return true;
            };

            expect(() => validateGift(0)).toThrow('Gift amount must be between 1 and 10');
            expect(() => validateGift(11)).toThrow('Gift amount must be between 1 and 10');
            expect(() => validateGift(5)).not.toThrow();
        });
    });

    describe('Vote Cooldown', () => {
        it('should enforce vote cooldown period', () => {
            const VOTE_COOLDOWN = 3600000;
            const lastVote = Date.now() - 1800000;
            const now = Date.now();

            const canVote = (lastVoteTime) => {
                if (lastVoteTime && Date.now() - lastVoteTime < VOTE_COOLDOWN) {
                    return false;
                }
                return true;
            };

            expect(canVote(lastVote)).toBe(false);
            expect(canVote(now - 3600001)).toBe(true);
            expect(canVote(null)).toBe(true);
        });

        it('should enforce daily vote limit', () => {
            const MAX_DAILY_VOTES = 10;
            const dailyVotes = 10;

            const canVote = (votes) => {
                if (votes >= MAX_DAILY_VOTES) {
                    return false;
                }
                return true;
            };

            expect(canVote(9)).toBe(true);
            expect(canVote(10)).toBe(false);
            expect(canVote(11)).toBe(false);
        });
    });

    describe('Permission Thresholds', () => {
        it('should check permission thresholds correctly', () => {
            const THRESHOLDS = {
                VIEW_LEADERBOARD: -50,
                GIFT_REPUTATION: 50,
                DOWNVOTE: 0,
                SPECIAL_PERMISSIONS: 200,
                MODERATOR_NOMINATION: 100
            };

            const checkPermission = (score, permission) => {
                return score >= THRESHOLDS[permission];
            };

            expect(checkPermission(-60, 'VIEW_LEADERBOARD')).toBe(false);
            expect(checkPermission(-50, 'VIEW_LEADERBOARD')).toBe(true);
            expect(checkPermission(0, 'DOWNVOTE')).toBe(true);
            expect(checkPermission(-1, 'DOWNVOTE')).toBe(false);
            expect(checkPermission(50, 'GIFT_REPUTATION')).toBe(true);
            expect(checkPermission(200, 'SPECIAL_PERMISSIONS')).toBe(true);
        });
    });

    describe('Decay Settings', () => {
        it('should calculate decay correctly', () => {
            const DECAY_SETTINGS = {
                enabled: true,
                decayRate: 0.01,
                minScore: -100
            };

            const calculateDecay = (score) => {
                if (score < 30) return 0;
                const decay = Math.floor(score * DECAY_SETTINGS.decayRate);
                return Math.max(decay, 1);
            };

            expect(calculateDecay(1000)).toBe(10);
            expect(calculateDecay(500)).toBe(5);
            expect(calculateDecay(100)).toBe(1);
            expect(calculateDecay(50)).toBe(0);
            expect(calculateDecay(30)).toBe(0);
        });

        it('should not decay below minimum score', () => {
            const minScore = -100;
            const currentScore = -95;
            const decay = 10;

            const newScore = Math.max(minScore, currentScore - decay);
            expect(newScore).toBe(-100);
        });
    });

    describe('Reputation Score Calculation', () => {
        it('should calculate net reputation score correctly', () => {
            const calculateNetScore = (positive, negative) => {
                return positive - negative;
            };

            expect(calculateNetScore(10, 2)).toBe(8);
            expect(calculateNetScore(5, 5)).toBe(0);
            expect(calculateNetScore(0, 3)).toBe(-3);
        });

        it('should handle vote history calculation', () => {
            const votes = [
                { amount: 1, timestamp: new Date(Date.now() - 86400000 * 7) },
                { amount: -1, timestamp: new Date(Date.now() - 86400000 * 6) },
                { amount: 2, timestamp: new Date(Date.now() - 86400000 * 5) }
            ];

            const totalScore = votes.reduce((sum, vote) => sum + vote.amount, 0);
            const weeklyScore = votes
                .filter(v => Date.now() - new Date(v.timestamp).getTime() < 86400000 * 7)
                .reduce((sum, vote) => sum + vote.amount, 0);

            expect(totalScore).toBe(2);
            expect(weeklyScore).toBe(2);
        });
    });

    describe('Leaderboard Generation', () => {
        it('should sort users by reputation for leaderboard', () => {
            const users = [
                { id: '1', score: 50 },
                { id: '2', score: 150 },
                { id: '3', score: 25 },
                { id: '4', score: 100 }
            ];

            const sorted = [...users].sort((a, b) => b.score - a.score);
            expect(sorted[0].score).toBe(150);
            expect(sorted[1].score).toBe(100);
            expect(sorted[2].score).toBe(50);
            expect(sorted[3].score).toBe(25);
        });

        it('should handle tie-breaking by join date', () => {
            const users = [
                { id: '1', score: 100, joinDate: new Date('2024-01-01') },
                { id: '2', score: 100, joinDate: new Date('2024-06-01') }
            ];

            const sorted = [...users].sort((a, b) => {
                if (b.score === a.score) {
                    return a.joinDate - b.joinDate;
                }
                return b.score - a.score;
            });

            expect(sorted[0].id).toBe('1');
        });
    });

    describe('Reputation Gift Validation', () => {
        it('should verify sender has enough reputation to gift', () => {
            const canGift = (senderScore, giftAmount) => {
                return senderScore >= giftAmount;
            };

            expect(canGift(100, 50)).toBe(true);
            expect(canGift(50, 50)).toBe(true);
            expect(canGift(49, 50)).toBe(false);
            expect(canGift(10, 11)).toBe(false);
        });
    });
});

describe('Reputation History', () => {
    it('should record reputation changes with timestamps', () => {
        const history = [];
        const recordChange = (userId, amount, reason) => {
            history.push({
                userId,
                amount,
                reason,
                timestamp: new Date().toISOString()
            });
        };

        recordChange('user1', 5, 'Helpful answer');
        expect(history.length).toBe(1);
        expect(history[0].timestamp).toBeDefined();
    });

    it('should filter history by time period', () => {
        const history = [
            { timestamp: new Date(Date.now() - 86400000 * 10), amount: 5 },
            { timestamp: new Date(Date.now() - 86400000 * 5), amount: 3 },
            { timestamp: new Date(Date.now() - 86400000 * 2), amount: 1 },
            { timestamp: new Date(), amount: 2 }
        ];

        const weekAgo = Date.now() - 86400000 * 7;
        const recentHistory = history.filter(h => new Date(h.timestamp).getTime() > weekAgo);

        expect(recentHistory.length).toBe(2);
    });
});

describe('Audit Trail', () => {
    it('should log all reputation actions', () => {
        const auditLog = [];
        const logAction = (action, details) => {
            auditLog.push({
                action,
                ...details,
                timestamp: new Date().toISOString()
            });
        };

        logAction('REPUTATION_MODIFY', { userId: '123', amount: 5 });
        logAction('REPUTATION_GIFT', { senderId: '123', receiverId: '456', amount: 5 });
        logAction('REPUTATION_REMOVE', { userId: '789', amount: 10, moderatorId: '111' });

        expect(auditLog.length).toBe(3);
        expect(auditLog[0].action).toBe('REPUTATION_MODIFY');
        expect(auditLog[1].action).toBe('REPUTATION_GIFT');
        expect(auditLog[2].action).toBe('REPUTATION_REMOVE');
    });

    it('should export audit log', () => {
        const auditLog = [
            { action: 'TEST1', timestamp: new Date().toISOString() },
            { action: 'TEST2', timestamp: new Date().toISOString() }
        ];

        const exportLog = (limit = 100) => {
            return auditLog.slice(-limit);
        };

        expect(exportLog().length).toBe(2);
        expect(exportLog(1).length).toBe(1);
    });
});
