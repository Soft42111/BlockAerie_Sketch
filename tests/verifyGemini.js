import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function testGemini() {
    console.log('🚀 Testing Gemini AI Connection...');
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    console.log(`Using Model: ${modelName}`);

    try {
        const ai = new GoogleGenAI({ apiKey });

        console.log('Sending test message...');
        const result = await ai.models.generateContent({
            model: modelName,
            contents: 'Say "Gemini is online!" if you can hear me.'
        });
        console.log('✅ Response:', result.text);

        console.log('Testing chat mode...');
        const chat = ai.chats.start({
            model: modelName,
            history: []
        });
        const chatResult = await chat.sendMessage('Hello! How are you?');
        console.log('✅ Chat Response:', chatResult.text);

    } catch (error) {
        console.error('❌ Gemini Test Failed:');
        if (error.status) console.error(`Status: ${error.status}`);
        if (error.statusText) console.error(`Status Text: ${error.statusText}`);
        console.error(error);
    } finally {
        process.exit();
    }
}

testGemini();
