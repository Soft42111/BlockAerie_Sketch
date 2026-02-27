/**
 * Question flow configuration for PFP prompt generation
 * Each question defines the options and how to collect user input
 */

export const questions = [
    {
        id: 'avatarType',
        question: '🎭 **What type of avatar do you want?**',
        description: 'Choose the gender or avatar type for your PFP',
        options: [
            { emoji: '👨', label: 'Male', value: 'male' },
            { emoji: '👩', label: 'Female', value: 'female' },
            { emoji: '🤖', label: 'AI Entity', value: 'ai-entity' },
            { emoji: '🦾', label: 'Cyborg', value: 'cyborg' },
            { emoji: '👾', label: 'Non-human', value: 'non-human' },
            { emoji: '✨', label: 'Abstract', value: 'abstract' },
            { emoji: '💎', label: 'Digital Being', value: 'digital-being' },
        ],
        allowCustom: true,
    },
    {
        id: 'visualStyle',
        question: '🎨 **What visual style do you prefer?**',
        description: 'Select the aesthetic for your PFP',
        options: [
            { emoji: '🌃', label: 'Cyberpunk', value: 'cyberpunk' },
            { emoji: '🔮', label: 'Futuristic Minimal', value: 'futuristic-minimal' },
            { emoji: '💼', label: 'Web3 Founder Vibe', value: 'web3-founder' },
            { emoji: '🖼️', label: 'NFT Art', value: 'nft-art' },
            { emoji: '⚡', label: 'Anime Tech', value: 'anime-tech' },
            { emoji: '📸', label: 'Hyper-realistic', value: 'hyper-realistic' },
            { emoji: '🌈', label: 'Abstract Neon', value: 'abstract-neon' },
            { emoji: '🌊', label: 'Vaporwave', value: 'vaporwave' },
            { emoji: '📺', label: 'Glitch Art', value: 'glitch-art' },
        ],
        allowCustom: true,
    },
    {
        id: 'mood',
        question: '😎 **What mood and personality should it convey?**',
        description: 'Choose the vibe and energy',
        options: [
            { emoji: '👑', label: 'Dominant', value: 'dominant' },
            { emoji: '🧘', label: 'Calm', value: 'calm' },
            { emoji: '🕵️', label: 'Mysterious', value: 'mysterious' },
            { emoji: '💪', label: 'Confident', value: 'confident' },
            { emoji: '🔥', label: 'Rebellious', value: 'rebellious' },
            { emoji: '🚀', label: 'Visionary', value: 'visionary' },
            { emoji: '🌟', label: 'Ethereal', value: 'ethereal' },
            { emoji: '⚔️', label: 'Powerful', value: 'powerful' },
        ],
        allowCustom: true,
    },
    {
        id: 'extraDetails',
        question: '🎯 **Custom Instructions or Steps?**',
        description: 'Type your custom instructions directly below, or choose skip.',
        options: [
            { emoji: '⏭️', label: 'Skip custom steps', value: 'none' },
        ],
        allowCustom: true,
        optional: true,
    },
];

/**
 * Format options for display in Discord message
 */
export function formatOptions(question) {
    return question.options
        .map((opt, index) => `${opt.emoji} **${index + 1}.** ${opt.label}`)
        .join('\n');
}

/**
 * Parse user response to get the selected value
 */
export function parseResponse(question, userInput) {
    const input = userInput.trim().toLowerCase();

    // Check if it's a number selection
    const optionIndex = parseInt(input) - 1;
    if (optionIndex >= 0 && optionIndex < question.options.length) {
        return question.options[optionIndex].value;
    }

    // Check if it matches an option label
    const matchedOption = question.options.find(
        opt => opt.label.toLowerCase() === input || opt.value.toLowerCase() === input
    );
    if (matchedOption) {
        return matchedOption.value;
    }

    // If custom input is allowed, return the raw input
    if (question.allowCustom && input.length > 0) {
        return userInput.trim();
    }

    return null;
}
