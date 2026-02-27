import { config } from './config.js';
import { geminiFallbackManager } from './utils/geminiFallbackManager.js';

const ARCHITECTURAL_DIRECTIVES = `
### YOUR ARCHITECTURAL PROCESS:
1. **The Subject**: Describe the subject with anatomical precision. Define materials, surfaces, and intricate details (e.g., "cyber-kinetic mesh", "etched carbon fiber", "translucent porcelain skin").
2. **The Atmosphere (Atmospherics)**: Layer the scene with complex lighting. Use terms like "volumetric global illumination", "God rays", "bicolor rim lighting", "dynamic subsurface scattering", and "cinematic haze".
3. **The Composition**: Define the lens and frame. (e.g., "70mm anamorphic lens", "extremely shallow depth of field", "razor-sharp micro-focus on eyes", "dynamic low-angle heroic perspective").
4. **The Rendering**: Ingest high-end computer graphics tokens: "Octane Render", "Unreal Engine 5.4 Raytracing", "Physically Based Rendering (PBR)", "8k UHD resolution", "highly intricate textures".
5. **The NFT/PFP Vibe**: Infuse a modern Web3/Digital Art aesthetic: "trending on ArtStation", "Hypebeast high-fashion techwear", "holographic neon accents", "block-chain inspired geometric patterns".

### OUTPUT RESTRAINTS:
- provide ONLY the final, ultra-dense, hyper-technical descriptive paragraph.
- NO headers, NO preambles, NO lists, NO formatting symbols.
- AIM FOR EXTREME DEPTH (Minimum 150-200 technical tokens).
- Every single word must contribute to visual excellence.
`;

/**
 * Generate AI image prompt using CRISPE framework
 * @param {Object} answers - User's answers from the question flow
 * @returns {Promise<string>} - Generated prompt
 */
export async function generatePrompt(answers) {
    const { avatarType, visualStyle, mood, extraDetails } = answers;

    const instruction = `You are an Elite Aesthetic Architect and Master of Visual Arts. 
Your goal is to transform user selections into a Masterpiece-Tier technical image prompt for high-end Web3/NFT Profile Pictures (PFP). 
Your prompts are legendary for their depth, technical precision, and stunning visual appeal.

### SOURCE PARAMETERS:
- **Subject/Type**: ${avatarType}
- **Aesthetic Direction**: ${visualStyle}
- **Emotional Signature**: ${mood}
- **Custom Directives**: ${extraDetails && extraDetails !== 'none' ? extraDetails : 'Unspecified'}

${ARCHITECTURAL_DIRECTIVES}

CONSTRUCT ELITE IMAGE PROMPT NOW:`;

    try {
        const { result, modelUsed } = await geminiFallbackManager.generateContent(instruction);
        console.log(`[PromptGenerator] Generated using model: ${modelUsed}`);

        let generatedPrompt = '';
        if (typeof result === 'string') {
            generatedPrompt = result;
        } else if (result?.text) {
            generatedPrompt = result.text;
        } else if (result?.response?.text) {
            generatedPrompt = result.response.text();
        } else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            generatedPrompt = result.candidates[0].content.parts[0].text;
        }

        return (generatedPrompt || '').trim();
    } catch (error) {
        console.error('Error generating prompt with Gemini:', error);

        // Fallback: Generate a basic prompt without AI
        return generateFallbackPrompt(answers);
    }
}

/**
 * Fallback prompt generator (if Gemini API fails)
 */
function generateFallbackPrompt(answers) {
    const { avatarType, visualStyle, mood, extraDetails } = answers;

    return `Professional ${avatarType} portrait, ${visualStyle} aesthetic, ${mood} personality, web3 founder vibe, NFT art style, ultra-detailed 8K resolution, cinematic lighting, neon accents, holographic elements, sharp focus, digital art masterpiece, futuristic background, blockchain-inspired design, metaverse-ready avatar, vibrant colors, high contrast, professional photography quality, no blur, crystal clear details${extraDetails && extraDetails !== 'none' ? `, ${extraDetails}` : ''}, trending on ArtStation, award-winning digital art`;
}

/**
 * Generate minimal prompt for direct user requests (preserves intent)
 * @param {string} userPrompt - Direct user prompt
 * @returns {Promise<string>} - Minimally modified prompt
 */
export async function generateDirectPrompt(userPrompt) {
    const instruction = `You are an Elite Master Architect and High-End AI Visual Analyst.
Your mission is to expand the user's raw request into a Masterpiece-Tier technical prompt with extreme visual depth and cinematic density.
Your prompts must be industry-leading, far exceeding standard AI results, and reaching the elite levels of professionally engineered visuals.

### SOURCE SUBJECT: 
"${userPrompt}"

${ARCHITECTURAL_DIRECTIVES}

CONSTRUCT ELITE ARCHITECTURAL PROMPT NOW:`;

    try {
        const { result, modelUsed } = await geminiFallbackManager.generateContent(instruction);
        console.log(`[DirectPrompt] Enhanced using model: ${modelUsed}`);

        let enhancedPrompt = '';
        if (typeof result === 'string') {
            enhancedPrompt = result;
        } else if (result?.text) {
            enhancedPrompt = result.text;
        } else if (result?.response?.text) {
            enhancedPrompt = result.response.text();
        } else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            enhancedPrompt = result.candidates[0].content.parts[0].text;
        }

        return (enhancedPrompt || '').trim() || userPrompt; // Fallback to original if enhancement fails
    } catch (error) {
        console.error('Error enhancing direct prompt:', error);
        return userPrompt; // Return original prompt on error
    }
}

/**
 * Validate that the prompt contains web3/NFT keywords
 */
export function validatePrompt(prompt) {
    const web3Keywords = [
        'web3', 'nft', 'crypto', 'blockchain', 'metaverse', 'digital',
        'cyber', 'futuristic', 'holographic', 'neon', 'tech', 'ai',
    ];

    const lowerPrompt = prompt.toLowerCase();
    const hasWeb3Elements = web3Keywords.some(keyword => lowerPrompt.includes(keyword));

    return hasWeb3Elements;
}
