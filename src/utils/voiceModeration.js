import {
    PermissionFlagsBits,
    EmbedBuilder,
    Colors,
    time,
    TimestampStyles
} from 'discord.js';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const VOICE_MODERATION_FILE = path.join(DATA_DIR, 'voiceModeration.json');
const VOICE_MUTE_QUEUE_FILE = path.join(DATA_DIR, 'voiceMuteQueue.json');
const VOICE_ACTIVITY_FILE = path.join(DATA_DIR, 'voiceActivity.json');

export class voiceModeration {
    constructor() {
        this.ensureDataFiles();
        this.loadData();
        this.activeVoiceMutes = new Map();
        this.channelSwitchTracker = new Map();
        this.voiceActivityMonitor = new Map();
        this.volumeTracker = new Map();
        this.muteQueue = [];
        this.caseCounter = this.loadCaseCounter();
    }

    ensureDataFiles() {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        
        if (!fs.existsSync(VOICE_MODERATION_FILE)) {
            fs.writeFileSync(VOICE_MODERATION_FILE, JSON.stringify({
                guildConfigs: {},
                muteRoleId: null,
                voiceLogs: [],
                spamRules: {
                    maxSwitches: 5,
                    switchTimeWindow: 10000,
                    action: 'warn'
                },
                channelLimits: {},
                volumeThreshold: 0.8,
                volumeAction: 'warn'
            }, null, 2));
        }
        
        if (!fs.existsSync(VOICE_MUTE_QUEUE_FILE)) {
            fs.writeFileSync(VOICE_MUTE_QUEUE_FILE, JSON.stringify({
                queue: [],
                processing: false
            }, null, 2));
        }
        
        if (!fs.existsSync(VOICE_ACTIVITY_FILE)) {
            fs.writeFileSync(VOICE_ACTIVITY_FILE, JSON.stringify({
                sessions: {},
                stats: {}
            }, null, 2));
        }
    }

    loadData() {
        try {
            this.data = JSON.parse(fs.readFileSync(VOICE_MODERATION_FILE, 'utf8'));
        } catch (error) {
            this.data = {
                guildConfigs: {},
                muteRoleId: null,
                voiceLogs: [],
                spamRules: {
                    maxSwitches: 5,
                    switchTimeWindow: 10000,
                    action: 'warn'
                },
                channelLimits: {},
                volumeThreshold: 0.8,
                volumeAction: 'warn'
            };
        }
        
        try {
            this.muteQueueData = JSON.parse(fs.readFileSync(VOICE_MUTE_QUEUE_FILE, 'utf8'));
            this.muteQueue = this.muteQueueData.queue || [];
        } catch (error) {
            this.muteQueueData = { queue: [], processing: false };
            this.muteQueue = [];
        }
        
        try {
            this.activityData = JSON.parse(fs.readFileSync(VOICE_ACTIVITY_FILE, 'utf8'));
        } catch (error) {
            this.activityData = { sessions: {}, stats: {} };
        }
    }

    saveData() {
        try {
            fs.writeFileSync(VOICE_MODERATION_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Failed to save voice moderation data:', error);
        }
        
        try {
            this.muteQueueData.queue = this.muteQueue;
            fs.writeFileSync(VOICE_MUTE_QUEUE_FILE, JSON.stringify(this.muteQueueData, null, 2));
        } catch (error) {
            console.error('Failed to save mute queue data:', error);
        }
        
        try {
            fs.writeFileSync(VOICE_ACTIVITY_FILE, JSON.stringify(this.activityData, null, 2));
        } catch (error) {
            console.error('Failed to save voice activity data:', error);
        }
    }

    loadCaseCounter() {
        const maxCaseNum = (this.data.voiceLogs || []).reduce((max, log) => {
            if (log.caseNumber) {
                const num = parseInt(log.caseNumber.replace(/^#/, '')) || 0;
                return Math.max(max, num);
            }
            return max;
        }, 0);
        return maxCaseNum + 1;
    }

    getGuildConfig(guildId) {
        if (!this.data.guildConfigs[guildId]) {
            this.data.guildConfigs[guildId] = {
                logChannelId: null,
                modRoleId: null,
                enabled: true,
                autoMod: {
                    spamDetection: true,
                    volumeDetection: false,
                    channelLimit: true,
                    recordingNotification: true
                }
            };
        }
        return this.data.guildConfigs[guildId];
    }

    hasPermission(member, permission) {
        if (!member) return false;
        return member.permissions.has(permission);
    }

    canModerateVoice(moderator, target) {
        if (!moderator || !target) {
            return { allowed: false, reason: 'Invalid member data' };
        }

        if (moderator.id === target.id) {
            return { allowed: false, reason: 'You cannot moderate yourself' };
        }

        if (target.id === target.guild.ownerId) {
            return { allowed: false, reason: 'Cannot moderate the server owner' };
        }

        const botMember = target.guild.members.me;
        if (target.roles.highest.position >= botMember.roles.highest.position) {
            return { allowed: false, reason: 'Cannot moderate - target role is too high' };
        }

        if (target.roles.highest.position >= moderator.roles.highest.position) {
            return { allowed: false, reason: 'Target has equal or higher role' };
        }

        return { allowed: true };
    }

    isUserInVoice(member) {
        return member.voice.channel !== null;
    }

    getUserVoiceChannel(member) {
        return member.voice.channel;
    }

    generateCaseNumber() {
        return `#${String(this.caseCounter++).padStart(5, '0')}`;
    }

    async logVoiceAction(guildId, actionType, details) {
        const config = this.getGuildConfig(guildId);
        const logChannelId = config.logChannelId;
        
        if (!logChannelId) return null;

        try {
            const guild = await this.client?.guilds?.fetch(guildId) || null;
            if (!guild) return null;
            
            const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel) return null;

            const logEntry = {
                caseNumber: this.generateCaseNumber(),
                type: actionType,
                ...details,
                timestamp: Date.now()
            };

            this.data.voiceLogs.push(logEntry);
            if (this.data.voiceLogs.length > 1000) {
                this.data.voiceLogs = this.data.voiceLogs.slice(-500);
            }
            this.saveData();

            const colors = {
                voiceMute: Colors.Red,
                voiceUnmute: Colors.Green,
                voiceDeafen: Colors.Red,
                voiceUndeafen: Colors.Green,
                voiceMove: Colors.Blue,
                voiceKick: Colors.Orange,
                voiceJoin: Colors.Grey,
                voiceLeave: Colors.Grey,
                voiceSwitch: Colors.Purple,
                spamDetect: Colors.Yellow,
                volumeWarn: Colors.Orange
            };

            const emojis = {
                voiceMute: '🔇',
                voiceUnmute: '🔊',
                voiceDeafen: '🎧',
                voiceUndeafen: '🎧',
                voiceMove: '📍',
                voiceKick: '👢',
                voiceJoin: '📥',
                voiceLeave: '📤',
                voiceSwitch: '🔀',
                spamDetect: '⚠️',
                volumeWarn: '📢'
            };

            const embed = new EmbedBuilder()
                .setColor(colors[actionType] || Colors.Grey)
                .setTitle(`${emojis[actionType] || '📝'} ${actionType.toUpperCase()} - Case ${logEntry.caseNumber}`)
                .addFields(
                    { name: 'Target', value: details.targetTag || 'Unknown', inline: true },
                    { name: 'Moderator', value: details.moderatorTag || 'System', inline: true }
                )
                .setTimestamp();

            if (details.reason) {
                embed.addFields({ name: 'Reason', value: details.reason, inline: false });
            }

            if (details.channel) {
                embed.addFields({ name: 'Channel', value: details.channel, inline: true });
            }

            if (details.duration) {
                embed.addFields({ name: 'Duration', value: details.duration, inline: true });
            }

            await logChannel.send({ embeds: [embed] });
            return logEntry;
        } catch (error) {
            console.error('Failed to log voice action:', error);
            return null;
        }
    }

    async muteVoice(moderator, target, options = {}) {
        const { reason = 'No reason provided', duration = null } = options;

        if (!this.hasPermission(moderator, PermissionFlagsBits.MuteMembers)) {
            return { success: false, error: 'Missing Mute Members permission' };
        }

        const hierarchyCheck = this.canModerateVoice(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }

        if (!this.isUserInVoice(target)) {
            return { success: false, error: 'User is not in a voice channel' };
        }

        try {
            const currentChannel = this.getUserVoiceChannel(target);
            await target.voice.setMute(true, reason);

            const durationStr = duration ? this.formatDuration(duration) : 'Indefinite';
            const muteData = {
                targetId: target.id,
                moderatorId: moderator.id,
                guildId: target.guild.id,
                channelId: currentChannel.id,
                reason,
                duration,
                startTime: Date.now(),
                active: true
            };

            this.activeVoiceMutes.set(target.id, muteData);

            const logEntry = await this.logVoiceAction(target.guild.id, 'voiceMute', {
                targetId: target.id,
                targetTag: target.user.tag,
                moderatorId: moderator.id,
                moderatorTag: moderator.user.tag,
                reason,
                channel: currentChannel.name,
                duration: durationStr
            });

            if (duration) {
                setTimeout(() => {
                    this.unmuteVoiceById(target.guild.id, target.id, 'Voice mute duration expired');
                }, duration);
            }

            return { success: true, caseNumber: logEntry?.caseNumber, muteData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async unmuteVoice(moderator, target, reason = 'Manual unmute') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.MuteMembers)) {
            return { success: false, error: 'Missing Mute Members permission' };
        }

        if (!this.isUserInVoice(target)) {
            return { success: false, error: 'User is not in a voice channel' };
        }

        const muteData = this.activeVoiceMutes.get(target.id);
        if (!muteData) {
            return { success: false, error: 'User is not voice muted' };
        }

        try {
            await target.voice.setMute(false, reason);
            muteData.active = false;
            muteData.unmutedAt = Date.now();
            this.activeVoiceMutes.set(target.id, muteData);

            const currentChannel = this.getUserVoiceChannel(target);
            const logEntry = await this.logVoiceAction(target.guild.id, 'voiceUnmute', {
                targetId: target.id,
                targetTag: target.user.tag,
                moderatorId: moderator.id,
                moderatorTag: moderator.user.tag,
                reason,
                channel: currentChannel?.name || 'Unknown'
            });

            return { success: true, caseNumber: logEntry?.caseNumber };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async unmuteVoiceById(guildId, userId, reason = 'Voice mute expired') {
        try {
            const guild = await this.client?.guilds?.fetch(guildId);
            if (!guild) return { success: false, error: 'Guild not found' };

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return { success: false, error: 'Member not found' };

            if (!this.isUserInVoice(member)) {
                this.activeVoiceMutes.delete(userId);
                return { success: true, reason: 'User left voice' };
            }

            await member.voice.setMute(false, reason);
            const muteData = this.activeVoiceMutes.get(userId);
            if (muteData) {
                muteData.active = false;
                muteData.expired = true;
                this.activeVoiceMutes.set(userId, muteData);
            }

            const logEntry = await this.logVoiceAction(guildId, 'voiceUnmute', {
                targetId: userId,
                targetTag: member.user.tag,
                moderatorId: 'SYSTEM',
                moderatorTag: 'System',
                reason,
                channel: member.voice.channel?.name || 'Unknown'
            });

            return { success: true, caseNumber: logEntry?.caseNumber };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deafenVoice(moderator, target, options = {}) {
        const { reason = 'No reason provided', duration = null } = options;

        if (!this.hasPermission(moderator, PermissionFlagsBits.DeafenMembers)) {
            return { success: false, error: 'Missing Deafen Members permission' };
        }

        const hierarchyCheck = this.canModerateVoice(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }

        if (!this.isUserInVoice(target)) {
            return { success: false, error: 'User is not in a voice channel' };
        }

        try {
            const currentChannel = this.getUserVoiceChannel(target);
            await target.voice.setDeaf(true);

            const durationStr = duration ? this.formatDuration(duration) : 'Indefinite';

            const logEntry = await this.logVoiceAction(target.guild.id, 'voiceDeafen', {
                targetId: target.id,
                targetTag: target.user.tag,
                moderatorId: moderator.id,
                moderatorTag: moderator.user.tag,
                reason,
                channel: currentChannel.name,
                duration: durationStr
            });

            if (duration) {
                setTimeout(() => {
                    this.undeafenVoiceById(target.guild.id, target.id, 'Voice deafen duration expired');
                }, duration);
            }

            return { success: true, caseNumber: logEntry?.caseNumber };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async undeafenVoice(moderator, target, reason = 'Manual undeafen') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.DeafenMembers)) {
            return { success: false, error: 'Missing Deafen Members permission' };
        }

        if (!this.isUserInVoice(target)) {
            return { success: false, error: 'User is not in a voice channel' };
        }

        if (!target.voice.deaf) {
            return { success: false, error: 'User is not deafened' };
        }

        try {
            await target.voice.setDeaf(false, reason);
            const currentChannel = this.getUserVoiceChannel(target);

            const logEntry = await this.logVoiceAction(target.guild.id, 'voiceUndeafen', {
                targetId: target.id,
                targetTag: target.user.tag,
                moderatorId: moderator.id,
                moderatorTag: moderator.user.tag,
                reason,
                channel: currentChannel?.name || 'Unknown'
            });

            return { success: true, caseNumber: logEntry?.caseNumber };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async undeafenVoiceById(guildId, userId, reason = 'Voice deafen expired') {
        try {
            const guild = await this.client?.guilds?.fetch(guildId);
            if (!guild) return { success: false, error: 'Guild not found' };

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return { success: false, error: 'Member not found' };

            if (!this.isUserInVoice(member)) {
                return { success: true, reason: 'User left voice' };
            }

            if (!member.voice.deaf) {
                return { success: true, reason: 'User already undeafened' };
            }

            await member.voice.setDeaf(false, reason);

            const logEntry = await this.logVoiceAction(guildId, 'voiceUndeafen', {
                targetId: userId,
                targetTag: member.user.tag,
                moderatorId: 'SYSTEM',
                moderatorTag: 'System',
                reason,
                channel: member.voice.channel?.name || 'Unknown'
            });

            return { success: true, caseNumber: logEntry?.caseNumber };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async moveVoice(moderator, target, channel, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.MoveMembers)) {
            return { success: false, error: 'Missing Move Members permission' };
        }

        const hierarchyCheck = this.canModerateVoice(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }

        if (!this.isUserInVoice(target)) {
            return { success: false, error: 'User is not in a voice channel' };
        }

        try {
            const oldChannel = this.getUserVoiceChannel(target);
            await target.voice.setChannel(channel, reason);

            const logEntry = await this.logVoiceAction(target.guild.id, 'voiceMove', {
                targetId: target.id,
                targetTag: target.user.tag,
                moderatorId: moderator.id,
                moderatorTag: moderator.user.tag,
                reason,
                channel: `${oldChannel.name} → ${channel.name}`
            });

            return { success: true, caseNumber: logEntry?.caseNumber };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async voiceKick(moderator, target, reason = 'No reason provided') {
        if (!this.hasPermission(moderator, PermissionFlagsBits.MoveMembers)) {
            return { success: false, error: 'Missing Move Members permission' };
        }

        const hierarchyCheck = this.canModerateVoice(moderator, target);
        if (!hierarchyCheck.allowed) {
            return { success: false, error: hierarchyCheck.reason };
        }

        if (!this.isUserInVoice(target)) {
            return { success: false, error: 'User is not in a voice channel' };
        }

        try {
            const currentChannel = this.getUserVoiceChannel(target);
            await target.voice.disconnect(reason);

            const logEntry = await this.logVoiceAction(target.guild.id, 'voiceKick', {
                targetId: target.id,
                targetTag: target.user.tag,
                moderatorId: moderator.id,
                moderatorTag: moderator.user.tag,
                reason,
                channel: currentChannel.name
            });

            return { success: true, caseNumber: logEntry?.caseNumber };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    addToMuteQueue(muteData) {
        const queueItem = {
            ...muteData,
            queuedAt: Date.now(),
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
        };
        this.muteQueue.push(queueItem);
        this.saveData();
        return queueItem;
    }

    processMuteQueue() {
        if (this.muteQueueData.processing) return;
        if (this.muteQueue.length === 0) return;

        this.muteQueueData.processing = true;
        this.saveData();

        const processNext = async () => {
            if (this.muteQueue.length === 0) {
                this.muteQueueData.processing = false;
                this.saveData();
                return;
            }

            const item = this.muteQueue.shift();
            this.saveData();

            try {
                const guild = await this.client?.guilds?.fetch(item.guildId);
                if (!guild) return processNext();

                const moderator = await guild.members.fetch(item.moderatorId).catch(() => null);
                const target = await guild.members.fetch(item.targetId).catch(() => null);

                if (!moderator || !target) {
                    return processNext();
                }

                await this.muteVoice(moderator, target, {
                    reason: item.reason,
                    duration: item.duration
                });
            } catch (error) {
                console.error('Failed to process mute queue item:', error);
            }

            setTimeout(processNext, 1000);
        };

        setTimeout(processNext, 100);
    }

    detectVoiceSpam(userId, guildId) {
        const now = Date.now();
        const rules = this.data.spamRules;
        
        if (!this.channelSwitchTracker.has(userId)) {
            this.channelSwitchTracker.set(userId, {
                switches: [],
                lastSwitch: null
            });
        }

        const userData = this.channelSwitchTracker.get(userId);
        
        userData.switches = userData.switches.filter(s => now - s < rules.switchTimeWindow);
        
        if (userData.lastSwitch && now - userData.lastSwitch < 1000) {
            userData.switches.push(now);
        }
        
        userData.lastSwitch = now;

        if (userData.switches.length >= rules.maxSwitches) {
            userData.switches = [];
            return { isSpamming: true, switchCount: userData.switches.length };
        }

        return { isSpamming: false, switchCount: userData.switches.length };
    }

    handleVoiceStateUpdate(oldState, newState) {
        const guildId = newState.guild?.id;
        if (!guildId) return;

        const config = this.getGuildConfig(guildId);
        if (!config.enabled || !config.autoMod?.spamDetection) return;

        const userId = newState.member?.id;
        if (!userId) return;

        const oldChannel = oldState.channelId;
        const newChannel = newState.channelId;

        if (oldChannel && newChannel && oldChannel !== newChannel) {
            const spamResult = this.detectVoiceSpam(userId, guildId);
            
            if (spamResult.isSpamming) {
                this.logVoiceAction(guildId, 'spamDetect', {
                    targetId: userId,
                    targetTag: newState.member?.user?.tag || 'Unknown',
                    moderatorId: 'AUTO',
                    moderatorTag: 'Auto-Mod',
                    reason: `Rapid channel switching detected (${spamResult.switchCount} switches)`,
                    channel: oldChannel
                });
            }
        }

        this.logVoiceJoinLeave(guildId, userId, oldChannel, newChannel);
    }

    logVoiceJoinLeave(guildId, userId, oldChannelId, newChannelId) {
        if (newChannelId && !oldChannelId) {
            this.logVoiceAction(guildId, 'voiceJoin', {
                targetId: userId,
                targetTag: 'Unknown',
                moderatorId: 'SYSTEM',
                moderatorTag: 'System',
                reason: 'User joined voice',
                channel: 'Voice Channel'
            });
        } else if (oldChannelId && !newChannelId) {
            this.logVoiceAction(guildId, 'voiceLeave', {
                targetId: userId,
                targetTag: 'Unknown',
                moderatorId: 'SYSTEM',
                moderatorTag: 'System',
                reason: 'User left voice',
                channel: 'Voice Channel'
            });
        } else if (oldChannelId !== newChannelId) {
            this.logVoiceAction(guildId, 'voiceSwitch', {
                targetId: userId,
                targetTag: 'Unknown',
                moderatorId: 'SYSTEM',
                moderatorTag: 'System',
                reason: 'User switched voice channels',
                channel: `${oldChannelId} → ${newChannelId}`
            });
        }
    }

    checkChannelLimit(channel) {
        const guildId = channel.guild.id;
        const limits = this.data.channelLimits;
        
        if (!limits[guildId]) return { exceeded: false };
        
        const channelLimit = limits[guildId][channel.id];
        if (!channelLimit || channelLimit === 0) return { exceeded: false };
        
        const currentCount = channel.members?.size || 0;
        
        if (currentCount >= channelLimit) {
            return {
                exceeded: true,
                limit: channelLimit,
                current: currentCount
            };
        }
        
        return { exceeded: false, limit: channelLimit, current: currentCount };
    }

    setChannelLimit(guildId, channelId, limit) {
        if (!this.data.channelLimits[guildId]) {
            this.data.channelLimits[guildId] = {};
        }
        this.data.channelLimits[guildId][channelId] = limit;
        this.saveData();
        return true;
    }

    getChannelLimit(guildId, channelId) {
        return this.data.channelLimits[guildId]?.[channelId] || 0;
    }

    detectRecordingStatus(voiceState) {
        return {
            isRecording: voiceState.selfVideo || voiceState.streaming,
            isSuppressed: voiceState.suppress,
            isMuted: voiceState.mute || voiceState.selfMute,
            isDeafened: voiceState.deaf || voiceState.selfDeaf
        };
    }

    monitorVoiceActivity(userId, guildId, activityData) {
        const key = `${guildId}:${userId}`;
        
        if (!this.voiceActivityMonitor.has(key)) {
            this.voiceActivityMonitor.set(key, {
                startTime: Date.now(),
                totalSpeech: 0,
                lastActivity: Date.now(),
                sessions: []
            });
        }

        const monitor = this.voiceActivityMonitor.get(key);
        
        if (activityData.speaking) {
            monitor.totalSpeech += activityData.duration || 100;
        }
        
        monitor.lastActivity = Date.now();
        
        if (Date.now() - monitor.startTime > 3600000) {
            monitor.sessions.push({
                startTime: monitor.startTime,
                endTime: Date.now(),
                totalSpeech: monitor.totalSpeech
            });
            monitor.startTime = Date.now();
            monitor.totalSpeech = 0;
        }

        this.voiceActivityMonitor.set(key, monitor);
        
        this.activityData.sessions[key] = {
            ...monitor,
            lastUpdated: Date.now()
        };
        this.saveData();
    }

    getVoiceActivityStats(guildId, userId) {
        const key = `${guildId}:${userId}`;
        return this.voiceActivityMonitor.get(key) || this.activityData.sessions[key] || null;
    }

    setVolumeThreshold(guildId, threshold) {
        this.data.volumeThreshold = Math.min(1, Math.max(0, threshold));
        this.saveData();
        return this.data.volumeThreshold;
    }

    getVolumeThreshold(guildId) {
        return this.data.volumeThreshold;
    }

    setSpamRules(guildId, rules) {
        this.data.spamRules = {
            ...this.data.spamRules,
            ...rules
        };
        this.saveData();
        return this.data.spamRules;
    }

    getSpamRules(guildId) {
        return this.data.spamRules;
    }

    setLogChannel(guildId, channelId) {
        const config = this.getGuildConfig(guildId);
        config.logChannelId = channelId;
        this.saveData();
        return true;
    }

    getLogChannel(guildId) {
        return this.getGuildConfig(guildId).logChannelId;
    }

    setModRole(guildId, roleId) {
        const config = this.getGuildConfig(guildId);
        config.modRoleId = roleId;
        this.saveData();
        return true;
    }

    setEnabled(guildId, enabled) {
        const config = this.getGuildConfig(guildId);
        config.enabled = enabled;
        this.saveData();
        return true;
    }

    getEnabled(guildId) {
        return this.getGuildConfig(guildId).enabled;
    }

    configureAutoMod(guildId, options) {
        const config = this.getGuildConfig(guildId);
        config.autoMod = {
            ...config.autoMod,
            ...options
        };
        this.saveData();
        return config.autoMod;
    }

    getAutoModConfig(guildId) {
        return this.getGuildConfig(guildId).autoMod;
    }

    getActiveVoiceMutes() {
        const active = [];
        for (const [userId, data] of this.activeVoiceMutes.entries()) {
            if (data.active) {
                active.push({ userId, ...data });
            }
        }
        return active;
    }

    getVoiceLogs(guildId, options = {}) {
        const { type, limit = 100, startDate, endDate } = options;
        
        let logs = this.data.voiceLogs.filter(log => log.guildId === guildId);
        
        if (type) {
            logs = logs.filter(log => log.type === type);
        }
        
        if (startDate) {
            logs = logs.filter(log => log.timestamp >= startDate);
        }
        
        if (endDate) {
            logs = logs.filter(log => log.timestamp <= endDate);
        }
        
        return logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }

    getVoiceStats(guildId) {
        const logs = this.getVoiceLogs(guildId, { limit: 1000 });
        
        const stats = {
            totalActions: logs.length,
            byType: {},
            recent: logs.slice(0, 10)
        };
        
        for (const log of logs) {
            stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
        }
        
        return stats;
    }

    formatDuration(ms) {
        if (!ms) return 'Permanent';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        
        const parts = [];
        if (weeks > 0) parts.push(`${weeks}w`);
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 && parts.length === 0) parts.push(`${seconds}s`);
        
        return parts.join(' ');
    }

    parseDuration(durationStr) {
        const regex = /^(\d+)([smhdw])$/i;
        const match = durationStr.match(regex);
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        const multipliers = {
            s: 1000,
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
            w: 7 * 24 * 60 * 60 * 1000
        };
        
        return value * multipliers[unit];
    }
}

export const voiceModerationSystem = new voiceModeration();
