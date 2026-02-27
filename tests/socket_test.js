
import { SogniClient } from '@sogni-ai/sogni-client';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
    console.log('🧪 Testing Disable WebSocket');

    const config = {
        appId: process.env.APP_ID,
        network: 'fast',
        restEndpoint: 'https://api.sogni.ai',
        // Test 3: socketEndpoint: "" - empty string
        socketEndpoint: "",
    };

    try {
        console.log('1. Creating Client with socketEndpoint: null');
        const client = await SogniClient.createInstance(config);
        console.log('✅ Client created!');
        if (client.apiClient && client.apiClient.socket) {
            console.log('⚠️ Warning: Socket object still exists:', !!client.apiClient.socket);
        } else {
            console.log('✅ Socket appears disabled.');
        }

    } catch (error) {
        console.error('❌ Failed with null:', error.message);
    }
}

runTest();
