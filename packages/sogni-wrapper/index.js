/**
 * Sogni Wrapper — CLI-based interface using sogni-gen
 *
 * Implements generation logic by spawning the `sogni-gen` process.
 * This ensures full compatibility with the official plugin capabilities,
 * including video generation, polling, and error handling.
 *
 * @module packages/sogni-wrapper
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { sharedConfig } from '../config/index.js';
import { normalizeVideoDimensions } from '../../src/utils/sogniUtils.js';
import ffmpegPath from 'ffmpeg-static';

// Path to sogni-worker
const SOGNI_GEN_PATH = path.resolve('packages/sogni-wrapper/sogni-worker.mjs');

/**
 * Execute sogni-gen with the given arguments.
 * captureOutput: if true, returns parsed JSON output.
 */
async function runSogniGen(args) {
    return new Promise((resolve, reject) => {
        // Ensure --json is passed if we want to parse the result
        if (!args.includes('--json')) args.push('--json');

        // Ensure quiet mode to avoid progress bars in logs
        if (!args.includes('-q') && !args.includes('--quiet')) args.push('-q');

        console.log(`[SogniWrapper] Spawning: node ${SOGNI_GEN_PATH} ${args.join(' ')}`);

        // Explicitly pass credentials and config from sharedConfig to the child process
        // This ensures that even if .env didn't have them (and they came from config defaults),
        // sogni-gen receives them.
        const env = {
            ...process.env,
            SOGNI_USERNAME: sharedConfig.sogni.username,
            SOGNI_PASSWORD: sharedConfig.sogni.password,
            SOGNI_APP_ID: sharedConfig.sogni.appId,
            SOGNI_API_URL: sharedConfig.sogni.restEndpoint,
            SOGNI_SOCKET_URL: sharedConfig.sogni.socketEndpoint,
            FFMPEG_PATH: ffmpegPath // Inject ffmpeg path for sogni-gen
        };

        const child = spawn('node', [SOGNI_GEN_PATH, ...args], {
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;

            // Check for early JSON output (success or error)
            try {
                const lines = stdout.trim().split('\n');
                const lastLine = lines[lines.length - 1];

                if (lastLine && lastLine.startsWith('{') && lastLine.endsWith('}')) {
                    const result = JSON.parse(lastLine);
                    if (result && result.success === true) {
                        console.log('[SogniWrapper] ✅ Generation complete, forcing early exit');
                        clearTimeout(timeout);
                        child.kill();
                        resolve(result);
                    } else if (result && result.success === false) {
                        console.log(`[SogniWrapper] ❌ Error detected: ${result.error}`);
                        clearTimeout(timeout);
                        child.kill();
                        reject(new Error(result.error || 'Unknown error from sogni-gen'));
                    }
                }
            } catch (_) { }
        });

        child.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;

            // Log readable progress
            if (chunk.includes('[PROGRESS]')) {
                const lines = chunk.split('\n');
                lines.forEach(line => {
                    if (line.includes('[PROGRESS]')) {
                        console.log(`[SogniGen] ${line.trim()}`);
                    }
                });
            } else if (chunk.includes('[DEBUG]')) {
                // Suppress debug
            } else {
                console.log(`[SogniGen:stderr] ${chunk.trim()}`);
            }
        });

        // Timeout to prevent infinite hangs (2 minutes)
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Generation timed out (120s). Sogni may be unreachable.'));
        }, 120000);

        child.on('close', (code) => {
            if (timeout && !timeout.destroyed) clearTimeout(timeout); // Check if already cleared/resolved
            if (code !== 0) {
                // Try to parse error from stdout (json) or fallback to stderr
                try {
                    const result = JSON.parse(stdout);
                    if (result && result.success === false) {
                        return reject(new Error(result.error || result.hint || 'Unknown error from sogni-gen'));
                    }
                } catch (_) { }
                return reject(new Error(`sogni-gen exited with code ${code}: ${stderr || stdout}`));
            }

            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (err) {
                reject(new Error(`Failed to parse sogni-gen output: ${err.message}\nStdout: ${stdout}`));
            }
        });

        child.on('error', (err) => {
            reject(new Error(`Failed to spawn sogni-gen: ${err.message}`));
        });
    });
}


// ── Public API ───────────────────────────────────────────────────

export async function generateImage(params) {
    const args = [];

    // Prompt
    args.push(params.prompt);

    // Common Options
    if (params.model) args.push('--model', params.model);
    else if (sharedConfig.sogniGen.defaultImageModel) args.push('--model', sharedConfig.sogniGen.defaultImageModel);

    if (params.width) args.push('--width', params.width.toString());
    if (params.height) args.push('--height', params.height.toString());
    if (params.count) args.push('--count', params.count.toString());

    // Seed Strategy
    if (params.seed != null) {
        args.push('--seed', params.seed.toString());
    } else if (sharedConfig.sogniGen.seedStrategy) {
        args.push('--seed-strategy', sharedConfig.sogniGen.seedStrategy);
    }

    try {
        const result = await runSogniGen(args);

        if (!result.success) {
            throw new Error(result.error || 'Generation failed');
        }

        // Map sogni-gen result to expected internal format
        const urls = result.urls || (result.url ? [result.url] : []);
        return {
            success: true,
            url: urls[0],
            urls: urls,
            seed: result.seed,
            model: result.model
        };
    } catch (err) {
        console.error('[SogniWrapper] generateImage error:', err);
        throw err;
    }
}

export async function editImage(params) {
    const args = [];

    args.push(params.prompt);

    // Context / Ref Image
    if (!params.contextPath) {
        throw new Error('Context image path is required for editing');
    }
    args.push('--context', params.contextPath);

    if (params.model) args.push('--model', params.model);
    else if (sharedConfig.sogniGen.defaultEditModel) args.push('--model', sharedConfig.sogniGen.defaultEditModel);

    // Timeouts if needed
    if (params.timeout) args.push('--timeout', (params.timeout / 1000).toString());

    try {
        const result = await runSogniGen(args);
        if (!result.success) {
            throw new Error(result.error || 'Edit failed');
        }

        return {
            success: true,
            url: result.url || (result.urls ? result.urls[0] : null),
            model: result.model
        };
    } catch (err) {
        console.error('[SogniWrapper] editImage error:', err);
        throw err;
    }
}

export async function generateVideo(params) {
    const args = ['--video'];

    args.push(params.prompt);

    // Workflow & Model
    let workflow = params.workflow;
    // Auto-detect workflow if reference provided but no workflow specified
    if (!workflow && params.refImage) workflow = 'i2v';
    if (!workflow) workflow = 't2v'; // default

    args.push('--workflow', workflow);

    // Look up model from config if not provided, or use sogni-gen defaults
    if (params.model) {
        args.push('--model', params.model);
    }
    // If no explicit model, sogni-gen chooses based on workflow, or we can enforce config:
    else if (sharedConfig.sogniGen.videoModels?.[workflow]) {
        args.push('--model', sharedConfig.sogniGen.videoModels[workflow]);
    }

    // Dimensions
    if (params.width) args.push('--width', params.width.toString());
    if (params.height) args.push('--height', params.height.toString());

    // Video Params
    if (params.fps) args.push('--fps', params.fps.toString());
    if (params.duration) args.push('--duration', params.duration.toString());

    // Reference Image
    if (params.refImage) {
        args.push('--ref', params.refImage);
    }

    try {
        const result = await runSogniGen(args);
        if (!result.success) {
            throw new Error(result.error || 'Video generation failed');
        }

        return {
            success: true,
            url: result.url,
            model: result.model
        };
    } catch (err) {
        console.error('[SogniWrapper] generateVideo error:', err);
        throw err;
    }
}

export async function generate360(params) {
    const args = ['--angles-360'];

    args.push(params.prompt);

    if (params.contextPath) {
        args.push('--context', params.contextPath);
    }

    if (params.model) args.push('--model', params.model);

    // Video Output for 360
    if (params.makeVideo) {
        if (params.outputVideoPath) {
            args.push('--angles-360-video', params.outputVideoPath);
        } else {
            // Let sogni-gen handle it or temp path
            args.push('--angles-360-video', path.resolve(require('os').tmpdir(), `360_${Date.now()}.mp4`));
        }
    }

    try {
        const result = await runSogniGen(args);

        // sogni-gen returns { success: true, images: [...], video: path } for 360
        if (!result.success) {
            // Check for partial results (e.g. images generated but video failed)
            if (result.images && result.images.length > 0) {
                console.warn('[SogniWrapper] Partial 360 success (video failed but images exist)');
                return {
                    success: true, // Treat as success for the wrapper consumer
                    partial: true,
                    error: result.error,
                    images: result.images,
                    videoPath: null
                };
            }
            throw new Error(result.error || '360 generation failed');
        }

        return {
            success: true,
            images: result.images || [],
            videoPath: result.video || result.videoPath
        };
    } catch (err) {
        console.error('[SogniWrapper] generate360 error:', err);
        throw err;
    }
}

export async function checkBalance() {
    const args = ['--balance'];
    try {
        const result = await runSogniGen(args);
        return {
            success: true,
            spark: result.spark,
            sogni: result.sogni
        };
    } catch (err) {
        console.error('[SogniWrapper] checkBalance error:', err);
        return { success: false, error: err.message };
    }
}

// Ensure init/login is no-op now as sogni-gen handles it per request
// But we keep the method signature if it was called externally
export async function login() {
    // no-op
    return true;
}
