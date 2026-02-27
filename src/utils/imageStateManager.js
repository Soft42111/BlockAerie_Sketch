import fs from 'fs';
import path from 'path';

const MEMORY_DIR = path.join(process.cwd(), 'memory');
const IMAGE_STATE_FILE = path.join(MEMORY_DIR, 'image-states.json');

/**
 * Manages the state (seed, prompt) of bot-generated images.
 */
class ImageStateManager {
    constructor() {
        this.states = new Map();
        this.ensureMemoryDir();
        this.loadStates();
    }

    ensureMemoryDir() {
        if (!fs.existsSync(MEMORY_DIR)) {
            fs.mkdirSync(MEMORY_DIR, { recursive: true });
        }
    }

    loadStates() {
        try {
            if (fs.existsSync(IMAGE_STATE_FILE)) {
                const data = JSON.parse(fs.readFileSync(IMAGE_STATE_FILE, 'utf8'));
                // Limit to last 500 images to prevent bloat
                const entries = Object.entries(data).slice(-500);
                this.states = new Map(entries);
            }
        } catch (error) {
            console.error('[ImageState] Failed to load states:', error.message);
            this.states = new Map();
        }
    }

    saveStates() {
        try {
            const data = Object.fromEntries(this.states);
            fs.writeFileSync(IMAGE_STATE_FILE, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[ImageState] Failed to save states:', error.message);
        }
    }

    /**
     * Save state for a generated image URL
     */
    saveImageState(url, state) {
        if (!url) return;

        // Clean proxy URL if applicable (Discord adds proxy/params)
        const cleanUrl = url.split('?')[0];

        this.states.set(cleanUrl, {
            ...state,
            timestamp: Date.now()
        });

        // Maintain size
        if (this.states.size > 500) {
            const firstKey = this.states.keys().next().value;
            this.states.delete(firstKey);
        }

        this.saveStates();
    }

    /**
     * Get state for a given image URL
     */
    getImageState(url) {
        if (!url) return null;
        const cleanUrl = url.split('?')[0];
        return this.states.get(cleanUrl) || null;
    }

    /**
     * Wipe all stored image states (fresh start)
     */
    clearAllStates() {
        this.states.clear();
        if (fs.existsSync(IMAGE_STATE_FILE)) {
            try {
                fs.unlinkSync(IMAGE_STATE_FILE);
            } catch (e) {
                // Fallback to empty file if delete fails
                this.saveStates();
            }
        }
        console.log('[ImageState] All image states cleared.');
    }

    /**
     * Check if a URL belongs to a bot-generated image
     */
    isBotGenerated(url) {
        if (!url) return false;
        const cleanUrl = url.split('?')[0];
        return this.states.has(cleanUrl);
    }
}

export const imageStateManager = new ImageStateManager();
