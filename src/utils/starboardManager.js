/**
 * Starboard Manager
 * 
 * Handles '⭐' reactions and posts popular messages to a starboard channel.
 */
import { EmbedBuilder } from 'discord.js';

const STAR_THRESHOLD = 3; // Minimum stars to post
const STARBOARD_CHANNEL_NAME = 'starboard'; // Default channel name

// Cache to track posted messages: MessageID -> StarboardMessageID
const postedMessages = new Map();

export const starboardManager = {
    /**
     * Handle reaction addition.
     * @param {import('discord.js').MessageReaction} reaction 
     * @param {import('discord.js').User} user 
     */
    async handleReactionAdd(reaction, user) {
        if (reaction.emoji.name !== '⭐') return;
        if (reaction.message.partial) await reaction.message.fetch();
        if (reaction.partial) await reaction.fetch();

        const message = reaction.message;
        const count = reaction.count;

        // Ignore bot messages or self-stars? (Optional policy)
        // Let's allow bot messages to be starred (e.g. funny AI gens), but maybe not self-stars if we want strictness.
        // For now, simple logic.

        if (count < STAR_THRESHOLD) return;

        // Find starboard channel
        const starboardChannel = message.guild.channels.cache.find(c => c.name === STARBOARD_CHANNEL_NAME);
        if (!starboardChannel) return; // No channel, no starboard

        // Check if already posted
        const existingId = postedMessages.get(message.id);

        const embed = new EmbedBuilder()
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content || '(No text content)')
            .addFields({ name: 'Source', value: `[Jump to Message](${message.url})` })
            .setColor('#FFAC33')
            .setFooter({ text: `ID: ${message.id}` })
            .setTimestamp(message.createdTimestamp);

        // Handle attachment (first image)
        const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
        if (image) {
            embed.setImage(image.url);
        }

        const content = `⭐ **${count}** <#${message.channel.id}>`;

        if (existingId) {
            // Update existing post
            try {
                const starMsg = await starboardChannel.messages.fetch(existingId);
                await starMsg.edit({ content, embeds: [embed] });
            } catch (e) {
                // Message might be deleted, repost?
                // If deleted, simple repost or clear cache. 
                postedMessages.delete(message.id);
            }
        } else {
            // New post
            const starMsg = await starboardChannel.send({ content, embeds: [embed] });
            postedMessages.set(message.id, starMsg.id);
        }
    },

    /**
     * Handle reaction removal (optional: remove from starboard if drops below threshold?)
     * Skipping for now to keep it persistent (once famous, always famous).
     */
};
