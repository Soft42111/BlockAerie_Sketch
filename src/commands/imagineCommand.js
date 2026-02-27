import { imageGenerator } from '../imageGenerator.js';
import { logError, logSuccess, logInfo, logWarning } from '../utils/errorHandler.js';
import { generateDirectPrompt } from '../promptGenerator.js';
import { imageStateManager } from '../utils/imageStateManager.js';

// Storage for channel-level context (seed and prompt) for consistency
const channelContext = new Map();

/**
 * Handle the !imagine command - direct image generation without Gemini
 */
export async function handleImagine(message) {
    const content = message.content.trim();

    // Extract prompt after !imagine or !img
    const imagineMatch = content.match(/^!(?:imagine|img)\s+(.+)$/i);

    if (!imagineMatch || !imagineMatch[1]) {
        return message.reply('🎨 **Usage:** `!imagine <your prompt>`\n\nExample: `!imagine a futuristic city at sunset`');
    }

    const userPrompt = imagineMatch[1].trim();

    if (!userPrompt) {
        return message.reply('⚠️ **Error:** Please provide a prompt for image generation.');
    }

    const statusMsg = await message.reply(`🎨 **Architecting Visual Mastery...**`);

    try {
        // Quality mode detection for feedback
        const lowerPrompt = userPrompt.toLowerCase();
        const isProMode = ['ultra', 'pro', 'expert', 'epic', 'masterpiece', 'hyper', 'realistic'].some(kw => lowerPrompt.includes(kw));

        // Enhance the prompt using Gemini (Aesthetic Architect)
        const prompt = await generateDirectPrompt(userPrompt);
        logInfo(`Direct imagine command enhanced: "${userPrompt}" -> "${prompt}"`);

        await statusMsg.edit(`🎨 **${isProMode ? '🚀 PRO MODE:' : '✨'} Generating:** \`${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}\`...`);

        const result = await imageGenerator.generateImage(prompt, (status) => {
            statusMsg.edit(`🎨 **Processing:** ${status}`).catch(() => { });
        });

        // Store the context (seed AND full prompt) for this channel
        channelContext.set(message.channel.id, {
            seed: result.seed,
            prompt: prompt
        });

        // Save to global image state manager for future edits
        imageStateManager.saveImageState(result.url, {
            seed: result.seed,
            prompt: prompt,
            modelId: result.modelId
        });

        // Discord limit is 2000 chars. Let's be safe.
        const displayPrompt = userPrompt.length > 1000 ? userPrompt.substring(0, 997) + '...' : userPrompt;

        logInfo('Imagine command: Generation finished, starting delivery...');

        // 1. Reply with prompt
        logInfo('Sending prompt reply...');
        await message.reply({
            content: `✅ **Generated${isProMode ? ' (Pro Mode)' : ''}:** \`${displayPrompt}\``
        });
        logInfo('Prompt reply sent.');

        // 2. Send image separately
        logInfo(`Sending image file from URL: ${result.url}`);
        await message.channel.send({
            files: [result.url]
        });
        logInfo('Image file sent.');

        await statusMsg.delete().catch(() => { });
        logSuccess(`Successfully generated and delivered image for imagine command: "${prompt}"`);

    } catch (err) {
        logError('Imagine command failed', err);
        await statusMsg.edit(`❌ Generation failed: ${err.message}`);
    }
}

/**
 * Helper to find attachments for image-to-image (referenced messages)
 */
const getAttachment = async (msg) => {
    // Check current message
    let attachment = msg.attachments.first();
    if (attachment) return attachment;

    // Check referenced message (reply)
    if (msg.reference) {
        const refMsg = await msg.fetchReference().catch(() => null);
        attachment = refMsg?.attachments.first();
        if (attachment) return attachment;
    }

    return attachment;
};