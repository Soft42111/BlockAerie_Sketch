import { geminiFallbackManager } from '../utils/geminiFallbackManager.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../utils/messageFormatter.js';

export async function handleModelStatus(message, args) {
    try {
        const modelStatus = geminiFallbackManager.getModelStatus();
        
        const embed = createInfoEmbed('🤖 Gemini Model Status', '**Current Model Availability:**\n\n');
        
        // Add model status to embed
        const allModels = Object.keys(modelStatus);
        const primaryModels = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash'];
        const fallbackModels = allModels.filter(m => !primaryModels.includes(m));
        
        let description = '### 🏆 Primary Models (High Quality)\n';
        
        for (const model of primaryModels) {
            const status = modelStatus[model];
            if (status) {
                const emoji = status.available ? '✅' : '❌';
                const cooldown = status.cooldownRemaining > 0 ? ` (${Math.round(status.cooldownRemaining/1000)}s cooldown)` : '';
                description += `${emoji} **${model}**${cooldown}\n`;
            }
        }
        
        description += '\n### 🔄 Fallback Models\n';
        
        for (const model of fallbackModels) {
            const status = modelStatus[model];
            if (status) {
                const emoji = status.available ? '✅' : '❌';
                const cooldown = status.cooldownRemaining > 0 ? ` (${Math.round(status.cooldownRemaining/1000)}s cooldown)` : '';
                description += `${emoji} **${model}**${cooldown}\n`;
            }
        }
        
        embed.setDescription(description);
        
        return await message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Model status check failed:', error);
        return await message.reply({ embeds: [createErrorEmbed('Status Check Failed', 'Unable to retrieve model status. Please try again later.')] });
    }
}