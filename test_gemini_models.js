import { GoogleGenAI } from '@google/genai';
import { config } from './src/config.js';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function checkModels() {
    console.log('--- Listing Models ---');
    try {
        const response = await ai.models.list();
        console.log('Available models:');
        response.models.forEach(m => console.log(`- ${m.name}`));
    } catch (err) {
        console.log(`❌ Failed to list models: ${err.message}`);
    }

    console.log('\n--- Testing Model Access ---');
    const modelsToTest = [
        'gemini-2.0-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-002',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash',
        'gemini-1.5-pro'
    ];

    for (const model of modelsToTest) {
        try {
            console.log(`\nTesting: ${model}...`);
            const result = await ai.models.generateContent({
                model: model,
                contents: [{ role: 'user', parts: [{ text: 'Hi' }] }]
            });
            console.log(`✅ Success for ${model}`);
        } catch (err) {
            console.log(`❌ Failed for ${model}: ${err.message}`);
        }
    }
}

checkModels();
