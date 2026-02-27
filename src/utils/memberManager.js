import { EmbedBuilder, Colors, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const NOTES_FILE = path.join(DATA_DIR, 'member_notes.json');
const HISTORY_FILE = path.join(DATA_DIR, 'member_history.json');
const REPUTATION_FILE = path.join(DATA_DIR, 'reputation.json');

export class MemberManager {
    constructor() {
        this.ensureDataFiles();
        this.loadData();
    }

    ensureDataFiles() {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        
        if (!fs.existsSync(NOTES_FILE)) {
            fs.writeFileSync(NOTES_FILE, JSON.stringify({ notes: {}, noteIdCounter: 1 }, null, 2));
        }
        
        if (!fs.existsSync(HISTORY_FILE)) {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify({ history: {} }, null, 2));
        }
        
        if (!fs.existsSync(REPUTATION_FILE)) {
            fs.writeFileSync(REPUTATION_FILE, JSON.stringify({ reputation: {} }, null, 2));
        }
    }

    loadData() {
        try {
            this.notesData = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
            this.historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
            this.reputationData = JSON.parse(fs.readFileSync(REPUTATION_FILE, 'utf8'));
        } catch (error) {
            this.notesData = { notes: {}, noteIdCounter: 1 };
            this.historyData = { history: {} };
            this.reputationData = { reputation: {} };
        }
    }

    saveNotes() {
        try {
            fs.writeFileSync(NOTES_FILE, JSON.stringify(this.notesData, null, 2));
        } catch (error) {
            console.error('Failed to save notes:', error);
        }
    }

    saveHistory() {
        try {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.historyData, null, 2));
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    saveReputation() {
        try {
            fs.writeFileSync(REPUTATION_FILE, JSON.stringify(this.reputationData, null, 2));
        } catch (error) {
            console.error('Failed to save reputation:', error);
        }
    }

    addNote(guildId, userId, moderatorId, content, type = 'general') {
        const noteId = this.notesData.noteIdCounter++;
        
        const note = {
            id: noteId,
            guildId,
            userId,
            moderatorId,
            content,
            type,
            timestamp: Date.now()
        };
        
        if (!this.notesData.notes[userId]) {
            this.notesData.notes[userId] = [];
        }
        this.notesData.notes[userId].push(note);
        
        this.addHistoryEntry(guildId, userId, 'note_added', { noteId, content });
        
        this.saveNotes();
        
        return note;
    }

    getNotes(userId, guildId = null) {
        const notes = this.notesData.notes[userId] || [];
        if (guildId) {
            return notes.filter(n => n.guildId === guildId);
        }
        return notes;
    }

    deleteNote(userId, noteId, moderatorId) {
        const notes = this.notesData.notes[userId];
        if (!notes) return false;
        
        const index = notes.findIndex(n => n.id === noteId);
        if (index === -1) return false;
        
        const deletedNote = notes[index];
        notes.splice(index, 1);
        
        this.addHistoryEntry(deletedNote.guildId, userId, 'note_deleted', { 
            deletedNote, 
            deletedBy: moderatorId 
        });
        
        this.saveNotes();
        
        return true;
    }

    editNote(userId, noteId, newContent, moderatorId) {
        const notes = this.notesData.notes[userId];
        if (!notes) return null;
        
        const note = notes.find(n => n.id === noteId);
        if (!note) return null;
        
        const oldContent = note.content;
        note.content = newContent;
        note.editedAt = Date.now();
        note.editedBy = moderatorId;
        
        this.addHistoryEntry(note.guildId, userId, 'note_edited', { 
            noteId, 
            oldContent, 
            newContent,
            editedBy: moderatorId 
        });
        
        this.saveNotes();
        
        return note;
    }

    addHistoryEntry(guildId, userId, action, details) {
        if (!this.historyData.history[userId]) {
            this.historyData.history[userId] = [];
        }
        
        const entry = {
            id: Date.now().toString(),
            guildId,
            action,
            details,
            timestamp: Date.now()
        };
        
        this.historyData.history[userId].unshift(entry);
        
        if (this.historyData.history[userId].length > 100) {
            this.historyData.history[userId] = this.historyData.history[userId].slice(0, 100);
        }
        
        this.saveHistory();
    }

    getHistory(userId, guildId = null, limit = 50) {
        let history = this.historyData.history[userId] || [];
        
        if (guildId) {
            history = history.filter(h => h.guildId === guildId);
        }
        
        return history.slice(0, limit);
    }

    getFullMemberProfile(guildId, userId) {
        const notes = this.getNotes(userId, guildId);
        const history = this.getHistory(userId, guildId, 20);
        const reputation = this.getReputation(userId);
        
        const moderationCases = this.getMemberModerationHistory(userId, guildId);
        
        return {
            notes,
            history,
            reputation,
            moderationCases,
            accountAge: null,
            joinedAt: null,
            lastActive: null
        };
    }

    getMemberModerationHistory(userId, guildId) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            const moderationData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'moderation_cases.json'), 'utf8'));
            
            return moderationData.cases
                .filter(c => c.targetId === userId && c.guildId === guildId && !c.undone)
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10);
        } catch {
            return [];
        }
    }

    addReputation(userId, giverId, amount, reason = '') {
        if (!this.reputationData.reputation[userId]) {
            this.reputationData.reputation[userId] = {
                total: 0,
                history: [],
                given: {}
            };
        }
        
        this.reputationData.reputation[userId].total += amount;
        this.reputationData.reputation[userId].history.push({
            amount,
            reason,
            givenBy: giverId,
            timestamp: Date.now()
        });
        
        if (!this.reputationData.reputation[userId].given[giverId]) {
            this.reputationData.reputation[userId].given[giverId] = 0;
        }
        this.reputationData.reputation[userId].given[giverId] += amount;
        
        this.saveReputation();
        
        return this.reputationData.reputation[userId].total;
    }

    getReputation(userId) {
        return this.reputationData.reputation[userId] || { total: 0, history: [], given: {} };
    }

    getLeaderboard(guildId, limit = 10) {
        const reputation = [];
        
        for (const [userId, data] of Object.entries(this.reputationData.reputation)) {
            reputation.push({
                userId,
                total: data.total,
                recentHistory: data.history.slice(0, 3)
            });
        }
        
        return reputation
            .sort((a, b) => b.total - a.total)
            .slice(0, limit);
    }

    searchMembers(guildId, query) {
        return {
            notes: Object.entries(this.notesData.notes)
                .filter(([userId, notes]) => 
                    notes.some(n => 
                        n.guildId === guildId && 
                        n.content.toLowerCase().includes(query.toLowerCase())
                    )
                )
                .map(([userId]) => userId),
            history: Object.entries(this.historyData.history)
                .filter(([userId, history]) =>
                    history.some(h =>
                        h.guildId === guildId &&
                        JSON.stringify(h.details).toLowerCase().includes(query.toLowerCase())
                    )
                )
                .map(([userId]) => userId)
        };
    }

    exportMemberData(guildId, userId) {
        const profile = this.getFullMemberProfile(guildId, userId);
        return JSON.stringify(profile, null, 2);
    }

    bulkAction(guildId, action, options) {
        const results = {
            success: [],
            failed: [],
            total: 0
        };

        switch (action) {
            case 'mute':
            case 'timeout':
                break;
            case 'kick':
                break;
            case 'ban':
                break;
        }

        return results;
    }

    generateMemberReport(guildId, userId) {
        const profile = this.getFullMemberProfile(guildId, userId);
        
        const report = {
            generatedAt: Date.now(),
            memberInfo: {
                userId,
                notes: profile.notes.length,
                reputation: profile.reputation.total,
                moderationHistory: profile.moderationCases.length
            },
            summary: {
                positiveInteractions: profile.reputation.total,
                moderationActions: profile.moderationCases.length,
                warnings: profile.notes.filter(n => n.type === 'warning').length
            },
            data: profile
        };
        
        return report;
    }
}

export const memberManager = new MemberManager();
