import { geminiFallbackManager } from './src/utils/geminiFallbackManager.js';
import { config } from './src/config.js';
import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 Starting Gemini Connection Diagnostics...');
console.log(`🔑 API Key Configured: ${process.env.GEMINI_API_KEY ? 'Yes (starts with ' + process.env.GEMINI_API_KEY.substring(0, 4) + '...)' : 'No'}`);
console.log('📋 Loaded Models:', JSON.stringify(config.gemini, null, 2));

async function runTest() {
    console.log('\n--- 1. Testing Model Availability Logic ---');
    const status = geminiFallbackManager.getModelStatus();
    console.log('Initial Model Status:', status);

    console.log('\n--- 2. Attempting Generation (Simple Ping) ---');
    try {
        const { result, modelUsed } = await geminiFallbackManager.generateContent("Hello, are you online? Reply with 'Yes, I am functioning.'");
        console.log('✅ Generation SUCCESS!');
        console.log('Model Used:', modelUsed);

        // Defensive text extraction
        let responseText = '';
        if (typeof result === 'string') {
            responseText = result;
        } else if (result?.text) {
            responseText = result.text;
        } else if (result?.response?.text) {
            responseText = result.response.text;
        } else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            responseText = result.candidates[0].content.parts[0].text;
        } else {
            console.error('Could not extract text from result. Keys:', Object.keys(result));
            responseText = '[Unable to extract text]';
        }
        console.log('Response:', responseText);
    } catch (error) {
        console.error('❌ Generation FAILED');
        console.error('Error Message:', error.message);
        console.error('Full Error:', error);
    }

    console.log('\n--- 3. Testing Fallback Logic (Simulating Failure) ---');
    // Force fail the first model to test fallback
    if (config.gemini.primaryModels.length > 0) {
        const firstModel = config.gemini.primaryModels[0];
        console.log(`Forcing simulated failure on ${firstModel}...`);
        geminiFallbackManager.markModelFailed(firstModel);

        try {
            console.log('Attempting second generation...');
            const result = await geminiFallbackManager.generateContent("This is a fallback test.");
            console.log('✅ Fallback Generation SUCCESS!');
            console.log('Model Used:', result.modelUsed);
        } catch (error) {
            console.error('❌ Fallback Generation FAILED');
            console.error('Error:', error.message);
        }
    }
}

runTest().catch(console.error);
