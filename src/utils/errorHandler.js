/**
 * Centralized error handler for the bot
 */

/**
 * Handle and log errors
 */
export function handleError(error, context = '') {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Error in ${context}:`, error);

    // Return user-friendly error message
    return getUserFriendlyError(error);
}

/**
 * Convert technical errors to user-friendly messages
 */
function getUserFriendlyError(error) {
    // API rate limit errors
    if (error.message?.includes('rate limit') || error.status === 429) {
        return 'I\'m receiving too many requests right now. Please try again in a few moments. 🕐';
    }

    // API key errors
    if (error.message?.includes('API key') || error.status === 401) {
        return 'There\'s a configuration issue with the bot. Please contact the administrator. 🔧';
    }

    // Timeout errors
    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        return 'The request timed out. Please try again. ⏱️';
    }

    // Network errors
    if (error.message?.includes('network') || error.code === 'ENOTFOUND') {
        return 'I\'m having trouble connecting to the AI service. Please try again later. 🌐';
    }

    // Discord API errors
    if (error.code >= 50000 && error.code < 60000) {
        return 'I encountered a Discord API error. Please try again. 💬';
    }

    // Generic error
    return 'Something went wrong. Please try again or contact support if the issue persists. ❌';
}

/**
 * Log info messages
 */
export function logInfo(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️ ${message}`);
    if (data) {
        console.log(data);
    }
}

/**
 * Log warning messages
 */
export function logWarning(message, data = null) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠️ ${message}`);
    if (data) {
        console.warn(data);
    }
}

/**
 * Log success messages
 */
export function logSuccess(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`);
    if (data) {
        console.log(data);
    }
}
/**
 * Log error messages
 */
export function logError(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`);
    if (error) {
        console.error(error);
    }
}
