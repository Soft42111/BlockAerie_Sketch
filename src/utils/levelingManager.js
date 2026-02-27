/**
 * Leveling Manager
 * 
 * Handles XP tracking, level ups, and persistence.
 * Stores data in data/levels.json
 */
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'levels.json');
const COOLDOWN_MS = 60000; // 1 minute cooldown per message
const XP_MIN = 15;
const XP_MAX = 25;

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// In-memory cache
let levels = {}; // guildId -> userId -> { xp, level, lastMessage }

// Load from disk
try {
    if (fs.existsSync(DB_PATH)) {
        levels = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
} catch (e) {
    console.error('Failed to load levels:', e);
}

function save() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(levels, null, 2));
    } catch (e) {
        console.error('Failed to save levels:', e);
    }
}

/**
 * Calculate XP needed for next level
 * Formula: 5 * (level ^ 2) + 50 * level + 100
 */
function getXpForNextLevel(level) {
    return 5 * (level * level) + 50 * level + 100;
}

export const levelingManager = {
    /**
     * Add XP to a user.
     * @param {string} guildId 
     * @param {string} userId 
     * @returns {{ leveledUp: boolean, newLevel: number, oldLevel: number }}
     */
    addXp(guildId, userId) {
        if (!levels[guildId]) levels[guildId] = {};
        if (!levels[guildId][userId]) {
            levels[guildId][userId] = { xp: 0, level: 0, lastMessage: 0 };
        }

        const user = levels[guildId][userId];
        const now = Date.now();

        // Check cooldown
        if (now - user.lastMessage < COOLDOWN_MS) {
            return { leveledUp: false };
        }

        // Add random XP
        const xpGain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
        user.xp += xpGain;
        user.lastMessage = now;

        // Check for level up
        const xpNeeded = getXpForNextLevel(user.level);
        let leveledUp = false;
        const oldLevel = user.level;

        if (user.xp >= xpNeeded) {
            user.level++;
            user.xp -= xpNeeded; // Reset XP for next level (or keep accumulating? Standard is often cumulative total, but let's do simple RPG style: 0 -> 100)
            // Correction: Standard discord bots often use TOTAL XP. 
            // Let's stick to "XP towards next level" for simplicity of display, 
            // OR use Cumulative.
            // Let's us Cumulative XP internally to avoid data loss issues, but the check above implies "XP bar reset".
            // Let's refactor to Cumulative XP for robustness.
        }

        // REFACTOR: Standard Cumulative XP
        // Level N requires Total XP = ... logic is complex. 
        // Let's stick to the "XP Bar" model (XP resets on level up) as per the code above, it's easier to read for users.

        save();

        return {
            leveledUp: user.level > oldLevel,
            newLevel: user.level,
            oldLevel
        };
    },

    /**
     * Get user rank card data.
     */
    getUserRank(guildId, userId) {
        const guildData = levels[guildId] || {};
        const user = guildData[userId];
        if (!user) return null;

        // Calculate rank
        const sorted = Object.entries(guildData)
            .sort(([, a], [, b]) => (b.level * 100000 + b.xp) - (a.level * 100000 + a.xp));

        const rank = sorted.findIndex(([id]) => id === userId) + 1;

        return {
            level: user.level,
            xp: user.xp,
            xpNeeded: getXpForNextLevel(user.level),
            rank,
            totalUsers: Object.keys(guildData).length
        };
    },

    /**
     * Get leaderboard for a guild.
     */
    getLeaderboard(guildId, limit = 10) {
        const guildData = levels[guildId] || {};
        if (Object.keys(guildData).length === 0) return [];

        return Object.entries(guildData)
            .sort(([, a], [, b]) => (b.level * 100000 + b.xp) - (a.level * 100000 + a.xp))
            .slice(0, limit)
            .map(([userId, data]) => ({ userId, ...data }));
    }
};
