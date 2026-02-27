import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { MockDiscordUser, MockDiscordGuild, MockDiscordMessage } from '../mocks/discord.js';

describe('Anti-Spam System', () => {
    let mockGuild;

    beforeAll(() => {
        mockGuild = new MockDiscordGuild('555666777', 'Test Server');
    });

    describe('Message Rate Limiting', () => {
        it('should detect rapid message posting', () => {
            const THRESHOLD = 5;
            const WINDOW_MS = 1000;

            const messages = [
                { timestamp: Date.now() - 900 },
                { timestamp: Date.now() - 600 },
                { timestamp: Date.now() - 300 },
                { timestamp: Date.now() - 100 }
            ];

            const isSpamming = (msgList) => {
                const recentMessages = msgList.filter(
                    m => Date.now() - new Date(m.timestamp).getTime() < WINDOW_MS
                );
                return recentMessages.length >= THRESHOLD;
            };

            expect(isSpamming(messages)).toBe(true);
        });

        it('should allow normal message posting', () => {
            const THRESHOLD = 5;
            const WINDOW_MS = 1000;

            const messages = [
                { timestamp: Date.now() - 5000 },
                { timestamp: Date.now() - 4000 },
                { timestamp: Date.now() - 3000 }
            ];

            const isSpamming = (msgList) => {
                const recentMessages = msgList.filter(
                    m => Date.now() - new Date(m.timestamp).getTime() < WINDOW_MS
                );
                return recentMessages.length >= THRESHOLD;
            };

            expect(isSpamming(messages)).toBe(false);
        });

        it('should track message timestamps per user', () => {
            const userMessageTimes = new Map();

            const recordMessage = (userId, content) => {
                const times = userMessageTimes.get(userId) || [];
                times.push({ content, timestamp: Date.now() });
                userMessageTimes.set(userId, times);
            };

            recordMessage('123', 'Hello');
            recordMessage('123', 'World');
            recordMessage('456', 'Test');

            expect(userMessageTimes.get('123').length).toBe(2);
            expect(userMessageTimes.get('456').length).toBe(1);
        });
    });

    describe('Duplicate Message Detection', () => {
        it('should detect exact duplicate messages', () => {
            const recentMessages = [
                { content: 'Hello world', authorId: '123', timestamp: Date.now() - 500 },
                { content: 'Hello world', authorId: '123', timestamp: Date.now() - 100 }
            ];

            const isDuplicate = (currentMsg, recentMsgs) => {
                return recentMsgs.some(
                    m => m.content === currentMsg.content &&
                         m.authorId === currentMsg.authorId &&
                         Date.now() - new Date(m.timestamp).getTime() < 5000
                );
            };

            expect(isDuplicate(recentMessages[1], recentMessages)).toBe(true);
        });

        it('should ignore similar but not identical messages', () => {
            const recentMessages = [
                { content: 'Hello world', authorId: '123', timestamp: Date.now() - 500 }
            ];

            const isDuplicate = (currentMsg, recentMsgs) => {
                return recentMsgs.some(
                    m => m.content === currentMsg.content &&
                         m.authorId === currentMsg.authorId
                );
            };

            const currentMsg = { content: 'Hello World!', authorId: '123', timestamp: Date.now() };
            expect(isDuplicate(currentMsg, recentMessages)).toBe(false);
        });

        it('should calculate message similarity', () => {
            const calculateSimilarity = (str1, str2) => {
                const len = Math.max(str1.length, str2.length);
                if (len === 0) return 1;
                let matches = 0;
                for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
                    if (str1[i] === str2[i]) matches++;
                }
                return matches / len;
            };

            expect(calculateSimilarity('hello', 'hello')).toBe(1);
            expect(calculateSimilarity('hello', 'hallo')).toBe(0.8);
            expect(calculateSimilarity('hello', 'world')).toBe(0.2);
        });
    });

    describe('Caps Lock Detection', () () => {
        const detectCapsSpam = (content) => {
            const letters = content.replace(/[^a-zA-Z]/g, '');
            if (letters.length === 0) return false;
            const capsCount = letters.replace(/[^A-Z]/g, '').length;
            return capsCount / letters.length > 0.7 && content.length > 10;
        };

        it('should detect excessive caps usage', () => {
            expect(detectCapsSpam('HELLO WORLD THIS IS SPAM')).toBe(true);
            expect(detectCapsSpam('Hello World')).toBe(false);
            expect(detectCapsSpam('HI')).toBe(false);
        });
    });

    describe('Mention Spam Detection', () => {
        it('should detect excessive mention usage', () => {
            const MAX_MENTIONS = 5;

            const mentions = ['<@123>', '<@456>', '<@789>', '<@111>', '<@222>', '<@333>'];

            const hasExcessiveMentions = (mentionList) => {
                return mentionList.length > MAX_MENTIONS;
            };

            expect(hasExcessiveMentions(mentions)).toBe(true);
            expect(hasExcessiveMentions(mentions.slice(0, 3))).toBe(false);
        });

        it('should count total mentions in message', () => {
            const countMentions = (content) => {
                const mentionRegex = /<@!?\d+>|<@&\d+>/g;
                return (content.match(mentionRegex) || []).length;
            };

            expect(countMentions('Hello <@123> and <@456>!')).toBe(2);
            expect(countMentions('No mentions here')).toBe(0);
        });
    });

    describe('Link Detection', () => {
        it('should detect links in messages', () => {
            const detectLinks = (content) => {
                const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
                return linkRegex.test(content);
            };

            expect(detectLinks('Check out https://google.com')).toBe(true);
            expect(detectLinks('Visit www.example.org')).toBe(true);
            expect(detectLinks('No links here')).toBe(false);
        });

        it('should allow Discord invite links', () => {
            const detectLinks = (content) => {
                const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
                const inviteRegex = /(discord\.gg\/[a-zA-Z0-9]+)|(discord\.com\/invite\/[a-zA-Z0-9]+)/i;
                return { hasLink: linkRegex.test(content), isInvite: inviteRegex.test(content) };
            };

            const result = detectLinks('Join https://discord.gg/abc123');
            expect(result.hasLink).toBe(true);
            expect(result.isInvite).toBe(true);
        });
    });

    describe('Emoji Spam Detection', () => {
        it('should detect excessive emoji usage', () => {
            const MAX_EMOJIS = 5;

            const emojis = ['😀', '😂', '😍', '😎', '🤔', '😱'];

            const hasEmojiSpam = (emojiList) => {
                return emojiList.length > MAX_EMOJIS;
            };

            expect(hasEmojiSpam(emojis)).toBe(true);
            expect(hasEmojiSpam(emojis.slice(0, 3))).toBe(false);
        });

        it('should count custom emojis', () => {
            const countEmojis = (content) => {
                const emojiRegex = /<a?:[a-zA-Z0-9_]+:\d+>/g;
                const unicodeRegex = /[\u{1F600}-\u{1F64F}]/gu;
                const customEmojis = (content.match(emojiRegex) || []).length;
                const unicodeEmojis = (content.match(unicodeRegex) || []).length;
                return customEmojis + unicodeEmojis;
            };

            expect(countEmojis('Hello 😀 😂')).toBe(2);
            expect(countEmojis('<a:smug:123456789>')).toBe(1);
        });
    });

    describe('Anti-Spam Actions', () => {
        it('should apply escalating penalties', () => {
            const PENALTIES = {
                first: 'warn',
                second: 'mute_10m',
                third: 'mute_1h',
                fourth: 'kick',
                fifth: 'ban'
            };

            const getPenalty = (offenseCount) => {
                const levels = Object.keys(PENALTIES);
                const index = Math.min(offenseCount - 1, levels.length - 1);
                return PENALTIES[levels[index]];
            };

            expect(getPenalty(1)).toBe('warn');
            expect(getPenalty(2)).toBe('mute_10m');
            expect(getPenalty(3)).toBe('mute_1h');
            expect(getPenalty(4)).toBe('kick');
            expect(getPenalty(5)).toBe('ban');
        });

        it('should reset offense count after cooldown', () => {
            let offenseCount = 3;
            const RESET_TIME = 3600000;

            const shouldReset = (lastOffense) => {
                return Date.now() - lastOffense > RESET_TIME;
            };

            expect(shouldReset(Date.now() - 1800000)).toBe(false);
            expect(shouldReset(Date.now() - 7200000)).toBe(true);
        });
    });

    describe('Slow Mode Detection', () => {
        it('should enforce channel slow mode', async () => {
            const userLastMessage = new Map();
            const SLOW_MODE_DELAY = 5000;

            const canMessage = async (userId) => {
                const lastTime = userLastMessage.get(userId);
                if (lastTime && Date.now() - lastTime < SLOW_MODE_DELAY) {
                    return false;
                }
                userLastMessage.set(userId, Date.now());
                return true;
            };

            const userId = '123';
            expect(await canMessage(userId)).toBe(true);
            expect(await canMessage(userId)).toBe(false);
        });
    });

    describe('Message Filtering', () => {
        it('should filter blocked words', () => {
            const blockedWords = ['badword', 'spam', 'scam'];
            const message = 'This is a badword in a sentence';

            const containsBlocked = (msg) => {
                return blockedWords.some(word => msg.toLowerCase().includes(word.toLowerCase()));
            };

            expect(containsBlocked(message)).toBe(true);
            expect(containsBlocked('This is a clean message')).toBe(false);
        });

        it('should censor blocked words', () => {
            const blockedWords = ['badword'];
            const censor = (msg) => {
                let censored = msg;
                blockedWords.forEach(word => {
                    censored = censored.replace(
                        new RegExp(word, 'gi'),
                        '*'.repeat(word.length)
                    );
                });
                return censored;
            };

            expect(censor('This is a badword')).toBe('This is a ********');
        });

        it('should handle regex patterns in filters', () => {
            const patterns = [
                /\b(free money|giveaway|click here)\b/gi
            ];

            const matchesPattern = (msg) => {
                return patterns.some(pattern => pattern.test(msg));
            };

            expect(matchesPattern('Click here for free money!')).toBe(true);
            expect(matchesPattern('This is a normal message')).toBe(false);
        });
    });
});

describe('Spam Statistics', () => {
    it('should track spam incidents per user', () => {
        const spamRecords = new Map();

        const recordSpam = (userId, type, severity = 1) => {
            const records = spamRecords.get(userId) || [];
            records.push({ type, severity, timestamp: Date.now() });
            spamRecords.set(userId, records);
        };

        recordSpam('123', 'excessive_caps', 1);
        recordSpam('123', 'mention_spam', 2);
        recordSpam('456', 'duplicate', 1);

        expect(spamRecords.get('123').length).toBe(2);
        expect(spamRecords.get('456').length).toBe(1);
    });

    it('should calculate spam score', () => {
        const calculateSpamScore = (offenses) => {
            const weights = {
                excessive_caps: 10,
                mention_spam: 20,
                duplicate: 5,
                rapid_fire: 15,
                link_spam: 25
            };
            return offenses.reduce((score, offense) => {
                return score + (weights[offense.type] || 10) * offense.severity;
            }, 0);
        };

        const offenses = [
            { type: 'excessive_caps', severity: 1 },
            { type: 'mention_spam', severity: 2 }
        ];

        expect(calculateSpamScore(offenses)).toBe(50);
    });

    it('should generate spam report', () => {
        const spamRecords = new Map([
            ['123', [
                { type: 'excessive_caps', timestamp: Date.now() - 86400000 },
                { type: 'mention_spam', timestamp: Date.now() - 3600000 }
            ]]
        ]);

        const generateReport = (userId) => {
            const records = spamRecords.get(userId) || [];
            return {
                totalIncidents: records.length,
                incidentTypes: [...new Set(records.map(r => r.type))],
                lastIncident: records.sort((a, b) => b.timestamp - a.timestamp)[0]
            };
        };

        const report = generateReport('123');
        expect(report.totalIncidents).toBe(2);
        expect(report.incidentTypes.length).toBe(2);
    });
});
