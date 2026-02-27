import { describe, it, expect, beforeAll } from '@jest/globals';

describe('Command Parsing', () => {
    describe('Prefix Parsing', () => {
        it('should detect command prefix', () => {
            const prefixes = ['!', '?', '.', '/'];

            const hasPrefix = (message, prefixList) => {
                return prefixList.some(p => message.startsWith(p));
            };

            expect(hasPrefix('!help', prefixes)).toBe(true);
            expect(hasPrefix('help', prefixes)).toBe(false);
            expect(hasPrefix('?admin kick', prefixes)).toBe(true);
        });

        it('should extract command and arguments', () => {
            const parseCommand = (message) => {
                const parts = message.trim().split(/\s+/);
                const command = parts[0].toLowerCase().slice(1);
                const args = parts.slice(1);
                return { command, args };
            };

            const result = parseCommand('!kick @user reason');
            expect(result.command).toBe('kick');
            expect(result.args).toEqual(['@user', 'reason']);
        });

        it('should handle case insensitive commands', () => {
            const normalizeCommand = (input) => {
                return input.toLowerCase().replace(/^[^a-zA-Z]+/, '').split(/\s+/)[0];
            };

            expect(normalizeCommand('!KICK')).toBe('kick');
            expect(normalizeCommand('!Kick')).toBe('kick');
            expect(normalizeCommand('!kick')).toBe('kick');
        });

        it('should support multiple prefix types', () => {
            const prefixes = ['!', '?', '/', '@BotName'];

            const extractPrefix = (message, prefixList) => {
                for (const prefix of prefixList) {
                    if (message.startsWith(prefix)) {
                        return prefix;
                    }
                }
                return null;
            };

            expect(extractPrefix('!test', prefixes)).toBe('!');
            expect(extractPrefix('?test', prefixes)).toBe('?');
            expect(extractPrefix('/test', prefixes)).toBe('/');
            expect(extractPrefix('@BotName test', prefixes)).toBe('@BotName');
        });
    });

    describe('Argument Parsing', () => {
        it('should parse quoted arguments', () => {
            const parseQuotedArgs = (args) => {
                const result = [];
                let current = '';
                let inQuote = false;

                for (const arg of args) {
                    if (arg.startsWith('"') && !inQuote) {
                        inQuote = true;
                        current = arg.slice(1);
                    } else if (arg.endsWith('"') && inQuote) {
                        current += ' ' + arg.slice(0, -1);
                        result.push(current);
                        current = '';
                        inQuote = false;
                    } else if (inQuote) {
                        current += ' ' + arg;
                    } else {
                        result.push(arg);
                    }
                }

                if (current) result.push(current);
                return result;
            };

            const args = 'normal "quoted arg" another'.split(/\s+/);
            const parsed = parseQuotedArgs(args);
            expect(parsed).toContain('quoted arg');
            expect(parsed).toContain('normal');
            expect(parsed).toContain('another');
        });

        it('should extract user mentions', () => {
            const extractMentions = (message) => {
                const userRegex = /<@!?(\d+)>/g;
                const roleRegex = /<@&(\d+)>/g;
                const channelRegex = /<#(\d+)>/g;

                const users = [];
                let match;
                while ((match = userRegex.exec(message)) !== null) {
                    users.push({ type: 'user', id: match[1] });
                }
                return users;
            };

            const mentions = extractMentions('<@123456789> and <@987654321>');
            expect(mentions.length).toBe(2);
            expect(mentions[0].id).toBe('123456789');
            expect(mentions[1].id).toBe('987654321');
        });

        it('should extract role mentions', () => {
            const extractRoleMentions = (message) => {
                const roleRegex = /<@&(\d+)>/g;
                const roles = [];
                let match;
                while ((match = roleRegex.exec(message)) !== null) {
                    roles.push(match[1]);
                }
                return roles;
            };

            const roles = extractRoleMentions('Mention <@&111222333> here');
            expect(roles).toContain('111222333');
        });

        it('should extract channel mentions', () => {
            const extractChannelMentions = (message) => {
                const channelRegex = /<#(\d+)>/g;
                const channels = [];
                let match;
                while ((match = channelRegex.exec(message)) !== null) {
                    channels.push(match[1]);
                }
                return channels;
            };

            const channels = extractChannelMentions('Check <#555666777>');
            expect(channels).toContain('555666777');
        });

        it('should parse duration strings', () => {
            const parseDuration = (str) => {
                const units = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
                const match = str.match(/^(\d+)([smhdw])$/);
                if (!match) return null;
                return parseInt(match[1]) * units[match[2]];
            };

            expect(parseDuration('5m')).toBe(300);
            expect(parseDuration('2h')).toBe(7200);
            expect(parseDuration('1d')).toBe(86400);
            expect(parseDuration('1w')).toBe(604800);
            expect(parseDuration('invalid')).toBeNull();
        });

        it('should parse time ranges', () => {
            const parseTimeRange = (str) => {
                const now = Date.now();
                const ranges = {
                    'now': 0,
                    'today': 86400000,
                    'week': 604800000,
                    'month': 2592000000
                };
                return ranges[str.toLowerCase()] || null;
            };

            expect(parseTimeRange('week')).toBe(604800000);
            expect(parseTimeRange('today')).toBe(86400000);
            expect(parseTimeRange('now')).toBe(0);
            expect(parseTimeRange('invalid')).toBeNull();
        });
    });

    describe('Command Validation', () => {
        it('should require minimum arguments', () => {
            const validateArgs = (command, args, minArgs) => {
                if (args.length < minArgs) {
                    return { valid: false, error: `\`${command}\` requires at least ${minArgs} arguments` };
                }
                return { valid: true };
            };

            expect(validateArgs('kick', ['@user'], 2).valid).toBe(false);
            expect(validateArgs('kick', ['@user', 'reason'], 2).valid).toBe(true);
        });

        it('should validate argument types', () => {
            const validateType = (arg, type) => {
                switch (type) {
                    case 'number':
                        return !isNaN(parseFloat(arg));
                    'userMention':
                        return /^<@!?\d+>$/.test(arg);
                    'roleMention':
                        return /^<@&\d+>$/.test(arg);
                    'channelMention':
                        return /^<#\d+>$/.test(arg);
                    'duration':
                        return /^\d+[smhdw]$/.test(arg);
                    default:
                        return true;
                }
            };

            expect(validateType('123', 'number')).toBe(true);
            expect(validateType('abc', 'number')).toBe(false);
            expect(validateType('<@123>', 'userMention')).toBe(true);
            expect(validateType('<@&123>', 'roleMention')).toBe(true);
            expect(validateType('<#123>', 'channelMention')).toBe(true);
        });

        it('should handle optional arguments', () => {
            const parseOptional = (args, index, defaultValue) => {
                return args[index] !== undefined ? args[index] : defaultValue;
            };

            expect(parseOptional(['arg1'], 1, 'default')).toBe('default');
            expect(parseOptional(['arg1', 'arg2'], 1, 'default')).toBe('arg2');
        });
    });

    describe('Natural Language Processing', () => {
        it('should parse natural language commands', () => {
            const parseNatural = (message) => {
                const patterns = [
                    { regex: /kick\s+(\S+)(?:\s+(.+))?/i, command: 'kick' },
                    { regex: /ban\s+(\S+)(?:\s+(.+))?/i, command: 'ban' },
                    { regex: /mute\s+(\S+)(?:\s+(.+))?/i, command: 'mute' }
                ];

                for (const pattern of patterns) {
                    const match = message.match(pattern.regex);
                    if (match) {
                        return {
                            command: pattern.command,
                            target: match[1],
                            reason: match[2] || null
                        };
                    }
                }
                return null;
            };

            const result = parseNatural('kick @user for spamming');
            expect(result.command).toBe('kick');
            expect(result.target).toBe('@user');
            expect(result.reason).toBe('for spamming');
        });

        it('should extract intent from messages', () => {
            const extractIntent = (message) => {
                const intents = {
                    moderation: ['kick', 'ban', 'mute', 'warn', 'unban', 'purge'],
                    utility: ['help', 'ping', 'info', 'stats'],
                    role: ['role', 'addrole', 'removerole'],
                    channel: ['create', 'delete', 'edit', 'move']
                };

                const lowerMsg = message.toLowerCase();
                for (const [category, commands] of Object.entries(intents)) {
                    if (commands.some(cmd => lowerMsg.includes(cmd))) {
                        return category;
                    }
                }
                return 'unknown';
            };

            expect(extractIntent('!kick @user')).toBe('moderation');
            expect(extractIntent('!help')).toBe('utility');
            expect(extractIntent('!role add')).toBe('role');
        });

        it('should handle fuzzy matching', () => {
            const fuzzyMatch = (input, target) => {
                const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
                return normalize(input).includes(normalize(target));
            };

            expect(fuzzyMatch('!kik', 'kick')).toBe(true);
            expect(fuzzyMatch('!bann', 'ban')).toBe(true);
            expect(fuzzyMatch('!hlp', 'help')).toBe(false);
        });
    });

    describe('Command Registry', () => {
        it('should register commands', () => {
            const commandRegistry = new Map();

            const registerCommand = (name, handler, options = {}) => {
                commandRegistry.set(name.toLowerCase(), {
                    name: name.toLowerCase(),
                    handler,
                    ...options
                });
            };

            registerCommand('ping', () => 'pong', { description: 'Ping the bot' });
            registerCommand('help', () => 'help message', { aliases: ['h', '?'] });

            expect(commandRegistry.has('ping')).toBe(true);
            expect(commandRegistry.has('help')).toBe(true);
            expect(commandRegistry.has('h')).toBe(true);
        });

        it('should lookup commands by name or alias', () => {
            const registry = new Map([
                ['ping', { name: 'ping', aliases: [] }],
                ['help', { name: 'help', aliases: ['h', '?'] }]
            ]);

            const findCommand = (input) => {
                if (registry.has(input)) return registry.get(input);
                for (const cmd of registry.values()) {
                    if (cmd.aliases?.includes(input)) return cmd;
                }
                return null;
            };

            expect(findCommand('ping').name).toBe('ping');
            expect(findCommand('h').name).toBe('help');
            expect(findCommand('unknown')).toBeNull();
        });

        it('should track command usage', () => {
            const usageStats = new Map();

            const recordUsage = (command) => {
                const count = usageStats.get(command) || 0;
                usageStats.set(command, count + 1);
            };

            recordUsage('ping');
            recordUsage('ping');
            recordUsage('help');

            expect(usageStats.get('ping')).toBe(2);
            expect(usageStats.get('help')).toBe(1);
        });
    });

    describe('Subcommand Parsing', () => {
        it('should parse subcommands', () => {
            const parseSubcommand = (args) => {
                if (args.length < 2) return null;
                return {
                    command: args[0],
                    subcommand: args[1],
                    args: args.slice(2)
                };
            };

            const result = parseSubcommand(['role', 'add', '@user', 'Member']);
            expect(result.command).toBe('role');
            expect(result.subcommand).toBe('add');
            expect(result.args).toEqual(['@user', 'Member']);
        });

        it('should validate subcommand existence', () => {
            const validSubcommands = ['add', 'remove', 'list'];

            const isValidSubcommand = (sub) => {
                return validSubcommands.includes(sub.toLowerCase());
            };

            expect(isValidSubcommand('add')).toBe(true);
            expect(isValidSubcommand('delete')).toBe(false);
        });

        it('should handle nested subcommands', () => {
            const parseNestedSubcommands = (args) => {
                const hierarchy = [];
                let current = args;
                while (current.length > 0 && !current[0].startsWith('-')) {
                    hierarchy.push(current[0]);
                    current = current.slice(1);
                }
                return {
                    hierarchy,
                    options: current
                };
            };

            const result = parseNestedSubcommands(['role', 'management', 'add', '@user', '--color=red']);
            expect(result.hierarchy).toEqual(['role', 'management', 'add']);
            expect(result.options).toEqual(['@user', '--color=red']);
        });
    });

    describe('Flag Parsing', () => {
        it('should parse flags', () => {
            const parseFlags = (args) => {
                const flags = {};
                const options = [];

                for (const arg of args) {
                    if (arg.startsWith('--')) {
                        const [key, ...valueParts] = arg.slice(2).split('=');
                        flags[key.toLowerCase()] = valueParts.join('=') || true;
                    } else if (arg.startsWith('-')) {
                        flags[arg.slice(1).toLowerCase()] = true;
                    } else {
                        options.push(arg);
                    }
                }

                return { flags, options };
            };

            const result = parseFlags(['--reason=spamming', '-v', 'target']);
            expect(result.flags.reason).toBe('spamming');
            expect(result.flags.v).toBe(true);
            expect(result.options).toEqual(['target']);
        });

        it('should parse boolean flags', () => {
            const parseBooleanFlags = (args) => {
                const flags = new Set();
                const options = [];

                for (const arg of args) {
                    if (arg.startsWith('--no-')) {
                        flags.add(arg.slice(5).toLowerCase());
                    } else if (arg.startsWith('--')) {
                        const key = arg.slice(2).toLowerCase();
                        if (!args.includes(`--no-${key}`)) {
                            flags.add(key);
                        }
                    } else {
                        options.push(arg);
                    }
                }

                return { flags: Array.from(flags), options };
            };

            const result = parseBooleanArgs(['--delete', '--no-verify', 'target']);
            expect(result.flags).toContain('delete');
            expect(result.flags).not.toContain('verify');
        });
    });
});
