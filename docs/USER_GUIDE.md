# 🚀 BlockAerie Sketch - Complete User Guide

## 📋 **Table of Contents**
1. [Quick Start](#quick-start)
2. [Core Moderation Commands](#core-moderation-commands)
3. [Role Management](#role-management)
4. [Channel Management](#channel-management)
5. [Anti-Spam & Anti-Raid](#anti-spam--anti-raid)
6. [Automated Moderation Rules](#automated-moderation-rules)
7. [AI-Powered Moderation](#ai-powered-moderation)
8. [User Reputation System](#user-reputation-system)
9. [Web Dashboard](#web-dashboard)
10. [Performance Monitoring](#performance-monitoring)
11. [Webhook Notifications](#webhook-notifications)
12. [Database & Backup](#database--backup)
13. [Testing](#testing)

---

## 🎯 **Quick Start**

### **Required Intents**
Make sure your bot has these intents enabled in the Discord Developer Portal:
- `Guilds` - Server and channel management
- `GuildMembers` - Member information and roles
- `GuildMessages` - Message content and moderation
- `GuildMessageTyping` - Typing indicators
- `DirectMessages` - DM notifications to users
- `MessageContent` - Read message content

### **Required Permissions**
- `Administrator` or these specific permissions:
- `Ban Members` - For ban/unban commands
- `Kick Members` - For kick commands
- `Manage Roles` - For role management
- `Manage Channels` - For channel management
- `Mute Members` - For mute/unmute commands
- `Timeout Members` - For timeout commands
- `Manage Messages` - For purge and moderation
- `View Audit Log` - For logging and evidence
- `Send Messages` - Basic messaging
- `Embed Links` - For rich embed responses

---

## ⚔️ **Core Moderation Commands**

### **Basic Syntax**
```
!command <required> [optional]
```

### **Ban System**
```bash
# Permanent ban
!ban @user [reason]

# Temporary ban (duration: 1m, 1h, 1d, 1w)
!ban @user 7d Spamming

# Ban with delete messages (last 24 hours)
!ban @user 24h Violating rules

# Unban a user
!unban 123456789 [reason]

# Soft ban (ban + immediate unban for message cleanup)
!softban @user [reason]
```

### **Kick System**
```bash
# Kick user
!kick @user [reason]

# Kick with reason
!kick @user Advertising without permission
```

### **Mute System**
```bash
# Mute user temporarily
!mute @user 30m Spamming in chat

# Permanent mute (until manually unmuted)
!mute @user Continued violations

# Unmute user
!unmute @user [reason]
```

### **Timeout System**
```bash
# Timeout user (Discord native timeout)
!timeout @user 1h Too many warnings

# Remove timeout
!untimeout @user [reason]
```

### **Warning System**
```bash
# Issue warning
!warn @user Respect other members

# View your warnings
!warnings

# View specific user's warnings
!warnings @user

# View case details
!case 123
```

### **Moderation Utilities**
```bash
# View moderation log
!modlog set #moderation-logs
!modlog stats

# Escalation settings
!escalation add mute 3warns
!escalation list
!escalation remove 2

# Get help
!modhelp
```

### **Undo Actions**
```bash
# Undo a moderation action
!undo 123 [reason]
```

---

## 👑 **Role Management Commands**

### **Creating & Managing Roles**
```bash
# Create a new role
!role-create Moderators #00FF00

# Create role with options
!role-create VIP gold true true

# Delete a role
!role-delete Moderators

# Rename a role
!role-color @Moderator #FF5733

# Change role color
!role-permissions @Moderator +ManageMessages, -KickMembers
```

### **Assigning Roles**
```bash
# Add role to user
!role-add @user @Moderator

# Remove role from user
!role-remove @user @Moderator

# Batch add roles
!role-batch add @user1 @user2 @Role1 @Role2
```

### **Role Information**
```bash
# View role hierarchy
!role-hierarchy

# View role details
!role-info @Moderator
```

### **Self-Assignable Roles**
```bash
# Add self-assignable role
!role-assignable add @DJ

# Remove self-assignable role
!role-assignable remove @DJ

# List self-assignable roles
!role-assignable

# Claim a self-assignable role
!role-claim @DJ
```

### **Role Templates**
```bash
# Save current roles as template
!role-template save "New Member" @Newbie @Verified

# Apply template to user
!role-template apply "New Member" @user

# List saved templates
!role-template list

# Delete template
!role-template delete "New Member"
```

---

## 📢 **Channel Management Commands**

### **Creating & Managing Channels**
```bash
# Create a new channel
!channel-create text general
!channel-create voice "Voice Chat" 10

# Create with topic
!channel-create text welcome "Welcome to our server!"

# Create forum channel
!channel-create forum feedback

# Delete a channel
!channel-delete #old-channel
```

### **Channel Lockdown**
```bash
# Quick lockdown (no one can send)
!lockdown Raiding in progress!

# Selective lockdown (specific roles)
!lockdown selective @Moderators @Admins

# Unlock channel
!lockdown unlock

# Check lockdown status
!lockdown status
```

### **Channel Settings**
```bash
# Rename channel
!channel-rename #general Main Chat

# Set channel topic
!channel-topic #rules "Please read before posting"

# Set slowmode (presets or seconds)
!channel-slowmode #general 5m
!channel-slowmode #chat 10

# Archive channel (read-only)
!channel-archive #old-news
```

### **Message Management**
```bash
# Bulk delete messages
!channel-purge 100
!channel-purge 50 @spammer

# Clone channel with settings
!channel-clone #original #clone
```

### **Thread Management**
```bash
# Create thread
!thread-create #general "Discussion"

# Archive thread
!thread-archive #thread-name

# Lock thread
!thread-lock #thread-name
```

---

## 🛡️ **Anti-Spam & Anti-Raid**

### **Configuration**
The anti-spam system automatically:
- Limits messages to 3 per second, 20 per minute
- Detects duplicate messages (within 5 seconds)
- Blocks excessive mentions (5+ per message)
- Prevents link spam (discord.gg, http/https)
- Detects emoji spam (8+ emojis)

### **Anti-Raid Protection**
Automatic protection triggers when:
- 10+ users join within 1 minute
- New accounts (<7 days) are joining rapidly
- Suspicious username patterns detected

### **Raid Response Levels**
| Level | Response |
|-------|----------|
| 1 | Enhanced verification |
| 2 | CAPTCHA challenge |
| 3 | Auto-lockdown enabled |
| 4 | Automatic ban of suspicious accounts |

### **Manual Controls**
```bash
# Manual lockdown
antiSpam.manualLockdown(guildId, reason)

# Disable raid mode
antiSpam.manualRaidMode(guildId, false)

# View anti-spam dashboard
antiSpam.getDashboardData(guildId)
```

### **Configuration File**
Located at `data/antispam-config.json`:
```json
{
  "messageRateLimit": 3,
  "joinRateThreshold": 10,
  "raidModeEnabled": true,
  "autoLockdown": true,
  "newAccountDays": 7
}
```

---

## ⚙️ **Automated Moderation Rules**

### **Creating Rules**
```javascript
// Example: Auto-mute after 3 warnings
autoModeration.createRule({
    name: "Auto-mute repeat offenders",
    trigger: { type: "warning_count", value: 3 },
    action: { type: "mute", duration: "1h" },
    priority: 10,
    enabled: true
});
```

### **Available Triggers**
| Trigger Type | Description |
|--------------|-------------|
| `message_content` | Match text patterns |
| `keyword_match` | Match keywords |
| `regex_match` | Match regex patterns |
| `join_pattern` | Detect join surges |
| `message_rate` | High message frequency |
| `warning_count` | User receives N warnings |

### **Available Actions**
| Action | Parameters |
|--------|------------|
| `warn` | - |
| `mute` | duration |
| `kick` | - |
| `ban` | duration |
| `delete` | - |
| `timeout` | duration |
| `role_add` | role_id |
| `role_remove` | role_id |
| `dm_user` | message |

### **Rule Templates**
```bash
# Apply spam template
autoModeration.applyTemplate("spam")

# Apply harassment template
autoModeration.applyTemplate("harassment")

# Apply invite link filter
autoModeration.applyTemplate("invite_filter")
```

---

## 🤖 **AI-Powered Moderation**

### **Sentiment Analysis**
The bot uses Google Gemini for:
- Toxicity detection
- Sentiment scoring
- Context understanding
- False positive reduction

### **Configuration**
```javascript
// Enable AI moderation
const aiModeration = {
    enabled: true,
    confidenceThreshold: 0.8,
    autoResponse: true,
    educationMode: true
};
```

### **Features**
- Analyzes message sentiment (0-1 scale)
- Classifies violations (harassment, spam, explicit)
- Sends educational responses for borderline cases
- Learns from moderator overrides (feedback system)

---

## ⭐ **User Reputation System**

### **Voting on Messages**
```bash
# Upvote a helpful message (with reaction or command)
!upvote @user
!downvote @user

# Vote with reason
!upvote @user Great explanation!
```

### **Reputation Tiers**
| Tier | Score Range | Color |
|------|-------------|-------|
| 🔴 New | -100 to -50 | Gray |
| 🟡 Regular | -50 to 0 | Default |
| 🟢 Trusted | 0 to 100 | Green |
| 🔵 Veteran | 100 to 500 | Blue |
| 🟣 Legend | 500+ | Purple |

### **Reputation Commands**
```bash
# View your reputation
!reputation

# View user's reputation
!reputation @user

# Weekly leaderboard
!leaderboard weekly

# Monthly leaderboard
!leaderboard monthly

# All-time leaderboard
!leaderboard

# Gift reputation
!repgift @user 5
```

### **Benefits by Tier**
| Tier | Benefits |
|------|----------|
| Trusted+ | View leaderboard |
| Veteran+ | Gift reputation |
| Legend | Can downvote, special permissions |

---

## 🌐 **Web Dashboard**

### **Access**
```bash
# Start dashboard
dashboardServer.start()

# Access at
http://localhost:3000
```

### **Features**
- 📊 **Overview** - Server statistics
- 👥 **Members** - Member management
- ⚔️ **Moderation** - Action history
- 🛡️ **Anti-Spam** - Spam detection stats
- ⭐ **Reputation** - Leaderboards
- 📢 **Channels** - Channel management
- 👑 **Roles** - Role hierarchy
- 📋 **Logs** - Audit logs
- ⚙️ **Settings** - Configuration

### **Authentication**
- OAuth2 with Discord login
- JWT-based sessions
- Admin role required

---

## 📊 **Performance Monitoring**

### **Metrics Tracked**
- Command execution times
- Message processing rate
- Database query performance
- Memory usage (heap/RSS)
- CPU usage
- Event loop lag
- WebSocket latency
- Rate limit status

### **API Endpoints**
```bash
GET /api/metrics/prometheus  # Prometheus format
GET /api/stats              # JSON stats
GET /api/health             # Health check
```

### **Alerts**
Automatic alerts when:
- Memory > 80% usage
- Command > 1s execution time
- Event loop > 100ms lag
- Rate limit approaching

---

## 🔔 **Webhook Notifications**

### **Setup**
```javascript
// Create webhook
webhookManager.createWebhook(guildId, {
    channelId: "123456789",
    name: "Moderation Logs"
});
```

### **Notification Types**
- Moderation actions (ban, kick, mute, warn)
- Security alerts (spam, raid detected)
- User activity (joins, leaves)
- Server changes
- Daily summaries

### **Priority Levels**
| Priority | Use Case |
|----------|----------|
| 🔴 URGENT | Bans, kicks, security alerts |
| 🟡 NORMAL | Warnings, joins, leaves |
| 🟢 LOW | Daily summaries, statistics |

---

## 💾 **Database & Backup**

### **Database Location**
```
data/bot_database.sqlite
```

### **Tables**
- `users` - User profiles and reputation
- `moderation_logs` - All moderation actions
- `server_settings` - Guild configurations
- `anti_spam_records` - Spam violation history
- `user_reputation` - Vote tracking

### **Backup**
```javascript
// Create backup
databaseManager.backup("backup_file.sqlite");

// Restore from backup
databaseManager.restore("backup_file.sqlite");
```

### **Stats**
```javascript
// Get database statistics
const stats = await databaseManager.getStats();
console.log(stats);
```

---

## 🧪 **Testing**

### **Run Tests**
```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Specific test file
npm test moderation.test.js
```

### **Test Categories**
- ✅ Unit tests (core functions)
- ✅ Integration tests (commands)
- ✅ Database tests (CRUD operations)
- ✅ Anti-spam tests
- ✅ Role management tests
- ✅ Channel management tests
- ✅ Performance benchmarks

### **Mock Testing**
Uses mocked Discord.js for testing without live connection.

---

## 🚨 **Troubleshooting**

### **Bot Not Responding**
1. Check bot has correct intents
2. Verify permissions
3. Check bot is online
4. Review console for errors

### **Commands Not Working**
1. User needs proper permissions
2. Role hierarchy issues
3. Missing required arguments
4. Bot rate limited

### **Anti-Spam Too Aggressive**
1. Adjust thresholds in config
2. Add whitelisted users/roles
3. Disable specific checks
4. Increase cooldowns

### **Dashboard Not Loading**
1. Check port 3000 is available
2. Verify OAuth2 configuration
3. Check admin role permissions

---

## 📚 **File Structure**

```
pfp prompt generator/
├── src/
│   ├── index.js                    # Main bot file
│   ├── commands/
│   │   ├── moderation.js          # Moderation commands
│   │   ├── roleManagement.js      # Role commands
│   │   └── channelManagement.js   # Channel commands
│   └── utils/
│       ├── database.js            # SQLite database
│       ├── antiSpam.js            # Anti-spam/raid
│       ├── autoModeration.js      # Auto mod rules
│       ├── webhookManager.js       # Webhook integration
│       ├── reputationSystem.js    # User reputation
│       ├── performanceMonitor.js  # Performance tracking
│       ├── dashboard.js           # Web dashboard
│       └── documentationReader.js # Doc parsing
├── docs/
│   ├── skills.md                  # Bot capabilities
│   ├── commands.md                # Command reference
│   └── moderation-guide.md        # Moderation guide
├── tests/                         # Test suite
├── data/
│   ├── bot_database.sqlite        # Main database
│   ├── antispam-config.json      # Anti-spam config
│   └── violations/                # Violation logs
└── package.json
```

---

## 🎉 **Quick Reference**

### **Essential Commands**
| Command | Description |
|---------|-------------|
| `!ban @user [reason]` | Ban user |
| `!kick @user [reason]` | Kick user |
| `!mute @user [time]` | Mute user |
| `!warn @user [reason]` | Warn user |
| `!warnings` | View warnings |
| `!role-add @user @role` | Add role |
| `!lockdown [reason]` | Lock server |
| `!channel-create text name` | Create channel |

### **Emergency Actions**
```bash
# Immediate lockdown
!lockdown EMERGENCY

# Mass ban spammers
!ban @spammer1 @spammer2 @spammer3

# Enable raid mode
# (automatic or manual)
```

---

## 📞 **Support**

- 📖 Documentation: `/docs/`
- 💾 Logs: `data/logs/`
- 🔧 Config: `config.js`
- 🐛 Issues: Check console errors

---

**🎨 BlockAerie Sketch - Enterprise-Grade Discord Moderation Bot**