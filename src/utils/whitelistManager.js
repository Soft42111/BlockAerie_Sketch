/**
 * Whitelist Manager
 * 
 * Manages users and roles that are exempt from auto-moderation checks.
 * Persists data to critical-whitelist.json.
 */
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'whitelist.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// Initial state
let whitelist = {
    userIds: [],
    roleIds: []
};

// Load from disk
try {
    if (fs.existsSync(DB_PATH)) {
        whitelist = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
} catch (e) {
    console.error('Failed to load whitelist:', e);
}

function save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(whitelist, null, 2));
}

export const whitelistManager = {
    /**
     * Check if a member is whitelisted (by ID or Role).
     * @param {import('discord.js').GuildMember} member 
     * @returns {boolean}
     */
    isWhitelisted(member) {
        if (!member) return false;
        if (whitelist.userIds.includes(member.id)) return true;
        if (member.roles && member.roles.cache) {
            return member.roles.cache.some(r => whitelist.roleIds.includes(r.id));
        }
        return false;
    },

    addUser(userId) {
        if (!whitelist.userIds.includes(userId)) {
            whitelist.userIds.push(userId);
            save();
            return true;
        }
        return false;
    },

    removeUser(userId) {
        if (whitelist.userIds.includes(userId)) {
            whitelist.userIds = whitelist.userIds.filter(id => id !== userId);
            save();
            return true;
        }
        return false;
    },

    addRole(roleId) {
        if (!whitelist.roleIds.includes(roleId)) {
            whitelist.roleIds.push(roleId);
            save();
            return true;
        }
        return false;
    },

    removeRole(roleId) {
        if (whitelist.roleIds.includes(roleId)) {
            whitelist.roleIds = whitelist.roleIds.filter(id => id !== roleId);
            save();
            return true;
        }
        return false;
    },

    getLists() {
        return { ...whitelist };
    }
};
