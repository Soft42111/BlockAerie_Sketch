import { GoogleGenAI } from '@google/genai';
import { config } from './src/config.js';

async function listModels() {
    try {
        const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
        console.log('🔍 Fetching available models for your NEW API key...');

        const modelsToTest = [
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite-preview-02-05',
            'gemini-1.5-flash',
            'gemini-2.0-flash-exp'
        ];

        for (const modelId of modelsToTest) {
            try {
                await ai.models.generateContent({
                    model: modelId,
                    contents: 'ping'
                });
                console.log(`✅ ${modelId}: AVAILABLE`);
            } catch (err) {
                console.log(`❌ ${modelId}: UNAVAILABLE (${err.message.substring(0, 50)}...)`);
            }
        }
    } catch (error) {
        console.error('Failed to diagnostic:', error);
    }
}

listModels();
