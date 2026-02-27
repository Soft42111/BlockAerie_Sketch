/**
 * Sogni Model Library
 *
 * A structured collection of available Sogni models.
 * Categorized by capability and tier to help users select the best model.
 */

export const SOGNI_MODELS = {
    IMAGE: [
        { id: 'flux1-schnell-fp8', name: 'Flux.1 Schnell', tier: 'Fast', description: 'Exceptional quality in 1-4 steps.' },
        { id: 'z_image_turbo_bf16', name: 'Z Image Turbo', tier: 'Turbo', description: 'Ultra-fast inference for rapid prototyping.' },
        { id: 'flux2_dev_fp8', name: 'Flux.2 Dev', tier: 'Premium', description: 'The gold standard for detail and realism.' },
        { id: 'chroma-v.46-flash_fp8', name: 'Chroma Flash', tier: 'Balanced', description: 'Highly optimized for vibrant social media styles.' },
        { id: 'coreml-juggernautXL_juggXIByRundiffusion', name: 'Juggernaut XL', tier: 'Realism', description: 'Legendary photorealism and cinematic lighting.' },
        { id: 'pony-diffusion-v6-xl', name: 'Pony XL v6', tier: 'Stylized', description: 'Unmatched for anime, stylized, and expressive art.' },
        { id: 'sdxl-lightning-4step', name: 'SDXL Lightning', tier: 'Fast', description: 'High-speed SDXL variant (4 steps).' },
    ],

    EDIT: [
        { id: 'qwen_image_edit_2511_fp8_lightning', name: 'Qwen Edit', description: 'Precise localized editing and object manipulation.' },
        { id: 'flux-dev-inpainting', name: 'Flux Inpaint', description: 'High-quality inpainting using Flux Dev architecture.' },
    ],

    VIDEO: [
        { id: 'wan_v2.2-14b-fp8_t2v_lightx2v', name: 'Wan v2.2 T2V', workflow: 't2v', description: 'High-fidelity text-to-video.' },
        { id: 'wan_v2.2-14b-fp8_i2v_lightx2v', name: 'Wan v2.2 I2V', workflow: 'i2v', description: 'Bring your images to life with motion.' },
        { id: 'wan_v2.2-14b-fp8_s2v_lightx2v', name: 'Wan v2.2 S2V', workflow: 's2v', description: 'Sound-to-video for audio-reactive motion.' },
        { id: 'sogni-motion-v1', name: 'Sogni Motion', workflow: 'animate', description: 'Smooth, fluid cinematic animations.' },
    ],

    SPECIALIZED: [
        { id: 'turntable-360-v1', name: '360 Turntable', type: '360', description: 'Create 3D-like rotations of any subject.' },
    ]
};

/**
 * Get a model by ID or return the default for a category.
 * @param {string} category - IMAGE, EDIT, VIDEO, or SPECIALIZED
 * @param {string} [id]
 * @returns {object}
 */
export function getModel(category, id) {
    const list = SOGNI_MODELS[category];
    if (!list) return null;

    if (!id) return list[0]; // Return the first one as default
    return list.find(m => m.id === id) || list[0];
}

/**
 * Get all available model IDs for a category.
 * @param {string} category
 * @returns {string[]}
 */
export function getModelIds(category) {
    return (SOGNI_MODELS[category] || []).map(m => m.id);
}
