/**
 * Pending Generation Manager
 * 
 * Stores AI generation requests (image, video, etc.) that are waiting for user confirmation.
 */

class PendingGenManager {
    constructor() {
        this.pending = new Map();
        this.ttl = 10 * 60 * 1000; // 10 minutes
    }

    /**
     * Store a pending generation
     * @param {string} interactionId - Unique ID for the interaction (e.g. userId + timestamp)
     * @param {Object} data - Generation parameters (prompt, model, etc.)
     * @returns {string} - The interactionId
     */
    add(interactionId, data) {
        this.pending.set(interactionId, {
            ...data,
            timestamp: Date.now()
        });

        // Auto-cleanup after TTL
        setTimeout(() => this.remove(interactionId), this.ttl);

        return interactionId;
    }

    /**
     * Retrieve a pending generation
     * @param {string} interactionId 
     * @returns {Object|null}
     */
    get(interactionId) {
        const item = this.pending.get(interactionId);
        if (!item) return null;

        // Verify TTL just in case
        if (Date.now() - item.timestamp > this.ttl) {
            this.pending.delete(interactionId);
            return null;
        }

        return item;
    }

    /**
     * Remove a pending generation
     * @param {string} interactionId 
     */
    remove(interactionId) {
        this.pending.delete(interactionId);
    }
}

export const pendingGenManager = new PendingGenManager();
