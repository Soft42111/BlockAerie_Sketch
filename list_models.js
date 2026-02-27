import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
    try {
        const response = await ai.models.list();
        console.log('--- Available Models ---');
        // Handle different response structures for v1beta / google-genai
        const models = response.models || response || [];

        if (Array.isArray(models)) {
            models.forEach(m => console.log(m.name));
        } else if (models && typeof models === 'object') {
            // Try to find an array property
            Object.values(models).forEach(v => {
                if (Array.isArray(v)) v.forEach(m => console.log(m.name || m));
            });
        }
        console.log('------------------------');
    } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
    }
}

listModels();
