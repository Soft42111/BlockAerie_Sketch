import { stateManager } from '../stateManager.js';
import { questions, formatOptions, parseResponse } from '../questionFlow.js';
import { generatePrompt } from '../promptGenerator.js';
import { imageGenerator } from '../imageGenerator.js';
import { config } from '../config.js';
import {
    createWelcomeEmbed,
    createQuestionEmbed,
    createPromptEmbed,
    createErrorEmbed,
    createWarningEmbed,
    formatPromptForDiscord,
} from '../utils/messageFormatter.js';
import { handleError, logInfo, logSuccess, logError, logWarning } from '../utils/errorHandler.js';
import { securityManager } from '../utils/securityManager.js';
import { imageStateManager } from '../utils/imageStateManager.js';

/**
 * Handle the !generate-pfp command
 */
export async function handleGeneratePfp(message) {
    const userId = message.author.id;
    const channelId = message.channel.id;

    // Check if user already has an active session
    if (stateManager.hasSession(userId)) {
        const warningEmbed = createWarningEmbed(
            'You already have an active prompt generation session! Please complete it first or wait for it to timeout.'
        );
        return message.reply({ embeds: [warningEmbed] });
    }

    // Create new session
    stateManager.createSession(userId, channelId);
    logInfo(`Started new session for user ${userId}`);

    // Send welcome message
    const welcomeEmbed = createWelcomeEmbed();
    await message.reply({ embeds: [welcomeEmbed] });

    // Start the question flow
    await askNextQuestion(message, userId);
}

/**
 * Ask the next question in the flow
 */
async function askNextQuestion(message, userId) {
    const session = stateManager.getSession(userId);
    if (!session) return;

    const questionIndex = session.currentQuestionIndex;

    // Check if we've completed all questions
    if (questionIndex >= questions.length) {
        await generateAndSendPrompt(message, userId);
        return;
    }

    // [Fix] Stop any existing collector for this session to prevent zombies
    if (session.collector) {
        session.collector.stop('override');
        session.collector = null;
    }

    const question = questions[questionIndex];
    const questionEmbed = createQuestionEmbed(question, questionIndex + 1, questions.length);

    // Add options to the embed
    const optionsText = formatOptions(question);
    questionEmbed.addFields({ name: 'Options', value: optionsText });

    await message.channel.send({ embeds: [questionEmbed] });

    // Set up message collector for user response
    const filter = (m) => m.author.id === userId;
    const collector = message.channel.createMessageCollector({
        filter,
        time: config.bot.collectorTimeoutMs,
        max: 1,
    });

    // Save collector to session so we can kill it later if needed
    session.collector = collector;

    collector.on('collect', async (response) => {
        const userInput = response.content;

        // Remove collector ref since it's done collecting
        session.collector = null;

        // Check for cancel command
        const lowInput = userInput.toLowerCase();
        if (lowInput === 'cancel' || lowInput === `${config.discord.commandPrefix}cancel`) {
            stateManager.deleteSession(userId);
            const cancelEmbed = createWarningEmbed('Prompt generation cancelled. Run `!generate-pfp` to start again.');
            await message.channel.send({ embeds: [cancelEmbed] });
            return;
        }

        // Parse the response
        const parsedValue = parseResponse(question, userInput);

        if (!parsedValue && !question.optional) {
            const errorEmbed = createErrorEmbed(
                'Invalid response. Please choose a number from the options or type your custom answer.'
            );
            await message.channel.send({ embeds: [errorEmbed] });

            // CRITICAL: Stop the current collector before starting a new one to prevent "multiple messages" looping
            // (Already stopped by max:1 but explicitly good for safety)
            collector.stop('invalid_input');

            // Ask the same question again
            await askNextQuestion(message, userId);
            return;
        }

        // [New] Moderation Check for custom answers
        if (!question.options.find(o => o.value === parsedValue)) {
            const safety = await securityManager.isContentSafe(parsedValue);
            if (!safety.safe) {
                const safetyEmbed = createErrorEmbed(`⚠️ **Policy Violation:** Your custom input triggered my safety filters: *${safety.reason}*\nPlease try a different description.`);
                await message.channel.send({ embeds: [safetyEmbed] });
                await askNextQuestion(message, userId);
                return;
            }
        }

        // Save the answer
        stateManager.updateSession(userId, question.id, parsedValue || 'none');

        // [New] Interactive Feedback
        const matchedOpt = question.options.find(o => o.value === parsedValue);
        const feedbackText = matchedOpt
            ? `Got it! **${question.id === 'extraDetails' ? 'Custom details' : matchedOpt.label}** set ${matchedOpt.emoji || '✅'}`
            : `Got it! Custom preference saved: **${parsedValue}** ✅`;

        await response.reply(feedbackText);

        // Stop current collector before moving to next question (redundant due to max:1 but safe)
        collector.stop('valid_input');

        // Ask next question
        await askNextQuestion(message, userId);
    });

    collector.on('end', (collected, reason) => {
        // If we finished because of time, but session still exists, it means the user ignored the prompt
        if (reason === 'time' && stateManager.hasSession(userId)) {
            stateManager.deleteSession(userId);
            const timeoutEmbed = createErrorEmbed(
                'Session timed out due to inactivity. Run `!generate-pfp` to start again.'
            );
            message.channel.send({ embeds: [timeoutEmbed] }).catch(() => { });
        }
    });
}

/**
 * Generate the final prompt and send it to the user
 */
async function generateAndSendPrompt(message, userId) {
    try {
        const answers = stateManager.getAnswers(userId);
        if (!answers) throw new Error('No answers found for user');

        // [LOCK] Prevent duplicate generation for this session
        const session = stateManager.getSession(userId);
        if (session.isGenerating) {
            logWarning(`Duplicate generation prevented for user ${userId}`);
            return;
        }
        session.isGenerating = true;

        logInfo(`Generating prompt for user ${userId}`, answers);

        // Send "generating" message
        const generatingMessage = await message.channel.send('⚙️ **Initialize:** Generating your AI image prompt... ✨');

        // Generate the prompt using Gemini AI
        const prompt = await generatePrompt(answers);
        await generatingMessage.edit('✅ **Step 1:** AI Image Prompt generated!');

        // Format the final prompt
        const promptChunks = formatPromptForDiscord(prompt);

        if (promptChunks.length === 1) {
            const promptEmbed = createPromptEmbed(prompt, message.author.tag, null); // No image in main embed at this stage
            await message.channel.send({ embeds: [promptEmbed] });
        } else {
            // Send in multiple messages if too long
            await message.channel.send('✨ **Your Web3 PFP Prompt is Ready!**\n\n📋 **Generated Prompt:**');
            for (const chunk of promptChunks) {
                await message.channel.send(`\`\`\`${chunk}\`\`\``);
            }
        }

        // Update generating message for image generation
        await generatingMessage.edit('⚡ **Step 2:** Connecting to Sogni AI Supernet... ⚡');

        // Generate the image using Sogni AI
        let imageResult = null;
        try {
            imageResult = await imageGenerator.generateImage(prompt, (status) => {
                generatingMessage.edit(`🖼️ **Step 2.5:** ${status}... ⚡`).catch(() => { });
            }, null, null, true); // preserveUserPrompt = true
        } catch (imgError) {
            logError('Failed to generate image', imgError);
            await generatingMessage.edit(`❌ **Error:** ${imgError.message || 'Image generation failed'}`).catch(() => { });
            await message.channel.send('⚠️ **Notice:** Sogni AI Supernet is busy. You can still use the prompt above manually.');
        }

        // Delete the "generating" message quickly once finished
        if (generatingMessage) {
            setTimeout(() => {
                generatingMessage.delete().catch(() => { });
            }, 2000);
        }

        // Send image in a clean separate message (Sticker Bot Style)
        if (imageResult && imageResult.url) {
            logInfo(`Sending image to Discord. URL: ${imageResult.url}`);
            try {
                // Already sending as a separate message, just adding a small spacer/header if needed or keeping as is for "Sticker Bot Style"
                await message.channel.send({
                    content: '✨ **Final Web3 PFP:**',
                    files: [imageResult.url]
                });
            } catch (deliveryErr) {
                logError('PFP image delivery failed, trying fallback', deliveryErr.message);
                await message.channel.send(`✨ **Final Web3 PFP:** ${imageResult.url}`);
            }

            // Save state for future edits
            imageStateManager.saveImageState(imageResult.url, {
                seed: imageResult.seed,
                prompt: prompt,
                modelId: imageResult.modelId
            });

            logSuccess(`Successfully generated prompt and image for user ${userId}`);
        } else {
            logWarning('No image URL returned from generator, skipping attachment.');
            logInfo(`Finished prompt generation for user ${userId} (No image generated)`);
        }

        // Clean up session
        stateManager.deleteSession(userId);

    } catch (error) {
        // Log the full error for better debugging on Railway
        logError('Error in generateAndSendPrompt flow', error);

        const errorMessage = handleError(error, 'generateAndSendPrompt');
        const errorEmbed = createErrorEmbed(errorMessage);
        await message.channel.send({ embeds: [errorEmbed] });

        // Clean up session
        stateManager.deleteSession(userId);
    }
}
