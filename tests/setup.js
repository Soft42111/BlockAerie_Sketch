import { jest } from '@jest/globals';

jest.setTimeout(10000);

beforeAll(() => {
    console.log('Test suite initialized');
});

afterAll(() => {
    jest.clearAllMocks();
});

global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
};
