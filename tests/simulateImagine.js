import { handleImagine } from '../src/commands/imagineCommand.js';
import { imageGenerator } from '../src/imageGenerator.js';
import dotenv from 'dotenv';
dotenv.config();

// Mock Discord Message
const mockMessage = {
    content: '!imagine a futuristic city',
    author: { id: '12345', tag: 'TestUser#0001' },
    channel: {
        send: async (text) => {
            console.log(`[Mock Channel Send]: ${JSON.stringify(text)}`);
            return {
                edit: async (newText) => console.log(`[Mock Message Edit]: ${JSON.stringify(newText)}`),
                delete: async () => console.log(`[Mock Message Delete]`)
            };
        }
    },
    reply: async (text) => {
        console.log(`[Mock Message Reply]: ${JSON.stringify(text)}`);
        return {
            edit: async (newText) => console.log(`[Mock Message Edit]: ${JSON.stringify(newText)}`),
            delete: async () => console.log(`[Mock Message Delete]`)
        };
    }
};

async function runSimulation() {
    console.log('🚀 Starting !imagine Simulation...');

    try {
        await imageGenerator.login();
        console.log('✅ Sogni Logged In');

        await handleImagine(mockMessage);
        console.log('🏁 Simulation Finished');
    } catch (error) {
        console.error('❌ Simulation Failed:');
        console.error(error);
    } finally {
        setTimeout(() => {
            process.exit();
        }, 2000);
    }
}

runSimulation();
