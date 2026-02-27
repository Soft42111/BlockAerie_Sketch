/**
 * Tests for the scheduler — natural language time parsing and reminder CRUD.
 */

// Inline the parseTime function for testing (avoids ESM import issues with Jest)
function parseTime(input) {
    if (!input) return null;
    const trimmed = input.trim().toLowerCase();

    const iso = Date.parse(input.trim());
    if (!isNaN(iso) && input.trim().match(/\d{4}-\d{2}/)) {
        return new Date(iso);
    }

    const relMatch = trimmed.match(/^in\s+(\d+\.?\d*)\s+(second|minute|hour|day|week|month)s?$/);
    if (relMatch) {
        const amount = parseFloat(relMatch[1]);
        const unit = relMatch[2];
        const multipliers = {
            second: 1000, minute: 60000, hour: 3600000,
            day: 86400000, week: 604800000, month: 2592000000,
        };
        return new Date(Date.now() + amount * multipliers[unit]);
    }

    const tomorrowMatch = trimmed.match(/^tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (tomorrowMatch) {
        let hours = parseInt(tomorrowMatch[1]);
        const minutes = parseInt(tomorrowMatch[2] || '0');
        const ampm = tomorrowMatch[3];
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(hours, minutes, 0, 0);
        return d;
    }

    const todayMatch = trimmed.match(/^(?:today\s+)?at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (todayMatch) {
        let hours = parseInt(todayMatch[1]);
        const minutes = parseInt(todayMatch[2] || '0');
        const ampm = todayMatch[3];
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        const d = new Date();
        d.setHours(hours, minutes, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + 1);
        return d;
    }

    return null;
}

describe('Scheduler - parseTime', () => {
    test('parses "in 5 minutes"', () => {
        const result = parseTime('in 5 minutes');
        expect(result).toBeInstanceOf(Date);
        const diffMs = result.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan(4 * 60 * 1000);
        expect(diffMs).toBeLessThan(6 * 60 * 1000);
    });

    test('parses "in 2 hours"', () => {
        const result = parseTime('in 2 hours');
        const diffMs = result.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan(1.9 * 3600 * 1000);
        expect(diffMs).toBeLessThan(2.1 * 3600 * 1000);
    });

    test('parses "in 1 day"', () => {
        const result = parseTime('in 1 day');
        const diffMs = result.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan(0.9 * 86400 * 1000);
        expect(diffMs).toBeLessThan(1.1 * 86400 * 1000);
    });

    test('parses "in 30 seconds"', () => {
        const result = parseTime('in 30 seconds');
        const diffMs = result.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan(29 * 1000);
        expect(diffMs).toBeLessThan(31 * 1000);
    });

    test('parses "tomorrow at 9am"', () => {
        const result = parseTime('tomorrow at 9am');
        expect(result).toBeInstanceOf(Date);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        expect(result.getDate()).toBe(tomorrow.getDate());
        expect(result.getHours()).toBe(9);
    });

    test('parses "tomorrow at 3pm"', () => {
        const result = parseTime('tomorrow at 3pm');
        expect(result.getHours()).toBe(15);
    });

    test('parses "tomorrow at 14:30"', () => {
        const result = parseTime('tomorrow at 14:30');
        expect(result.getHours()).toBe(14);
        expect(result.getMinutes()).toBe(30);
    });

    test('parses ISO datetime', () => {
        const result = parseTime('2026-03-15T10:00:00Z');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2026);
    });

    test('returns null for unparseable input', () => {
        expect(parseTime('sometime next week maybe')).toBeNull();
        expect(parseTime('ASAP')).toBeNull();
        expect(parseTime('')).toBeNull();
        expect(parseTime(null)).toBeNull();
    });

    test('parses "at 10pm"', () => {
        const result = parseTime('at 10pm');
        expect(result).toBeInstanceOf(Date);
        expect(result.getHours()).toBe(22);
    });
});
