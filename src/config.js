import dotenv from 'dotenv';
import { SOGNI_MODELS } from '../packages/config/models.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'GEMINI_API_KEY', 'SOGNI_USERNAME', 'SOGNI_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please create a .env file based on .env.example');
    process.exit(1);
}

export const config = {
    // Bot Information
    botName: 'BlockAerie Sketch',

    // Discord Configuration
    discord: {
        token: process.env.DISCORD_TOKEN,
        commandPrefix: process.env.COMMAND_PREFIX || '!',
    },

    // Gemini AI Configuration
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-2.5-flash',
        // Primary models
        primaryModels: [
            'gemini-2.5-flash',
            'gemini-flash-latest',
            'gemini-2.0-flash-lite-001',
        ],
        // Fallback models
        fallbackModels: [
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash',
        ],
    },

    // Sogni Configuration
    sogni: {
        username: process.env.SOGNI_USERNAME,
        password: process.env.SOGNI_PASSWORD,
        appId: process.env.APP_ID || 'BlockAerie Sketch',
        restEndpoint: process.env.REST_ENDPOINT || 'https://api.sogni.ai',
        socketEndpoint: process.env.SOCKET_ENDPOINT || 'wss://socket.sogni.ai',
        jsonRpcUrl: process.env.JSON_RPC_URL || 'https://base.publicnode.com',
    },

    // Centralized Models (Synced with Model Library)
    models: {
        library: SOGNI_MODELS,
        default: process.env.IMAGE_MODEL_ID || SOGNI_MODELS.IMAGE[0].id,
        image: SOGNI_MODELS.IMAGE.reduce((acc, m) => {
            acc[m.id] = { name: m.name, id: m.id };
            return acc;
        }, {}),
        image2image: SOGNI_MODELS.EDIT.reduce((acc, m) => {
            acc[m.id] = { name: m.name, id: m.id };
            return acc;
        }, {}),
        video: {
            't2v': process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 't2v')?.id || SOGNI_MODELS.VIDEO[0].id,
            'i2v': process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 'i2v')?.id || SOGNI_MODELS.VIDEO[0].id,
            's2v': process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 's2v')?.id || SOGNI_MODELS.VIDEO[0].id,
            'animate-move': process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 'animate')?.id || SOGNI_MODELS.VIDEO[0].id,
            'animate-replace': process.env.VIDEO_MODEL_ID || SOGNI_MODELS.VIDEO.find(m => m.workflow === 'animate')?.id || SOGNI_MODELS.VIDEO[0].id
        },
        constraints: {
            minVideoDimension: 480,
            maxVideoDimension: 1536,
            videoDimensionMultiple: 16
        },
        defaults: {
            seedStrategy: process.env.SOGNI_SEED_STRATEGY || 'prompt-hash',
            defaultWidth: parseInt(process.env.SOGNI_DEFAULT_WIDTH) || 768,
            defaultHeight: parseInt(process.env.SOGNI_DEFAULT_HEIGHT) || 768,
            defaultVideoWorkflow: 't2v',
            defaultImageTimeoutSec: 120,
            defaultVideoTimeoutSec: 600
        }
    },

    // Bot Settings
    bot: {
        sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS) || 300000,
        collectorTimeoutMs: 60000,
    },

    // Security Settings
    security: {
        dmPolicy: process.env.DM_POLICY || 'pairing',
        adminUserId: process.env.ADMIN_USER_ID,
        moderationEnabled: true,
    },

    // Anti-Spam (preservining existing logic)
    antispam: {
        enabled: true,
        messagesPerSecond: 3,
        messagesPerMinute: 20,
        cooldownMs: 1000,
        duplicateThreshold: 3,
        duplicateWindowMs: 5000,
        mentionThreshold: 5,
        linkThreshold: 3,
        emojiThreshold: 8,
        strikeThreshold: 5,
        strikeDecayMinutes: 60,
        autoStrikeIncrease: true,
        ignoredChannels: [],
        ignoredRoles: [],
        ignoredUsers: [],
        bypassAdmin: true
    },

    antiraid: {
        enabled: true,
        joinsPerMinute: 10,
        newAccountDays: 7,
        raidModeActivationThreshold: 15,
        autoLockdownThreshold: 25,
        lockdownDurationMinutes: 30,
        suspiciousPatterns: {
            names: [
                /^[a-z]{1,3}\d{3,}$/i,
                /^[a-z]{5,}\d{5,}$/i,
                /^(giveaway|winner|prize|nitro|free|gift)\d*$/i,
                /^\w{1,3}\w*\d{5,}$/i
            ],
            avatars: {
                defaultOnly: true,
                recentlyChanged: true
            }
        },
        raidRoles: ['raid', 'locked'],
        alertWebhookUrl: null,
        modChannelId: null,
        graduatedResponse: {
            level1: { joinsPerMinute: 10, action: 'verify' },
            level2: { joinsPerMinute: 15, action: 'captcha' },
            level3: { joinsPerMinute: 20, action: 'lockdown' },
            level4: { joinsPerMinute: 25, action: 'ban' }
        }
    },

    // Embed Colors
    colors: {
        primary: 0x00D9FF,
        success: 0x00FF88,
        error: 0xFF0055,
        warning: 0xFFAA00,
        info: 0x8B5CF6,
    },
};
