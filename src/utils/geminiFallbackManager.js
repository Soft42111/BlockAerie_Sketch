import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

class GeminiFallbackManager {
    constructor() {
        this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
        this.modelFailures = new Map();
        this.cooldownPeriod = 10000;
    }

    isModelAvailable(modelName) {
        const failureTime = this.modelFailures.get(modelName);
        if (!failureTime) return true;
        const timeSinceFailure = Date.now() - failureTime;
        return timeSinceFailure > this.cooldownPeriod;
    }

    markModelFailed(modelName) {
        this.modelFailures.set(modelName, Date.now());
        console.warn(`Model ${modelName} marked as failed due to rate limit. Cooldown started.`);
    }

    getAvailableModel() {
        for (const model of config.gemini.primaryModels) {
            if (this.isModelAvailable(model)) {
                console.log(`Using primary model: ${model}`);
                return model;
            }
        }
        for (const model of config.gemini.fallbackModels) {
            if (this.isModelAvailable(model)) {
                console.log(`Switching to fallback model: ${model}`);
                return model;
            }
        }
        console.error('All Gemini models are currently rate limited.');
        return null;
    }

    async generateContent(prompt, options = {}) {
        let lastError = null;
        const attemptedModels = [];
        const modelsToTry = [
            ...config.gemini.primaryModels,
            ...config.gemini.fallbackModels
        ];

        for (const modelName of modelsToTry) {
            if (!this.isModelAvailable(modelName)) continue;

            try {
                attemptedModels.push(modelName);
                console.log(`Trying model: ${modelName}`);

                // Build contents array - supports multimodal (text + image)
                let contents;
                if (options.imageUrl) {
                    // Multimodal: include image via URL
                    console.log(`[Gemini] Including image from URL: ${options.imageUrl.substring(0, 50)}...`);
                    contents = [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: options.imageMimeType || 'image/png',
                                        data: options.imageBase64  // If base64 is provided
                                    }
                                }
                            ]
                        }
                    ];

                    // If we have base64, use inline data; otherwise use file URI
                    if (options.imageBase64) {
                        contents[0].parts[1] = {
                            inlineData: {
                                mimeType: options.imageMimeType || 'image/png',
                                data: options.imageBase64
                            }
                        };
                    } else {
                        // Use URL directly (works for public URLs)
                        contents[0].parts[1] = {
                            fileData: {
                                fileUri: options.imageUrl,
                                mimeType: options.imageMimeType || 'image/png'
                            }
                        };
                    }
                } else {
                    // Text-only prompt
                    contents = prompt;
                }

                const requestConfig = {
                    model: modelName,
                    contents: contents
                };

                // Add systemInstruction if provided in options
                if (options.systemInstruction) {
                    requestConfig.config = {
                        systemInstruction: options.systemInstruction
                    };
                }

                console.log(`[Gemini] Making API call with model: ${modelName}`);
                const result = await this.ai.models.generateContent(requestConfig);

                // Debug: Log the result structure to understand what we're getting
                console.log(`[Gemini] Result type: ${typeof result}`);
                console.log(`[Gemini] Result has text property: ${'text' in result}`);
                if (typeof result === 'object' && result !== null) {
                    console.log(`[Gemini] Result keys: ${Object.keys(result).join(', ')}`);
                }

                if (this.modelFailures.has(modelName)) {
                    this.modelFailures.delete(modelName);
                    console.log(`Model ${modelName} is now available again.`);
                }

                return { result, modelUsed: modelName };

            } catch (error) {
                lastError = error;
                console.warn(`Model ${modelName} failed: ${error.message}`);

                if (error.status === 429 ||
                    error.message?.includes('RATE_LIMIT') ||
                    error.message?.includes('quota') ||
                    error.message?.includes('RESOURCE_EXHAUSTED')) {
                    this.markModelFailed(modelName);
                    continue;
                }

                console.warn(`Temporary error with ${modelName}, trying next model...`);
                continue;
            }
        }

        const errorSummary = attemptedModels.length > 0
            ? `Attempted: ${attemptedModels.join(', ')}`
            : 'No models were available';

        console.error(`All Gemini models failed. ${errorSummary}`);
        throw lastError || new Error('All Gemini models failed');
    }

    getModelStatus() {
        const status = {};
        const allModels = [...config.gemini.primaryModels, ...config.gemini.fallbackModels];
        for (const model of allModels) {
            const failureTime = this.modelFailures.get(model);
            status[model] = {
                available: this.isModelAvailable(model),
                lastFailure: failureTime,
                cooldownRemaining: failureTime ? Math.max(0, this.cooldownPeriod - (Date.now() - failureTime)) : 0
            };
        }
        return status;
    }
}

export const geminiFallbackManager = new GeminiFallbackManager();
