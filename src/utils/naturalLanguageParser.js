import { securityManager } from '../utils/securityManager.js';
import { geminiFallbackManager } from '../utils/geminiFallbackManager.js';
import { config } from '../config.js';

class NaturalLanguageCommandParser {
    constructor() {
        this.commandPatterns = {
            // PFP generation patterns
            'generate_pfp': [
                /(?:profile picture|pfp|avatar|profile pic|discord pic|server icon)/i,
                /(?:i want|i need|i'd like).*(?:pfp|profile picture|avatar)/i,
                /(?:make|create|generate).*(?:my|me).*(?:pfp|avatar|profile)/i
            ],
            // Image generation patterns
            'imagine': [
                /(?:imagine|generate|create|make|draw).*(?:image|picture|art|drawing|photo)/i,
                /(?:can you|could you|will you).*(?:generate|create|make|draw).*(?:image|picture|art)/i,
                /(?:i want|i need|i'd like).*(?:image|picture|art|drawing|photo)/i,
                /(?:make me|give me|show me).*(?:image|picture|art|drawing)/i
            ],
            // Help patterns
            'help': [
                /(?:what|how).*(?:can|do|are you|is this|commands)/i,
                /(?:tell me|show me|list).*(?:commands|what you can do)/i,
                /(?:help|assist|guide|instructions)/i,
                /(?:what are|list).*(?:features|abilities|skills|capabilities)/i
            ],
            // Status/ping patterns
            'ping': [
                /(?:are you|is the bot|are things).*(?:working|online|alive|active|ok)/i,
                /(?:status|ping|check|test)/i,
                /(?:what's|how is).*(?:the status|your status)/i
            ],
            // Admin commands (more specific)
            'add_slur': [
                /(?:add|block|blacklist).*(?:word|slur|term|keyword)/i,
                /(?:mark|flag).*(?:as|for).*(?:inappropriate|prohibited)/i
            ],
            'remove_slur': [
                /(?:remove|unblock|delete|whitelist).*(?:word|slur|term|keyword)/i,
                /(?:allow|permit).*(?:this word|this term)/i
            ],
            'list_slurs': [
                /(?:show|list|display).*(?:slurs|blocked words|forbidden|blacklisted)/i,
                /(?:what are|tell me).*(?:the|your).*(?:slurs|blocked words)/i
            ],
            'admin_immunity': [
                /(?:toggle|switch|turn|set).*(?:admin|moderator).*(?:immunity|exemption)/i,
                /(?:enable|disable).*(?:admin|moderator).*(?:immunity|exemption)/i
            ]
        };
    }

    /**
     * Parse natural language input to identify intended command
     */
    async parseCommand(content, userId) {
        const cleanContent = content.replace(/<@!?[0-9]+>/g, '').trim();
        
        // Check each command pattern
        for (const [command, patterns] of Object.entries(this.commandPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(cleanContent)) {
                    // For admin commands, verify user is admin
                    if (command.includes('slur') || command.includes('immunity')) {
                        if (!securityManager.isAdmin(userId)) {
                            return null; // Don't return command for non-admins
                        }
                    }
                    
                    return this.extractParameters(cleanContent, command);
                }
            }
        }
        
        return null; // No command detected
    }

    /**
     * Extract parameters from natural language
     */
    extractParameters(content, command) {
        const result = {
            command: command.replace(/_/g, '-'),
            args: [],
            originalContent: content
        };

        switch (command) {
            case 'imagine':
                // Extract the prompt for image generation
                const imagineMatch = content.match(/(?:imagine|generate|create|make|draw).+(?:image|picture|art|drawing|photo)[\s:]*["'`]?([^"'`]+?)(?:["'`]|$)/i);
                if (imagineMatch && imagineMatch[1]) {
                    result.args = [imagineMatch[1].trim()];
                } else {
                    // Try to capture everything after action words as the prompt
                    const promptMatch = content.match(/(?:i want|i need|i'd like|make me|give me|show me|can you|could you)[\s:]+(.+)/i);
                    if (promptMatch && promptMatch[1]) {
                        result.args = [promptMatch[1].trim()];
                    }
                }
                break;
                
            case 'add_slur':
                // Extract the word to add
                const addMatch = content.match(/(?:add|block|blacklist).*(?:word|slur|term|keyword)[\s:]*["'`]?([^"'`\s]+)["'`]?/i);
                if (addMatch && addMatch[1]) {
                    result.args = [addMatch[1].trim()];
                }
                break;
                
            case 'remove_slur':
                // Extract the word to remove
                const removeMatch = content.match(/(?:remove|unblock|delete|whitelist).*(?:word|slur|term|keyword)[\s:]*["'`]?([^"'`\s]+)["'`]?/i);
                if (removeMatch && removeMatch[1]) {
                    result.args = [removeMatch[1].trim()];
                }
                break;
                
            case 'admin_immunity':
                // Extract on/off parameter
                const immMatch = content.match(/(?:enable|on|true|activate)/i);
                if (immMatch) {
                    result.args = ['on'];
                } else {
                    const immOffMatch = content.match(/(?:disable|off|false|deactivate)/i);
                    if (immOffMatch) {
                        result.args = ['off'];
                    }
                }
                break;
        }

        return result;
    }

    /**
     * Generate a witty response when natural command is detected
     */
    async generateCommandResponse(detectedCommand, originalContent) {
        try {
            const response = await geminiFallbackManager.generateContent(
                `You are ${config.botName}, a witty AI assistant. The user said: "${originalContent}" but they clearly want to use the "${detectedCommand.command}" command. 

                Write a brief, witty response that:
                1. Acknowledges their natural language request
                2. Explains you understand what they meant
                3. Is fun and playful
                4. Keep it under 2 sentences
                5. Don't repeat the command - just be clever

                Examples:
                - "make me a cat picture" → "Ooh, I read your creative mind! Let me conjure up that feline masterpiece for you!"
                - "i need a pfp" → "Profile picture upgrade incoming! I sense your social media game needs a boost!"
                - "are you working?" → "Firing on all cylinders! My creative circuits are buzzing and ready to roll! 🚀"`
            );
            
            return response.result.response.text().trim();
        } catch (error) {
            console.error('Failed to generate witty response:', error);
            return `I understand you want to use the ${detectedCommand.command} command! Let me help you with that.`;
        }
    }
}

export const naturalLanguageParser = new NaturalLanguageCommandParser();