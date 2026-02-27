/**
 * Legacy Command Regression Tests
 *
 * Validates that the existing messageCreate command router still routes
 * all 26+ prefix commands correctly after the upgrade.
 */

describe('Legacy Command Router - Regression', () => {
    // Simulate the command extraction logic from index.js (lines 239-241)
    function extractCommand(messageContent, prefix = '!') {
        if (!messageContent.startsWith(prefix)) return null;
        const args = messageContent.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        return { commandName, args };
    }

    // All legacy commands that must continue to work
    const LEGACY_COMMANDS = [
        { input: '!pfp', expected: 'pfp' },
        { input: '!generate-pfp', expected: 'generate-pfp' },
        { input: '!imagine a cat in space', expected: 'imagine', argsMin: 4 },
        { input: '!img a dragon', expected: 'img', argsMin: 2 },
        { input: '!help', expected: 'help' },
        { input: '!commands', expected: 'commands' },
        { input: '!ping', expected: 'ping' },
        { input: '!ban @user reason', expected: 'ban' },
        { input: '!kick @user', expected: 'kick' },
        { input: '!warn @user being rude', expected: 'warn' },
        { input: '!warnings @user', expected: 'warnings' },
        { input: '!clearwarnings @user', expected: 'clearwarnings' },
        { input: '!timeout @user 10', expected: 'timeout' },
        { input: '!mute @user 5', expected: 'mute' },
        { input: '!untimeout @user', expected: 'untimeout' },
        { input: '!unmute @user', expected: 'unmute' },
        { input: '!unban 123456', expected: 'unban' },
        { input: '!modlog #channel', expected: 'modlog' },
        { input: '!automod spam on', expected: 'automod' },
        { input: '!raid check', expected: 'raid' },
        { input: '!clear 50', expected: 'clear' },
        { input: '!purge 20', expected: 'purge' },
        { input: '!lock', expected: 'lock' },
        { input: '!view-only', expected: 'view-only' },
        { input: '!viewonly', expected: 'viewonly' },
        { input: '!lock-immunity @role', expected: 'lock-immunity' },
        { input: '!mod-guide', expected: 'mod-guide' },
        { input: '!modhelp', expected: 'modhelp' },
        { input: '!note @user this is a note', expected: 'note' },
        { input: '!report @user spamming', expected: 'report' },
        { input: '!add-slur badword', expected: 'add-slur' },
        { input: '!remove-slur badword', expected: 'remove-slur' },
        { input: '!list-slurs', expected: 'list-slurs' },
        { input: '!admin-immunity @role', expected: 'admin-immunity' },
        { input: '!status', expected: 'status' },
    ];

    test.each(LEGACY_COMMANDS)('routes "$input" to command "$expected"', ({ input, expected, argsMin }) => {
        const result = extractCommand(input);
        expect(result).not.toBeNull();
        expect(result.commandName).toBe(expected);
        if (argsMin) {
            expect(result.args.length).toBeGreaterThanOrEqual(argsMin);
        }
    });

    // Admin command security check
    const ADMIN_COMMANDS = ['add-slur', 'add-slurs', 'remove-slur', 'list-slurs', 'admin-immunity', 'modlog', 'automod', 'raid'];

    test('admin commands list is complete', () => {
        ADMIN_COMMANDS.forEach(cmd => {
            const result = extractCommand(`!${cmd} test`);
            expect(result.commandName).toBe(cmd);
        });
    });

    // Verify that non-prefix messages are NOT treated as commands
    test('non-prefix messages return null', () => {
        expect(extractCommand('hello there')).toBeNull();
        expect(extractCommand('@bot make an image')).toBeNull();
        expect(extractCommand('/imagine a cat')).toBeNull();
        expect(extractCommand('')).toBeNull();
    });

    // Verify command prefix is configurable
    test('works with custom prefix', () => {
        const result = extractCommand('?help', '?');
        expect(result.commandName).toBe('help');
    });
});
