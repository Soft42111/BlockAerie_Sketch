import { config } from './config.js';

/**
 * User session state manager
 * Handles concurrent user sessions without conflicts
 */
class StateManager {
    constructor() {
        this.sessions = new Map();
        this.startCleanupInterval();
    }

    /**
     * Create a new session for a user
     */
    createSession(userId, channelId) {
        const session = {
            userId,
            channelId,
            currentQuestionIndex: 0,
            answers: {},
            createdAt: Date.now(),
            lastActivity: Date.now(),
        };

        this.sessions.set(userId, session);
        return session;
    }

    /**
     * Get existing session for a user
     */
    getSession(userId) {
        return this.sessions.get(userId);
    }

    /**
     * Check if user has an active session
     */
    hasSession(userId) {
        return this.sessions.has(userId);
    }

    /**
     * Update session with new answer
     */
    updateSession(userId, questionId, answer) {
        const session = this.sessions.get(userId);
        if (!session) return null;

        session.answers[questionId] = answer;
        session.currentQuestionIndex++;
        session.lastActivity = Date.now();

        return session;
    }

    /**
     * Delete a user's session
     */
    deleteSession(userId) {
        return this.sessions.delete(userId);
    }

    /**
     * Clean up stale sessions (older than timeout)
     */
    cleanupStaleSessions() {
        const now = Date.now();
        const timeout = config.bot.sessionTimeoutMs;

        for (const [userId, session] of this.sessions.entries()) {
            if (now - session.lastActivity > timeout) {
                console.log(`🧹 Cleaning up stale session for user ${userId}`);
                this.sessions.delete(userId);
            }
        }
    }

    /**
     * Start automatic cleanup interval
     */
    startCleanupInterval() {
        setInterval(() => {
            this.cleanupStaleSessions();
        }, 60000); // Run every minute
    }

    /**
     * Get all answers from a session
     */
    getAnswers(userId) {
        const session = this.sessions.get(userId);
        return session ? session.answers : null;
    }

    /**
     * Get session statistics
     */
    getStats() {
        return {
            activeSessions: this.sessions.size,
            sessions: Array.from(this.sessions.values()).map(s => ({
                userId: s.userId,
                questionIndex: s.currentQuestionIndex,
                age: Date.now() - s.createdAt,
            })),
        };
    }
}

// Export singleton instance
export const stateManager = new StateManager();
