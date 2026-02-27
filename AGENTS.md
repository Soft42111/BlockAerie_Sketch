# Report and Appeal System

## Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `!report @user <reason>` | Report a user for violating rules | `!report @user spam` |
| `!reports [status]` | List reports (pending/resolved/dismissed) | `!reports pending` |
| `!report resolve <id> <resolution> [note]` | Resolve a report | `!report resolve abc123 resolved Warning issued` |
| `!appeal <reason>` | Submit an appeal (if banned/muted) | `!appeal I apologize for my behavior` |
| `!appeals [status]` | List appeals (moderators only) | `!appeals pending` |
| `!appeal approve\|deny <id> [note]` | Review an appeal | `!appeal approve abc123 Approved after review` |
| `!modstats` | View moderation statistics | `!modstats` |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/:guildId` | Get full dashboard data |
| GET | `/api/reports/:guildId` | Get reports with filters |
| POST | `/api/reports` | Create a new report |
| PATCH | `/api/reports/:reportId/resolve` | Resolve a report |
| POST | `/api/reports/:reportId/comments` | Add comment to report |
| GET | `/api/reports/:guildId/stats` | Get report statistics |
| GET | `/api/appeals/:guildId` | Get appeals with filters |
| POST | `/api/appeals` | Create a new appeal |
| PATCH | `/api/appeals/:appealId/review` | Review an appeal |
| GET | `/api/appeals/:guildId/stats` | Get appeal statistics |

## Setup

1. Initialize the report system:
```javascript
const { initializeReportSystem } = require('./src/commands');
await initializeReportSystem();
```

2. Register commands in your bot:
```javascript
const { reportCommands } = require('./src/commands');

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).split(' ');
    const command = args.shift().toLowerCase();

    switch (command) {
        case 'report':
            if (args[0] === 'resolve' && args[1]) {
                await reportCommands.resolveReport(client, message, args.slice(1));
            } else {
                await reportCommands.report(client, message, args);
            }
            break;
        case 'reports':
            await reportCommands.reports(client, message, args);
            break;
        case 'appeal':
            if (args[0] === 'approve' || args[0] === 'deny') {
                await reportCommands.reviewAppeal(client, message, args.slice(1));
            } else {
                await reportCommands.appeal(client, message, args);
            }
            break;
        case 'appeals':
            await reportCommands.appeals(client, message, args);
            break;
        case 'modstats':
            await reportCommands.getStats(client, message, args);
            break;
    }
});
```

## Configuration

Create channels for moderation:
- `#mod-reports` or `#reports` - receives report notifications
- `#mod-log` or `#appeals` - receives appeal notifications

## Features

- **Public Reporting**: Users can report rule violators
- **Anonymous Reporting**: Reporters can choose to remain anonymous
- **Priority System**: Automatic priority assignment based on reason keywords
- **Report Tracking**: Track all reports with status, comments, and resolution notes
- **Ban/Mute Appeals**: Users can appeal punishments with detailed reasons
- **Appeal Queue**: Moderators can review appeals in order
- **Statistics**: Track report and appeal metrics
- **Notifications**: Users notified when their reports/appeals are processed

---

# Welcome and Goodbye System

## Commands

### Welcome Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `!welcome setup #channel` | Quick setup with a channel | `!welcome setup #welcome` |
| `!welcome channel #channel` | Set welcome channel | `!welcome channel #general` |
| `!welcome message <text>` | Set welcome message | `!welcome message Welcome {user}!` |
| `!welcome role @role` | Auto-assign role on join | `!welcome role @NewMember` |
| `!welcome birthday @role` | Set birthday role | `!welcome birthday @BirthdayStar` |
| `!welcome test` | Test welcome message | `!welcome test` |
| `!welcome virtual <name>` | Test with fake user | `!welcome virtual JohnDoe` |
| `!welcome delay <seconds>` | Delay welcome (0-300s) | `!welcome delay 5` |
| `!welcome image <url>` | Set welcome image/GIF | `!welcome image https://example.com/welcome.gif` |
| `!welcome color <hex>` | Set embed color | `!welcome color #5865F2` |
| `!welcome milestones <on/off>` | Toggle member count milestones | `!welcome milestones on` |
| `!welcome disable` | Disable welcome system | `!welcome disable` |
| `!welcome enable` | Enable welcome system | `!welcome enable` |
| `!welcome status` | View current settings | `!welcome status` |

### Goodbye Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `!goodbye channel #channel` | Set goodbye channel | `!goodbye channel #goodbye` |
| `!goodbye message <text>` | Set goodbye message | `!goodbye message Bye {user}!` |
| `!goodbye image <url>` | Set goodbye image/GIF | `!goodbye image https://example.com/bye.gif` |
| `!goodbye color <hex>` | Set embed color | `!goodbye color #ED4245` |

## Placeholders

| Placeholder | Description |
|-------------|-------------|
| `{user}` | Mentions the user |
| `{username}` | User's username |
| `{usertag}` | User's tag (username#discriminator) |
| `{userid}` | User's ID |
| `{userAvatar}` | User's avatar URL |
| `{server}` | Server name |
| `{serverIcon}` | Server icon URL |
| `{memberCount}` | Current member count |
| `{createdAt}` | Account creation date |
| `{joinedAt}` | Server join date |
| `{nl}` | New line |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers/:guildId/welcome` | Get welcome config for a guild |
| PUT | `/api/servers/:guildId/welcome` | Update welcome config for a guild |
| GET | `/api/welcome/all` | Get all welcome configs |
| POST | `/api/servers/:guildId/welcome/test` | Trigger test welcome |

## Features

- **Embed Support**: Rich embeds with colors, images, thumbnails, and footers
- **GIF/Image Support**: Custom welcome/goodbye images and GIFs
- **Join Role Assignment**: Auto-assign roles when members join
- **Birthday Role**: Separate birthday role assignment
- **Delayed Messages**: Configurable delay (0-300 seconds)
- **Leave Reason Tracking**: Automatically tracks if users were kicked/banned
- **Member Count Milestones**: Announce when hitting milestone member counts
- **Virtual Welcome**: Test with pseudonym users
- **Dashboard Integration**: Manage via web dashboard
