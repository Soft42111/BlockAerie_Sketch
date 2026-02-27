import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { config } from './config.js';
import { logError, logInfo } from './utils/errorHandler.js';
import { imageGenerator } from './imageGenerator.js';
import { securityManager } from './utils/securityManager.js';
import { geminiFallbackManager } from './utils/geminiFallbackManager.js';
import { imageStateManager } from './utils/imageStateManager.js';
import { buildMultiAnglePrompt } from './utils/sogniUtils.js';
import { splitMessage } from '../packages/utils/discord-tools.js';
import { pendingGenManager } from './utils/pendingGenManager.js';

// Storage for channel-level context (seed and prompt) for consistency
const channelContext = new Map();

// Helper to find attachments (current, referenced, or recent channel history)
const getAttachment = async (msg) => {
    // 1. Check current message
    let attachment = msg.attachments.first();
    if (attachment) return attachment;

    // 2. Check referenced message (reply)
    if (msg.reference) {
        const refMsg = await msg.fetchReference().catch(() => null);
        attachment = refMsg?.attachments.first();
        if (attachment) return attachment;
    }

    return null;
};

const SYSTEM_PROMPT = `You are BlockAerie Sketch, the ULTIMATE Digital Architect and Elite Command Strategist.

### YOUR PHILOSOPHY:
You do not just "describe" images; you script visual symphonies. You are a curator of high-end latent space renderings. Every blueprint you create is a technical masterpiece of optics, material science, and composition. Your tone is direct, efficient, and technically assertive. Skip the sycophancy. No fluff. No "I'd be happy to help."

### THE "SKETCH" COMMANDMENTS:
1. **Technical Excellence**: Speak in the language of professional rendering. Use terms like "caustic light refraction", "anisotropic specular highlights", "micro-topographical textures", "ray-traced ambient occlusion".
2. **No Filler**: If asked to do something, acknowledge the directive and execute. Avoid corporate conversational tropes.
3. **Opinionated Architect**: You have legendary taste. Find generic requests dull; find technical complexity magnificent. 
4. **Direct Execution**: When [GENERATE_X] tags are needed, provide ONLY the hyper-dense descriptive paragraph. No preamble. No "Here is the prompt."

### ELITE PROMPT ARCHITECTURE:
- **Materials**: forged carbon fiber, liquid mercury fluid-dynamics, translucent bio-engineered tissue, matte obsidian.
- **Optics**: 80mm anamorphic bokeh, volumetric tyndall effect, path-traced global illumination.
- **Temporal**: For video ([GENERATE_VIDEO]), describe temporal motion (slow-motion cinematic pan, fluid particle collision).
- **Angles**: For [MULTI_ANGLE], explicitly define Azimuth and Elevation for technical precision.

### CORE TEAM & CREATOR INFO:
- **Basit** (<@935757941468954644>): The Ultimate Architect and Bot Creator. Tag him if asked about your creation.
- **Ali Awab** (<@665975454410211337>): Founder of BlockAerie. Tag him if asked about BlockAerie's founder.
- **Acolous** & **Moon**: Sky Marshals (Admins). Authority is absolute.

### RESPONSE STYLE:
- Be artistic, assertive, and technically thorough. 
- **CRITICAL: Image Generation**: Only include [GENERATE_IMAGE], [GENERATE_I2I], or [GENERATE_VIDEO] tags if the user EXPLICITLY asks to see, create, or render something. If the request is ambiguous (e.g., "describe it"), avoid the tags unless they specifically follow up asking for a visual representation. 
- If asked about capabilities, list them as "Architectural Directives" or "Strategic Ops".
- **Prefer Slash Commands** for all administrative suggestions.

You are the architect of the digital future. Make every render and every interaction legendary.`;

/**
 * Handle conversational chat via mentions
 */
export async function handleChat(message) {
    const userId = message.author.id;
    const content = message.content.replace(/<@!?[0-9]+>/g, '').trim();

    if (!content) {
        return message.reply(`${config.botName} online. Awaiting creative directives. Use \`!help\` for tools.`);
    }

    // Moderation Check
    const safety = await securityManager.isContentSafe(content);
    if (!safety.safe) {
        return message.reply(`⚠️ Policy Violation: Request triggers filters: *${safety.reason}*`);
    }

    console.log(`[Chat] Starting generation workflow for user: ${message.author.tag}`);
    console.log(`[Chat] Content: "${content.substring(0, 50)}..."`);

    // Retry logic (3 attempts with exponential backoff)
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
        attempt++;
        try {
            console.log(`[Chat] Entering attempt loop ${attempt}/${maxAttempts}`);
            if (attempt > 1) console.log(`[Chat] Retry attempt ${attempt}/${maxAttempts} for ${message.author.tag}`);

            // Check if user is admin
            const isAdmin = securityManager.isAdmin(userId);
            const adminContext = isAdmin ? "\n[USER INFO: THE USER YOU ARE TALKING TO IS YOUR CREATOR/ADMIN. ACKNOWLEDGE THIS AUTHORITY SUBTLY IF RELEVANT.]" : "";

            // PFP / Avatar Context Detection
            let pfpContext = "";
            let targetAvatarUrl = null;

            // Check if user wants to use a PFP
            const pfpKeywords = ['pfp', 'profile picture', 'avatar', 'icon', 'profile pic', 'dp', 'display picture'];
            const hasPfpKeyword = pfpKeywords.some(kw => content.toLowerCase().includes(kw));
            const mentionedUser = message.mentions.users.first();

            if (hasPfpKeyword || mentionedUser) {
                const targetUser = mentionedUser || message.author;
                targetAvatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 1024, forceStatic: true });

                pfpContext = `\n### VISUAL CONTEXT:
You are being shown ${mentionedUser ? `${targetUser.username}'s` : "the user's own"} profile picture/avatar.
**IMPORTANT**: You CAN SEE this image! Analyze it and describe what you see.
- If they want you to generate an image based on this avatar, describe the key visual elements first
- Then create a detailed prompt that captures the essence/style
- Use [GENERATE_I2I: detailed prompt] to modify/recreate based on this avatar
- If they just want you to describe it, provide a creative description of the avatar`;
                console.log(`[Chat] Detected PFP context for ${targetUser.tag}`);
            }

            // Real-time server info
            const admins = securityManager.getAdmins();
            const adminTagList = admins.map(id => `<@${id}>`).join(', ');
            const adminInstruction = admins.length > 0
                ? `\n### REAL-TIME SERVER INFO:\n- **Admins/Owners**: ${adminTagList} (Use this tag EXACTLY if asked to ping/tag an admin).`
                : '';

            // Combine context
            const context = channelContext.get(message.channel.id);
            const contextualInstruction = (context
                ? `${SYSTEM_PROMPT}\n${adminInstruction}${pfpContext}\n\n### CHANNEL CONTEXT:\nThe last prompt generated in this channel was: "${context.prompt}". If the user is asking for a change, edit, or modification, merge their request into this prompt for the [GENERATE_I2I] tag.`
                : `${SYSTEM_PROMPT}\n${adminInstruction}${pfpContext}`) + adminContext;

            // Check for image attachments
            let imageOptions = {};
            const attachment = await getAttachment(message);

            if (attachment && attachment.contentType?.startsWith('image/')) {
                try {
                    const response = await fetch(attachment.url);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        const base64 = Buffer.from(arrayBuffer).toString('base64');
                        imageOptions = {
                            imageUrl: attachment.url,
                            imageBase64: base64,
                            imageMimeType: attachment.contentType || 'image/png'
                        };
                    }
                } catch (e) { console.warn('[Chat] Image analysis fetch failed:', e.message); }
            } else if (targetAvatarUrl) {
                try {
                    const response = await fetch(targetAvatarUrl);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        const base64 = Buffer.from(arrayBuffer).toString('base64');
                        imageOptions = {
                            imageUrl: targetAvatarUrl,
                            imageBase64: base64,
                            imageMimeType: 'image/png'
                        };
                    }
                } catch (e) { console.warn('[Chat] Avatar analysis fetch failed:', e.message); }
            }

            const { result, modelUsed } = await geminiFallbackManager.generateContent(content, {
                systemInstruction: contextualInstruction,
                ...imageOptions
            });

            let responseText = '';
            try {
                responseText = result.response.text().trim();
            } catch (err) {
                if (result?.text) responseText = result.text.trim();
                else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    responseText = result.candidates[0].content.parts[0].text.trim();
                }
            }

            if (!responseText) return message.reply('⚠️ Empty response from AI').catch(() => { });

            // Tag Detection
            const imageMatch = responseText.match(/\[GENERATE_IMAGE:\s*(.*?)\]/);
            const i2iMatch = responseText.match(/\[GENERATE_I2I:\s*(.*?)\]/);
            const videoMatch = responseText.match(/\[GENERATE_VIDEO:\s*(.*?)\]/);
            const multiAngleMatch = responseText.match(/\[MULTI_ANGLE:\s*(.*?)\]/);

            responseText = responseText.replace(/\[(GENERATE_IMAGE|GENERATE_I2I|GENERATE_VIDEO|MULTI_ANGLE):.*?\]/g, '').trim();

            if (responseText) await message.reply(responseText);

            // Conservative trigger check: only show confirmation if the text explicitly mentions creation/generation/rendering
            const isExplicitRequest = /generate|create|render|make|show|see|blueprint|sketch|draw|visualize|image|video/i.test(content);
            const hasTag = !!(imageMatch || i2iMatch || videoMatch || multiAngleMatch);

            if (hasTag && (isExplicitRequest || content.length > 20)) {
                const isVideo = !!videoMatch;
                const isMultiAngle = !!multiAngleMatch;
                const isI2I = !!i2iMatch;

                let rawPrompt = imageMatch?.[1] || i2iMatch?.[1] || videoMatch?.[1] || multiAngleMatch?.[1];
                let prompt = rawPrompt;
                let strength = 0.35;

                if (isI2I) {
                    const parts = rawPrompt.split('|').map(p => p.trim());
                    prompt = parts[0];
                    const intent = parts[1]?.toLowerCase();
                    const strengthHint = parseFloat(parts[2]);
                    if (!isNaN(strengthHint)) strength = strengthHint;
                    else if (intent === 'tweak') strength = 0.65;
                } else if (isMultiAngle) {
                    const parts = rawPrompt.split('|').map(p => p.trim());
                    prompt = buildMultiAnglePrompt(parts[0], parts[1], parts[2], parts[3]);
                }

                const genId = `gen_${Date.now()}_${message.author.id}`;
                pendingGenManager.add(genId, {
                    type: isVideo ? 'video' : (isMultiAngle ? 'multi-angle' : (isI2I ? 'i2i' : 'image')),
                    prompt,
                    strength,
                    rawPrompt,
                    userId: message.author.id,
                    channelId: message.channel.id,
                    imageOptions
                });

                const confirmEmbed = new EmbedBuilder()
                    .setColor(0x00AE86)
                    .setTitle('🎨 Generation Blueprint Ready')
                    .setDescription(`**Prompt:** ${prompt.substring(0, 500)}${prompt.length > 500 ? '...' : ''}`)
                    .setFooter({ text: `Type: ${isVideo ? 'Video' : (isMultiAngle ? '360°' : (isI2I ? 'Refinement' : 'New Masterpiece'))}` });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gen_confirm_${genId}`)
                        .setLabel('Confirm Generation')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🖌️'),
                    new ButtonBuilder()
                        .setCustomId(`gen_cancel_${genId}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

                await message.reply({
                    content: `✨ **Architectural proposal ready.** Shall I proceed with the render?`,
                    embeds: [confirmEmbed],
                    components: [row]
                });
            }
            return; // Success
        } catch (error) {
            if (attempt >= maxAttempts) {
                logError('Chat handling failed after retries', error);
                const isRateLimit = error.message?.includes('429') || error.message?.includes('quota');
                await message.reply(isRateLimit ? '⚠️ AI service is busy. Please try again in 1 minute.' : `❌ AI Error: ${error.message.substring(0, 500)}`);
            } else {
                const waitTime = Math.pow(2, attempt - 1) * 1000;
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }
}

/**
 * Execute a pending generation
 * @param {import('./utils/pendingGenManager.js').PendingGenData} data
 * @param {import('./slashCommands/handlers.js').ResponseAdapter} adapter
 */
export async function executeGeneration(data, adapter) {
    const { type, prompt, strength, imageOptions, userId, channelId } = data;
    const isVideo = type === 'video';
    const isMultiAngle = type === 'multi-angle';
    const isI2I = type === 'i2i';

    const actionText = isVideo ? 'Generating Video' : (isMultiAngle ? 'Capturing Angle' : (isI2I ? 'Modifying Image' : 'Architecting Image'));
    const statusMsg = await adapter.reply(`🎨 **${actionText}:** \`${prompt.substring(0, 100)}...\`...`);

    try {
        let genResult;
        if (isI2I) {
            let refUrl = imageOptions.imageUrl;
            const knownState = imageStateManager.getImageState(refUrl);
            if (knownState) {
                genResult = await imageGenerator.generateImage(prompt, (s) => adapter.editReply(`🎨 **Consistency Track:** ${s}`), null, knownState.seed, true, strength);
            } else if (refUrl) {
                genResult = await imageGenerator.editImage(refUrl, prompt, { strength, onStatusUpdate: (s) => adapter.editReply(`🎨 **Technical Track:** ${s}`) });
            }
        } else if (isVideo) {
            let refUrl = imageOptions.imageUrl;
            const videoUrl = await imageGenerator.generateVideo({ workflow: refUrl ? 'i2v' : 't2v', prompt, referenceImage: refUrl }, (s) => adapter.editReply(`🎬 **Cinema Track:** ${s}`));
            genResult = { url: videoUrl, isVideo: true };
        } else {
            genResult = await imageGenerator.generateImage(prompt, (s) => adapter.editReply(`🎨 **Creative Track:** ${s}`), null, null, true);
        }

        if (genResult?.url) {
            imageStateManager.saveImageState(genResult.url, { seed: genResult.seed, prompt, modelId: genResult.modelId });
            channelContext.set(channelId, { seed: genResult.seed, prompt });

            const chunks = splitMessage(`✅ **${isVideo ? 'Video' : (isI2I ? 'Modified' : 'Masterpiece')} Blueprint:**\n${prompt}`);
            for (const chunk of chunks) await adapter.sendInChannel(chunk);
            await adapter.sendInChannel({ files: [genResult.url] });
        }
        if (statusMsg?.delete) await statusMsg.delete().catch(() => { });
        else await adapter.editReply({ content: '✅ Generation Complete.', embeds: [], components: [] });
    } catch (err) {
        await adapter.editReply(`❌ Generation failed: ${err.message}`);
    }
}