/**
 * Shared Config Layer
 * Reads existing .env + adds new keys with defaults.
 * Does NOT replace src/config.js — legacy module continues to work.
 * @module packages/config
 */
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { SOGNI_MODELS } from './models.js';

dotenv.config();

/** @type {Record<string, any>} */
export const sharedConfig = {
    // ── Existing keys (preserved 1:1) ──────────────────────────────
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID || '',
        guildId: process.env.DISCORD_GUILD_ID || '',   // for dev-only guild deploy
        commandPrefix: process.env.COMMAND_PREFIX || '!',
    },

    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    },

    sogni: {
        username: process.env.SOGNI_USERNAME,
        password: process.env.SOGNI_PASSWORD,
        appId: process.env.APP_ID || 'BlockAerie Sketch',
        restEndpoint: process.env.REST_ENDPOINT || 'https://api.sogni.ai',
        socketEndpoint: process.env.SOCKET_ENDPOINT || 'wss://socket.sogni.ai',
        jsonRpcUrl: process.env.JSON_RPC_URL || 'https://base.publicnode.com',
    },

    // ── Model Library ──────────────────────────────────────────────
    models: SOGNI_MODELS,

    // ── New keys (with safe defaults) ──────────────────────────────
    sogniGen: {
        /** Default image model (respect user's existing env, or first in library) */
        defaultImageModel: process.env.IMAGE_MODEL_ID || process.env.SOGNI_DEFAULT_IMAGE_MODEL || SOGNI_MODELS.IMAGE[0].id,
        /** Default edit model */
        defaultEditModel: process.env.SOGNI_DEFAULT_EDIT_MODEL || SOGNI_MODELS.EDIT[0].id,
        /** Default video models by workflow */
        videoModels: {
            t2v: process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 't2v')?.id || SOGNI_MODELS.VIDEO[0].id,
            i2v: process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 'i2v')?.id || SOGNI_MODELS.VIDEO[0].id,
            s2v: process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 's2v')?.id || SOGNI_MODELS.VIDEO[0].id,
            'animate-move': process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 'animate')?.id || SOGNI_MODELS.VIDEO[0].id,
            'animate-replace': process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 'animate')?.id || SOGNI_MODELS.VIDEO[0].id,
        },
        defaultWidth: parseInt(process.env.SOGNI_DEFAULT_WIDTH) || 768,
        defaultHeight: parseInt(process.env.SOGNI_DEFAULT_HEIGHT) || 768,
        defaultCount: 1,
        defaultFps: 16,
        defaultDurationSec: 5,
        defaultImageTimeoutSec: 300,
        defaultVideoTimeoutSec: 900,
        seedStrategy: process.env.SOGNI_SEED_STRATEGY || 'prompt-hash',
    },

    memory: {
        /** Path to SQLite database for long-term memory */
        dbPath: process.env.MEMORY_DB_PATH || path.join(process.cwd(), 'data', 'memory.sqlite'),
        /** Short-term memory TTL in ms (default 30 min) */
        shortTermTtlMs: parseInt(process.env.MEMORY_SHORT_TERM_TTL_MS) || 30 * 60 * 1000,
    },

    scheduler: {
        /** Path to SQLite database for reminders */
        dbPath: process.env.SCHEDULER_DB_PATH || path.join(process.cwd(), 'data', 'reminders.sqlite'),
        /** Poll interval in ms */
        pollIntervalMs: parseInt(process.env.SCHEDULER_POLL_MS) || 15000,
    },

    bot: {
        sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS) || 300000,
        /** Per-user cooldown in ms between slash commands */
        cooldownMs: parseInt(process.env.USER_COOLDOWN_MS) || 3000,
    },

    security: {
        dmPolicy: process.env.DM_POLICY || 'pairing',
        adminUserIds: (process.env.ADMIN_USER_ID || '').split(',').filter(Boolean),
    },
};
