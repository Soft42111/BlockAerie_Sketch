import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config.js';

/**
 * Create an embed for asking a question
 */
export function createQuestionEmbed(question, questionNumber, totalQuestions) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`Question ${questionNumber}/${totalQuestions}`)
        .setDescription(`${question.question}\n\n${question.description}`)
        .setFooter({ text: 'Type the number or name of your choice, or type your own custom answer' })
        .setTimestamp();

    return embed;
}

/**
 * Create an embed for the final generated prompt
 */
export function createPromptEmbed(prompt, userId, imageUrl = null) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✨ Your AI Image PFP is Ready!')
        .setDescription('Here is your generated PFP and the prompt used to create it.')
        .addFields({
            name: '📋 Generated Prompt',
            value: prompt.length > 1024 ? prompt.substring(0, 1021) + '...' : prompt,
        })
        .setFooter({ text: `Generated for ${userId} • BlockAerie Sketch` })
        .setTimestamp();

    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    return embed;
}

/**
 * Create an embed for errors
 */
export function createErrorEmbed(title = '❌ Error', errorMessage) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle(title)
        .setDescription(errorMessage)
        .setTimestamp();

    return embed;
}

/**
 * Create an embed for success messages
 */
export function createSuccessEmbed(title = '✅ Success', message) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle(title)
        .setDescription(message)
        .setTimestamp();

    return embed;
}

/**
 * Create an embed for warnings
 */
export function createWarningEmbed(warningMessage) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⚠️ Warning')
        .setDescription(warningMessage)
        .setTimestamp();

    return embed;
}

/**
 * Create an embed for info messages
 */
export function createInfoEmbed(title, description) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    return embed;
}

/**
 * Create a welcome embed for the generate-pfp command
 */
export function createWelcomeEmbed() {
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🦅 BlockAerie Sketch: Web3 PFP Architect')
        .setDescription(
            'Welcome! I\'ll help you create an amazing AI image prompt for your web3/NFT profile picture.\n\n' +
            'I\'ll ask you **4 quick questions** about your preferences, then generate a detailed prompt optimized for AI image generators.\n\n' +
            '**Let\'s get started!**'
        )
        .addFields(
            { name: '⏱️ Time Limit', value: 'You have 1 minute to answer each question', inline: true },
            { name: '🎯 Style', value: 'Web3 / NFT / Futuristic', inline: true }
        )
        .setFooter({ text: 'Type "cancel" at any time to stop' })
        .setTimestamp();

    return embed;
}


/**
 * Create an embed for chat responses (Neutral / Premium Style)
 */
export function createChatResponseEmbed(response, thoughts = null) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setAuthor({ name: 'Sketch Assistant', iconURL: 'https://cdn-icons-png.flaticon.com/512/3652/3652230.png' }) // Premium bot icon
        .setDescription(response)
        .setTimestamp();

    if (thoughts) {
        embed.addFields({
            name: '🧠 Thinking Process',
            value: thoughts.length > 1024 ? thoughts.substring(0, 1021) + '...' : thoughts,
        });
    }

    return embed;
}

/**
 * Create action buttons for chat response
 */
export function createChatActions() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('chat_imagine')
                .setLabel('🎨 Visualize This')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('chat_video')
                .setLabel('🎬 Animate')
                .setStyle(ButtonStyle.Secondary)
        );

    return row;
}

/**
 * Create an embed for pairing requests
 */
export function createPairingEmbed(userId, code) {
    const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('🛡️ Security: Pairing Required')
        .setDescription(
            `I haven't been paired with your account yet. To maintain high-quality service, I require a one-time authorization.\n\n` +
            `**Your Pairing Code:** \`${code}\`\n\n` +
            `Please send this code to a bot administrator to approve your access. Once approved, you can use all my features!`
        )
        .setFooter({ text: `User ID: ${userId}` })
        .setTimestamp();

    return embed;
}

/**
 * Format a long prompt for Discord (split if needed)
 */
export function formatPromptForDiscord(prompt) {
    const maxLength = 1024; // Discord embed field limit

    if (prompt.length <= maxLength) {
        return [prompt];
    }

    // Split into chunks
    const chunks = [];
    let currentChunk = '';
    const sentences = prompt.split('. ');

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxLength) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence + '. ';
        } else {
            currentChunk += sentence + '. ';
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}
