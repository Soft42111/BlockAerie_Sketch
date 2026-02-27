import { imageGenerator } from '../src/imageGenerator.js';
import dotenv from 'dotenv';
dotenv.config();

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

async function testSogni() {
    console.log('🚀 Starting Sogni SDK Verification...');

    try {
        console.log('1. Attempting login...');
        const loginSuccess = await imageGenerator.login((status) => console.log(`   [Status] ${status}`));

        if (loginSuccess) {
            console.log('✅ Login Successful!');

            console.log('2. Attempting a simple image generation...');
            const prompt = 'A small cute robot painting a landscape';
            const imageUrl = await imageGenerator.generateImage(prompt, (status) => console.log(`   [Status] ${status}`));

            if (imageUrl) {
                console.log('✅ Image Generated Successfully!');
                console.log('🔗 URL:', imageUrl.url || imageUrl);
                import('fs').then(fs => fs.writeFileSync('verify_result.txt', imageUrl.url || imageUrl));
            } else {
                console.log('❌ Image generation returned empty URL.');
            }
        } else {
            console.error('❌ Login failed without throwing error.');
        }
    } catch (error) {
        console.error('❌ Verification failed:');
        console.error(error);
    } finally {
        setTimeout(async () => {
            if (imageGenerator.client && imageGenerator.client.isConnected()) {
                console.log('Cleaning up connection...');
                try {
                    await imageGenerator.client.disconnect();
                } catch (e) { }
            }
            console.log('Exiting...');
            process.exit();
        }, 2000);
    }
}

testSogni();
