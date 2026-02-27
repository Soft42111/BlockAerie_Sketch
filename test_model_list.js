import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
    console.log('Fetching available models...');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const modelsToTry = ['gemini-pro', 'gemini-1.0-pro', 'gemini-1.5-flash-latest'];

    for (const modelName of modelsToTry) {
        try {
            console.log(`Testing ${modelName}...`);
            const result = await ai.models.generateContent({
                model: modelName,
                contents: 'test'
            });
            console.log(`✅ ${modelName} worked!`);
        } catch (error) {
            console.error(`❌ ${modelName} failed:`, error.message);
        }
    }
}

listModels();
