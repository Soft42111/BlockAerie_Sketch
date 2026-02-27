/**
 * Discord Utility Tools
 * Helper functions for interacting with Discord API and managing message limits.
 * @module packages/utils/discord-tools
 */

/**
 * Split a message into chunks within Discord's 2000 character limit.
 * @param {string} text
 * @param {number} [limit=2000]
 * @returns {string[]}
 */
export function splitMessage(text, limit = 1950) {
    if (text.length <= limit) return [text];

    const chunks = [];
    let current = text;

    while (current.length > 0) {
        if (current.length <= limit) {
            chunks.push(current);
            break;
        }

        // Find the last space within the limit to avoid splitting words
        let splitAt = current.lastIndexOf(' ', limit);
        if (splitAt === -1) splitAt = limit; // Fallback to hard split if no spaces

        chunks.push(current.substring(0, splitAt).trim());
        current = current.substring(splitAt).trim();
    }

    return chunks;
}
