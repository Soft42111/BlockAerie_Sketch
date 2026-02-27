# Test Suite Documentation

This document provides comprehensive documentation for the testing suite.

## Overview

The test suite includes:
- **Unit Tests**: Individual function testing
- **Integration Tests**: Command and system integration testing
- **Database Tests**: CRUD operations validation
- **Anti-Spam Tests**: Message filtering and spam detection
- **Role Management Tests**: Permission and role operations
- **Channel Management Tests**: Channel CRUD and configuration
- **Command Parsing Tests**: Input validation and parsing
- **Error Handling Tests**: Error recovery and user feedback
- **Performance Benchmarks**: Load and throughput testing

## Installation

```bash
npm install --save-dev jest
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

## Test Structure

```
tests/
├── setup.js                 # Jest setup and global mocks
├── mocks/
│   ├── discord.js          # Mock Discord.js classes
│   └── database.js         # Mock DatabaseManager
├── reputationSystem.test.js
├── moderation.test.js
├── antiSpam.test.js
├── roleManagement.test.js
├── channelManagement.test.js
├── commandParsing.test.js
├── errorHandling.test.js
├── performance.test.js
└── database.test.js
```

## Mock Classes

### Discord.js Mocks

- `MockDiscordUser`: User object with id, username, tag
- `MockDiscordGuildMember`: Guild member with roles
- `MockDiscordTextChannel`: Text channel with permissions
- `MockDiscordVoiceChannel`: Voice channel
- `MockDiscordCategoryChannel`: Channel category
- `MockDiscordMessage`: Message with content and author
- `MockDiscordGuild`: Guild with members and channels
- `MockDiscordRole`: Role with permissions
- `MockDiscordClient`: Client instance
- `MockInteraction`: Command interaction

### Database Mocks

- `MockDatabase`: SQLite-like database interface
- `MockDatabaseManager`: Database manager with caching

## Writing Tests

### Basic Test Structure

```javascript
describe('Feature Name', () => {
    beforeAll(() => {
        // Setup
    });

    beforeEach(() => {
        // Reset
    });

    it('should do something', () => {
        // Test
    });

    it('should handle edge case', () => {
        // Test
    });
});
```

### Mocking Database

```javascript
import { MockDatabaseManager } from '../mocks/database.js';

describe('Feature', () => {
    let dbManager;

    beforeAll(() => {
        dbManager = new MockDatabaseManager();
    });

    it('should create user', async () => {
        await dbManager.usersCreate('123', 'username');
        const user = await dbManager.usersGetById('123');
        expect(user.username).toBe('username');
    });
});
```

### Mocking Discord.js

```javascript
import { MockDiscordUser, MockDiscordGuild } from '../mocks/discord.js';

describe('Command', () => {
    let mockUser;
    let mockGuild;

    beforeAll(() => {
        mockUser = new MockDiscordUser('123', 'User', 'User#0');
        mockGuild = new MockDiscordGuild('555', 'Test Server');
    });

    it('should kick user', async () => {
        // Test implementation
    });
});
```

## Coverage Configuration

The `jest.config.json` file includes:
- Coverage collection from `src/**/*.js`
- HTML and LCOV report generation
- Coverage thresholds (50% minimum)
- Verbose output

## Performance Testing

Run benchmarks with:

```bash
node tests/performance.test.js
```

Benchmark categories:
- Database operations (query time, bulk inserts)
- Message processing throughput
- Command latency (percentiles)
- Memory usage tracking
- Concurrent operation handling

## CI/CD Integration

The `.github/workflows/ci-cd.yml` provides:
1. Linting and format checking
2. Unit tests with coverage
3. Integration tests
4. Security audits
5. Performance benchmarks
6. Staging and production deployments
7. Notifications

## Test Best Practices

1. **Independent Tests**: Each test should work alone
2. **Clear Naming**: Descriptive test names
3. **Single Assertion**: One thing per test when possible
4. **Mock External Dependencies**: Use provided mocks
5. **Edge Cases**: Test boundaries and errors
6. **Reset State**: Use `beforeEach` for clean state

## Coverage Reports

Coverage reports are generated in `coverage/`:
- `index.html`: HTML report
- `lcov.info`: LCOV format for CI
- Console: Summary during test run

## Troubleshooting

### Common Issues

1. **Timeout Errors**: Increase timeout with `jest.setTimeout(30000)`
2. **Module Not Found**: Check ES module imports
3. **Mock Issues**: Ensure mocks are properly imported

### Debug Mode

```bash
npm test -- --verbose --no-cache
```

## Configuration

### Jest Options

```json
{
  "testEnvironment": "node",
  "testMatch": ["**/tests/**/*.test.js"],
  "collectCoverageFrom": ["src/**/*.js"],
  "coverageDirectory": "coverage",
  "testTimeout": 10000,
  "verbose": true
}
```

## Reporting Bugs

When reporting test failures:
1. Include the full error output
2. Add the test file and line number
3. Describe expected vs actual behavior
4. Provide minimal reproduction steps
