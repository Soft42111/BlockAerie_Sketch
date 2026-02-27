import { SogniClientWrapper, ClientEvent } from '@sogni-ai/sogni-client-wrapper';
import { config } from './config.js';
import { logInfo, logError, logSuccess, logWarning } from './utils/errorHandler.js';
import { normalizeVideoDimensions, computePromptHashSeed, parseDynamicPrompt } from './utils/sogniUtils.js';
import { fetch } from 'undici'; // Use undici or native fetch if available

/**
 * Image Generator using Sogni SDK Wrapper
 * This version uses the official patterns from the Sogni SDK Guide.
 */
class ImageGenerator {
    constructor() {
        this.client = null;
        this.isLoggedIn = false;
        this.loginPromise = null;
    }

    /**
     * Initialize the Sogni client
     */
    async initClient(onStatusUpdate = () => { }) {
        if (this.client) return this.client;

        try {
            onStatusUpdate('Step 2.1: Initializing Sogni SDK Wrapper');
            logInfo('Initializing Sogni SDK Wrapper...');

            // Sanitize AppID (no spaces)
            const appId = (config.sogni.appId || `app_${Math.random().toString(36).substring(2, 10)}`).replace(/\s+/g, '_');
            logInfo(`Using Sanitized AppID: ${appId}`);

            this.client = new SogniClientWrapper({
                username: config.sogni.username,
                password: config.sogni.password,
                appId: appId,
                network: 'fast',
                autoConnect: false,
                authType: 'token',
                debug: true
            });

            // Set up event listeners
            this.client.on(ClientEvent.CONNECTED, () => {
                logSuccess('Sogni Wrapper: Connected');
            });

            this.client.on(ClientEvent.DISCONNECTED, () => {
                logWarning('Sogni Wrapper: Disconnected');
                this.isLoggedIn = false;
            });

            this.client.on(ClientEvent.ERROR, (data) => {
                const errorMessage = typeof data === 'string' ? data : (data.message || JSON.stringify(data));
                logError(`Sogni Wrapper Error: ${errorMessage}`);
                if (errorMessage.includes('WebSocket')) {
                    this.isLoggedIn = false;
                }
            });

            this.client.on(ClientEvent.JOB_COMPLETED, (data) => {
                logSuccess(`Job completed: ${data.imageUrl || data.videoUrl}`);
            });

            this.client.on(ClientEvent.JOB_FAILED, (data) => {
                logError(`Job failed: ${data.error}`);
            });

            this.client.on(ClientEvent.PROJECT_PROGRESS, (data) => {
                const percentage = data.percentage || 0;
                logInfo(`Generation Progress: ${percentage}%`);
                if (this.currentStatusCallback) {
                    this.currentStatusCallback(`Generating: ${percentage}%`);
                }
            });

            logSuccess(`Sogni Wrapper Client initialized.`);
        } catch (error) {
            logError('SogniClientWrapper initialization failed', error);
            throw error;
        }

        return this.client;
    }

    /**
     * Login to Sogni
     */
    async login(onStatusUpdate = () => { }) {
        if (this.isLoggedIn && this.client && this.client.isConnected()) return true;
        if (this.loginPromise) return this.loginPromise;

        this.loginPromise = (async () => {
            try {
                await this.initClient(onStatusUpdate);

                onStatusUpdate('Step 2.2: Authenticating with Sogni AI');
                logInfo('Connecting and logging in...');

                await this.client.connect();

                logSuccess('Sogni Login: Success');
                this.isLoggedIn = true;
                this.loginPromise = null;
                return true;
            } catch (error) {
                logError('Sogni login failed', error);
                this.isLoggedIn = false;
                this.loginPromise = null;
                throw error;
            }
        })();

        return this.loginPromise;
    }

    /**
     * Get the best available model for a specific task
     * @param {string} prompt - Used to detect quality requirements
     */
    async getBestModel(type, prompt = '') {
        try {
            if (type === 'video') {
                return 'wan_v2.2-14b-fp8_i2v_lightx2v';
            }

            // Quality detection
            const lowerPrompt = prompt.toLowerCase();
            const isHighQuality = ['ultra', 'pro', 'expert', 'epic', 'masterpiece', 'hyper', 'realistic'].some(kw => lowerPrompt.includes(kw));

            if (isHighQuality) {
                logInfo('High-quality keywords detected. Selecting Flux.1 Schnell (Allowed Free Model).');
                return 'flux1-schnell-fp8';
            }

            // Default to Z Image Turbo as requested
            return 'z_image_turbo_bf16';
        } catch (error) {
            logWarning('Failed to get models from config, using default');
            return 'z_image_turbo_bf16';
        }
    }

    /**
     * Get technical profile for a specific model
     */
    getModelProfile(modelId, prompt = '') {
        const isFlux = modelId.toLowerCase().includes('flux');
        const isTurbo = modelId.toLowerCase().includes('turbo');
        const isWan = modelId.toLowerCase().includes('wan');

        const defaultNegative = 'bad anatomy, bad hands, bad quality, blurry, distorted, low quality, lowres, malformation, missing fingers, ugly, watermark, worst quality, text, logo, signature, cropped, error, jpeg artifacts';

        const models = {
            'z_image_turbo_bf16': {
                steps: 4,
                guidance: 1.0,
                sampler: 'euler',
                negativePrompt: defaultNegative
            },
            'flux1-schnell-fp8': {
                steps: 4,
                guidance: 1.0,
                sampler: 'euler',
                negativePrompt: '' // Flux Schnell often works better without negative
            },
            'flux2_dev_fp8': {
                steps: 25,
                guidance: 3.5,
                sampler: 'euler',
                negativePrompt: defaultNegative
            },
            'chroma-v.46-flash_fp8': {
                steps: 8,
                guidance: 2.5,
                sampler: 'euler',
                negativePrompt: defaultNegative
            },
            'wan_v2.2-14b-fp8_t2v_lightx2v': {
                steps: 4,
                guidance: 1.0,
                sampler: 'euler',
                negativePrompt: 'blurry, static, no movement, low quality, watermark, text, out of frame, distorted'
            },
            'wan_v2.2-14b-fp8_i2v_lightx2v': {
                steps: 4,
                guidance: 1.0,
                sampler: 'euler',
                negativePrompt: 'blurry, static, low quality, watermark, text, out of frame, distorted'
            },
            'qwen_image_edit_2511_fp8_lightning': {
                steps: 4,
                guidance: 1.5,
                sampler: 'euler',
                negativePrompt: defaultNegative
            }
        };

        const profile = models[modelId] || models['z_image_turbo_bf16'];

        // Dynamic overrides if prompt contains certain keywords
        if (prompt.toLowerCase().includes('realistic') || prompt.toLowerCase().includes('photography')) {
            profile.steps = Math.max(profile.steps, isTurbo ? 6 : (isFlux ? 8 : 30));
        }

        return profile;
    }

    /**
     * Generate image from prompt
     * @param {string} prompt
     * @param {Function} onStatusUpdate
     * @param {string|Buffer|null} referenceImage - Optional URL or Buffer for I2I
     * @param {number|null} seed - Optional seed for consistency
     * @param {boolean} preserveUserPrompt - Whether to skip global style injection
     * @param {number|null} strength - I2I strength (0.0 - 1.0)
     */
    async generateImage(prompt, onStatusUpdate = () => { }, referenceImage = null, seed = null, preserveUserPrompt = true, strength = null) {
        this.currentStatusCallback = onStatusUpdate;

        try {
            if (!this.client || !this.isLoggedIn) {
                await this.login(onStatusUpdate);
            }

            // 1. Select the best model
            const modelId = await this.getBestModel('image', prompt);
            const profile = this.getModelProfile(modelId, prompt);

            // Apply dynamic prompt features (randomization, etc.)
            const parsedPrompt = parseDynamicPrompt(prompt);

            // 2. Determine strength for I2I
            const finalStrength = strength !== null ? strength : 0.4;

            logInfo(`Generating image with model: ${modelId} | Steps: ${profile.steps} | Guidance: ${profile.guidance}`);
            onStatusUpdate(`Step 2.3: Preparing ${modelId} profile`);

            // 3. Handle reference image (URL or Buffer)
            let referenceImageBuffer = null;
            if (referenceImage) {
                if (Buffer.isBuffer(referenceImage)) {
                    referenceImageBuffer = referenceImage;
                    logInfo(`Using provided reference Buffer: ${referenceImageBuffer.length} bytes`);
                } else if (typeof referenceImage === 'string') {
                    try {
                        logInfo(`Fetching reference image: ${referenceImage.substring(0, 50)}...`);
                        const imageResponse = await fetch(referenceImage);
                        if (imageResponse.ok) {
                            referenceImageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                            logInfo(`Reference image fetched: ${referenceImageBuffer.length} bytes`);
                        }
                    } catch (fetchErr) {
                        logWarning(`Error fetching reference image: ${fetchErr.message}`);
                    }
                }
            }

            const finalSeed = seed || (config.models.defaults.seedStrategy === 'prompt-hash'
                ? computePromptHashSeed({ prompt: parsedPrompt, modelId, width: 1024, height: 1024, type: 'image' })
                : Math.floor(Math.random() * 2000000000));

            // 4. Construct project config
            const isEditModel = modelId.includes('qwen_image_edit');

            const projectConfig = {
                type: 'image',
                modelId: modelId,
                positivePrompt: parsedPrompt,
                negativePrompt: profile.negativePrompt,
                seed: finalSeed,
                numberOfImages: 1,
                tokenType: 'spark',
                waitForCompletion: false, // Don't use native wait, it's hanging on Railway
                timeout: 180000,
                sizePreset: 'square_hd',
                width: 1024,
                height: 1024,
                steps: profile.steps,
                guidance: profile.guidance,
                onProgress: (progress) => {
                    const pct = progress.percentage || 0;
                    onStatusUpdate(`Generating: ${pct}%`);
                },
                onJobCompleted: (job) => {
                    logSuccess(`Job completed: ${job.id}`);
                }
            };

            // Use specialized edit parameters if applicable
            if (isEditModel && referenceImageBuffer) {
                projectConfig.contextImages = [referenceImageBuffer];
            } else if (referenceImageBuffer) {
                projectConfig.startingImage = referenceImageBuffer;
                projectConfig.startingImageStrength = finalStrength;
            }

            logInfo(`[DEBUG] Final Config: model=${modelId}, steps=${profile.steps}, guidance=${profile.guidance}, strength=${finalStrength} | EditMode=${isEditModel}`);

            logInfo('Starting Sogni project creation (polling mode)...');
            const project = isEditModel
                ? await this.client.createImageEditProject(projectConfig)
                : await this.client.createProject(projectConfig);

            logInfo(`Project created: ${project.id}. Starting manual polling loop...`);

            const result = await this._waitForProject(project, projectConfig.timeout, onStatusUpdate);

            logInfo(`Generation finished. Status: ${result.completed ? 'COMPLETED' : 'PENDING'}`);

            const finalUrls = result.imageUrls || result.urls || [];

            if (finalUrls.length > 0) {
                onStatusUpdate('Step 2.6: Image Generated! ✨');
                logInfo(`Successfully retrieved image URL: ${finalUrls[0]}`);
                return { url: finalUrls[0], seed: finalSeed, modelId: modelId };
            } else {
                logError('Result structure:', JSON.stringify(result, null, 2));
                throw new Error('Image generation finished but no URLs were returned from result object.');
            }

        } catch (error) {
            logError(`Image Generation Failed`, error.message);
            throw error;
        } finally {
            this.currentStatusCallback = null;
        }
    }

    /**
     * Manual polling for project completion
     * This avoids hangs in the SDK's own waitForCompletion promise.
     */
    async _waitForProject(project, timeout, onStatusUpdate) {
        const startTime = Date.now();
        const pollInterval = 5000; // 5 seconds

        logInfo(`[Poll] Starting loop for project ${project.id}`);

        while (Date.now() - startTime < timeout) {
            // Check for results in the project object
            // The wrapper updates this object internally via sockets/events
            const imageUrls = project.imageUrls || (project.resultUrls && project.resultUrls.length > 0 ? project.resultUrls : null);

            if (imageUrls && imageUrls.length > 0) {
                logSuccess(`[Poll] Results found found in project object: ${imageUrls[0]}`);
                return {
                    completed: true,
                    imageUrls: imageUrls,
                    project: project
                };
            }

            // Check if jobs are finished and have URLs
            if (project.jobs && project.jobs.length > 0) {
                const jobWithUrl = project.jobs.find(j => j.url || j.resultUrl);
                if (jobWithUrl) {
                    const finalUrl = jobWithUrl.url || jobWithUrl.resultUrl;
                    logSuccess(`[Poll] Results found in completed job: ${finalUrl}`);
                    return {
                        completed: true,
                        imageUrls: [finalUrl],
                        project: project
                    };
                }
            }

            // check if project is marked finished but still no URLs
            if (project.finished || project.completed) {
                logWarning(`[Poll] Project marked as finished but no URLs found yet. Waiting one more cycle...`);
            }

            // Log heartbeat
            logInfo(`[Poll] Still waiting for project ${project.id} (Elapsed: ${Math.round((Date.now() - startTime) / 1000)}s)`);

            await new Promise(r => setTimeout(r, pollInterval));
        }

        throw new Error(`Project timed out after ${timeout / 1000} seconds without returning results.`);
    }

    /**
     * Specialized Edit Method following the technical spec (Bytes -> Edit)
     * @param {string} imageUrl - URL from attachment
     * @param {string} prompt - Instruction for edit
     * @param {object} options - strength, steps, seed, etc.
     */
    async editImage(imageUrl, prompt, options = {}) {
        logInfo(`[Technical Spec] Starting Image Edit Flow for ${imageUrl.substring(0, 30)}...`);

        try {
            // Step 2: Download as raw bytes
            const res = await fetch(imageUrl);
            if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);

            // Step 3: Convert to Buffer
            const arrayBuf = await res.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            logInfo(`[Technical Spec] Converted to Buffer: ${buf.length} bytes`);

            // Step 4: Call Sogni edit function via refactored generateImage
            return await this.generateImage(
                prompt,
                options.onStatusUpdate,
                buf, // Pass Buffer directly
                options.seed,
                true,
                options.strength
            );

        } catch (error) {
            logError(`[Technical Spec] Edit Flow Failed`, error.message);
            throw error;
        }
    }

    /**
     * Generate video
     */
    async generateVideo(params, onStatusUpdate = () => { }) {
        const {
            workflow = 'i2v',
            prompt,
            referenceImage = null,
            frames = 80,
            width = 512,
            height = 512,
            fps = 16
        } = params;

        this.currentStatusCallback = onStatusUpdate;

        try {
            if (!this.client || !this.isLoggedIn) {
                await this.login(onStatusUpdate);
            }

            const modelId = await this.getBestModel('video', workflow);
            logInfo(`Generating video with model: ${modelId} (${workflow})`);
            onStatusUpdate(`Step 2.3: Dispatching Video to Sogni Supernet`);

            const { width: normWidth, height: normHeight } = normalizeVideoDimensions(width, height);

            const parsedPrompt = parseDynamicPrompt(prompt || 'cinematic movement, high quality');

            const videoConfig = {
                type: 'video',
                modelId: modelId,
                positivePrompt: parsedPrompt,
                numberOfMedia: 1,
                referenceImage: referenceImage,
                frames: frames,
                fps: fps,
                width: normWidth,
                height: normHeight,
                tokenType: 'spark',
                waitForCompletion: false,
                timeout: config.models.defaults.defaultVideoTimeoutSec * 1000
            };

            const response = await this.client.createProject(videoConfig);
            const project = response.project || response; // Wrapper sometimes returns project directly

            logInfo(`Video Project created: ${project.id}. Waiting for completion...`);
            onStatusUpdate(`Step 2.4: Video Project Queued (ID: ${project.id.substring(0, 8)})`);

            // Manual Wait with Polling Fallback for Video
            const result = await Promise.race([
                project.waitForCompletion ? project.waitForCompletion() : Promise.resolve(null),
                new Promise(async (resolve, reject) => {
                    const startTime = Date.now();
                    const timeout = videoConfig.timeout;

                    while (Date.now() - startTime < timeout) {
                        await new Promise(r => setTimeout(r, 10000));

                        logInfo(`Polling Video Project ${project.id?.substring(0, 5)}: Status=${project.status}, Progress=${project.progress || 0}%`);

                        if (project.finished || (project.resultUrls && project.resultUrls.length > 0) || project.urls?.length > 0) {
                            return resolve(project.resultUrls || project.urls);
                        }

                        if (project.status === 'failed' || project.status === 'error') {
                            return reject(new Error(`Video project failed: ${project.error?.message || 'Unknown server error'}`));
                        }
                    }
                    reject(new Error('Video generation timed out after polling.'));
                })
            ]);

            const finalUrls = Array.isArray(result) ? result : (result?.videoUrls || result?.urls || []);

            if (finalUrls.length > 0) {
                onStatusUpdate('Step 2.6: Video Generated! 🎬');
                return finalUrls[0];
            } else {
                throw new Error('Video generation finished but no URLs were returned.');
            }

        } catch (error) {
            logError(`Video Generation Failed`, error.message);

            if (error.code === 4024 || (error.message && error.message.includes('Insufficient funds'))) {
                throw new Error('Insufficient Sogni credits (Normal Sparks) 💎. Please top up at sogni.ai');
            }

            throw error;
        } finally {
            this.currentStatusCallback = null;
        }
    }
}

export const imageGenerator = new ImageGenerator();
