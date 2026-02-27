import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

export async function testGeminiConnection() {
    console.log('🔍 Testing Gemini API connection...');

    try {
        const modelTarget = config.gemini.model || 'gemini-2.5-flash-lite';
        const result = await ai.models.generateContent({
            model: modelTarget,
            contents: 'Say "Hello" if you can read this.'
        });

        // Defensive text extraction - try multiple access patterns
        let response = '';
        if (typeof result === 'string') {
            response = result;
        } else if (result?.text) {
            response = result.text;
        } else if (result?.response?.text) {
            response = result.response.text;
        } else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            response = result.candidates[0].content.parts[0].text;
        } else {
            console.error('❌ Could not extract text from result. Keys:', Object.keys(result));
            return false;
        }

        console.log('✅ Basic connection works:', response);
        return true;
    } catch (error) {
        console.error('❌ Basic connection failed:', error.message);
        if (error.message?.includes('429') || error.message?.includes('quota')) {
            console.error('💡 Tip: Rate limited. Wait 60s and retry.');
        } else if (error.message?.includes('404') || error.message?.includes('not found')) {
            console.error('💡 Tip: Model not found. Check available models at https://ai.google.dev/gemini-api/docs/models');
        }
        return false;
    }
}

export async function testModel(modelName) {
    console.log(`🔍 Testing model: ${modelName}`);

    try {
        const result = await ai.models.generateContent({
            model: modelName,
            contents: 'Test message'
        });

        // Defensive text extraction
        let response = '';
        if (typeof result === 'string') {
            response = result;
        } else if (result?.text) {
            response = result.text;
        } else if (result?.response?.text) {
            response = result.response.text;
        } else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            response = result.candidates[0].content.parts[0].text;
        } else {
            console.error(`❌ ${modelName}: Could not extract text from result`);
            return false;
        }

        console.log(`✅ ${modelName} works:`, response.substring(0, 50));
        return true;
    } catch (error) {
        console.error(`❌ ${modelName} failed:`, error.message);
        return false;
    }
}