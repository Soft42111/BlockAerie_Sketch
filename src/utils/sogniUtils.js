import { createHash } from 'crypto';
import { config } from '../config.js';

/**
 * Normalizes dimensions for video generation based on Sogni API constraints.
 */
export function normalizeVideoDimensions(width, height) {
    const { minVideoDimension, maxVideoDimension, videoDimensionMultiple } = config.models.constraints;

    let targetWidth = Number(width);
    let targetHeight = Number(height);
    let adjusted = false;

    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight)) {
        return { width: targetWidth, height: targetHeight, adjusted: false };
    }

    if (targetWidth > maxVideoDimension || targetHeight > maxVideoDimension) {
        const scaleFactor = Math.min(maxVideoDimension / targetWidth, maxVideoDimension / targetHeight);
        targetWidth = Math.floor(targetWidth * scaleFactor);
        targetHeight = Math.floor(targetHeight * scaleFactor);
        adjusted = true;
    }

    if (targetWidth < minVideoDimension || targetHeight < minVideoDimension) {
        const scaleFactor = Math.max(minVideoDimension / targetWidth, minVideoDimension / targetHeight);
        targetWidth = Math.floor(targetWidth * scaleFactor);
        targetHeight = Math.floor(targetHeight * scaleFactor);
        adjusted = true;
    }

    const roundedWidth = Math.floor(targetWidth / videoDimensionMultiple) * videoDimensionMultiple;
    const roundedHeight = Math.floor(targetHeight / videoDimensionMultiple) * videoDimensionMultiple;

    if (roundedWidth !== targetWidth || roundedHeight !== targetHeight) {
        adjusted = true;
    }

    return {
        width: Math.max(minVideoDimension, roundedWidth),
        height: Math.max(minVideoDimension, roundedHeight),
        adjusted
    };
}

/**
 * Computes a deterministic seed based on the prompt and project parameters.
 */
export function computePromptHashSeed(opts) {
    const payload = {
        prompt: opts.prompt || '',
        model: opts.modelId || '',
        width: opts.width,
        height: opts.height,
        type: opts.type || 'image'
    };
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest();
    return hash.readUInt32BE(0);
}

/**
 * Multi-Angle helpers
 */
export const MULTI_ANGLE_AZIMUTHS = [
    { key: 'front', prompt: 'front view' },
    { key: 'front-right', prompt: 'front-right quarter view' },
    { key: 'right', prompt: 'right side view' },
    { key: 'back-right', prompt: 'back-right quarter view' },
    { key: 'back', prompt: 'back view' },
    { key: 'back-left', prompt: 'back-left quarter view' },
    { key: 'left', prompt: 'left side view' },
    { key: 'front-left', prompt: 'front-left quarter view' }
];

/**
 * Parses dynamic prompt syntax like {option1|option2} and emphasis patterns.
 * Designed to mirror sogni-gen / moltbot behavior.
 */
export function parseDynamicPrompt(prompt) {
    if (!prompt) return prompt;

    // 1. Handle curly brace randomization: {choice 1|choice 2|choice 3}
    let processed = prompt.replace(/{([^{}]+)}/g, (match, contents) => {
        const choices = contents.split('|').map(c => c.trim());
        if (choices.length === 0) return '';
        return choices[Math.floor(Math.random() * choices.length)];
    });

    // 2. Handle simple emphasis normalization if needed
    // (word:weight) or (word) -> usually passed directly to stable diffusion models
    // but we can normalize spacing if requested. 

    return processed;
}

export function buildMultiAnglePrompt(basePrompt, azimuth, elevation, distance) {
    const base = parseDynamicPrompt(basePrompt);
    let expanded = `<sks> ${base}`;
    if (azimuth) expanded += `, ${azimuth}`;
    if (elevation) expanded += `, ${elevation}`;
    if (distance) expanded += `, ${distance}`;
    return expanded + `, high quality, studio portrait`;
}
