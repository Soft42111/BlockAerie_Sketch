/**
 * Prefix Command Response Adapter
 * 
 * Bridges standard Discord Message objects to the ResponseAdapter interface
 * used by the unified handlers in handlers.js.
 */

export function buildPrefixAdapter(message) {
    let responseMsg = null;

    return {
        userId: message.author.id,
        channelId: message.channelId,
        guildId: message.guildId || '',

        /**
         * Standard reply - matches Slash Command response behavior
         */
        reply: async (msg) => {
            const payload = typeof msg === 'string' ? { content: msg } : msg;
            responseMsg = await message.reply(payload);
            return responseMsg;
        },

        /**
         * Edit the existing reply (for status updates)
         */
        editReply: async (msg) => {
            const payload = typeof msg === 'string' ? { content: msg } : msg;
            if (responseMsg) {
                return responseMsg.edit(payload);
            }
            // Fallback if no reply was sent yet
            responseMsg = await message.reply(payload);
            return responseMsg;
        },

        /**
         * Send a follow-up (usually for the final image/video)
         */
        followUp: async (opts) => {
            const payload = typeof opts === 'string' ? { content: opts } : opts;
            return message.channel.send(payload);
        },

        /**
         * Raw channel send
         */
        sendInChannel: async (msg) => {
            const payload = typeof msg === 'string' ? { content: msg } : msg;
            return message.channel.send(payload);
        }
    };
}
