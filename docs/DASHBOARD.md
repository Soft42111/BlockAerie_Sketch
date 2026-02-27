# Multi-Server Management Dashboard

## Overview
The Dashboard (`src/utils/dashboard.js`) provides a web-based interface for managing your Discord bot and servers.

## Features

### Web Dashboard Interface
- Express server running on port 3000
- Beautiful dark/light theme
- Mobile-responsive design
- Real-time updates via WebSocket

### Server Overview
- Total server count
- Total member count
- Online member tracking
- Active channel counts

### Moderation Tools
- Moderation action history
- Ban/kick/mute tracking
- Moderator statistics
- Action logs with filtering

### Anti-Spam Statistics
- Spam detection counts
- Blocked links/mentions/emojis
- Strike tracking
- Top spammers list

### Reputation System
- User reputation leaderboards
- Top/bottom users
- Average reputation metrics

### Channel Management
- Channel list with statistics
- Create/delete channels
- Channel type filtering

### Role Hierarchy
- Visual role hierarchy
- Permission management
- Role assignment tracking

### Log Viewer
- Real-time log streaming
- Search and filter
- Level-based filtering
- Export capabilities

### Configuration Editor
- Port configuration
- Refresh interval settings
- Widget customization
- Notification preferences

### Backup/Restore
- Create backups
- Restore from backup
- Export data (JSON/CSV)

### OAuth2 Authentication
- Admin login system
- JWT token authentication
- Session management
- Secure password handling

### Real-time Updates
- WebSocket connections
- Live metrics updates
- Instant notifications
- Auto-reconnect

## API Endpoints

### Authentication
```
POST /api/auth/login
POST /api/auth/logout
```

### Health & Metrics
```
GET /api/health              # Health check
GET /api/metrics             # Performance metrics
GET /api/metrics/prometheus  # Prometheus format
```

### Servers
```
GET /api/servers                    # All servers overview
GET /api/servers/:guildId/members   # Member data
GET /api/servers/:guildId/moderation  # Moderation data
GET /api/servers/:guildId/antispam  # Anti-spam data
GET /api/servers/:guildId/reputation  # Reputation data
GET /api/servers/:guildId/channels  # Channel data
GET /api/servers/:guildId/roles  # Role data
```

### Logs & Audit
```
GET /api/logs    # System logs
GET /api/audit   # Audit trail
```

### Configuration
```
GET /api/config           # Get config
PUT /api/config           # Update config
GET /api/theme            # Get theme
PUT /api/theme            # Update theme
```

### Widgets
```
GET /api/widgets          # List widgets
PUT /api/widgets/:id     # Update widget
```

### Notifications
```
GET /api/notifications         # Get notifications
POST /api/notifications        # Create notification
```

### Data Management
```
GET /api/backup    # Create backup
POST /api/restore  # Restore backup
POST /api/export   # Export data
```

## WebSocket Events

### Client → Server
```javascript
// Subscribe to channels
{ type: 'subscribe', channel: 'metrics' }
{ type: 'subscribe', channel: 'servers' }
{ type: 'subscribe', channel: 'moderation' }

// Unsubscribe
{ type: 'unsubscribe', channel: 'metrics' }

// Heartbeat
{ type: 'ping' }

// Perform actions
{ type: 'action', action: 'kick', data: { userId: '123' } }
{ type: 'action', action: 'ban', data: { userId: '456' } }
```

### Server → Client
```javascript
// Connection established
{ type: 'connected', clientId: '...' }

// Data updates
{ type: 'metrics', data: {...}, timestamp: 1234567890 }
{ type: 'servers', data: {...}, timestamp: 1234567890 }
{ type: 'moderation', data: {...}, timestamp: 1234567890 }

// Notifications
{ type: 'notification', data: { message: 'Alert!', type: 'warning' } }

// Client count
{ type: 'clientCount', data: 5 }
```

## Configuration

### Environment Variables
```env
DASHBOARD_ADMIN_USER=admin
DASHBOARD_ADMIN_PASS=securepassword
JWT_SECRET=your-jwt-secret-key
PORT=3000
```

### Default Configuration
```javascript
{
    port: 3000,
    theme: 'dark',
    widgets: [
        { id: 'serverStats', name: 'Server Statistics', enabled: true },
        { id: 'memberCount', name: 'Member Count', enabled: true },
        { id: 'moderationHistory', name: 'Moderation History', enabled: true },
        { id: 'spamStats', name: 'Anti-Spam Statistics', enabled: true },
        { id: 'reputationLeaderboard', name: 'Reputation Leaderboard', enabled: true },
        { id: 'channelManager', name: 'Channel Management', enabled: true },
        { id: 'roleHierarchy', name: 'Role Hierarchy', enabled: true },
        { id: 'logViewer', name: 'Log Viewer', enabled: true }
    ],
    notifications: {
        email: false,
        discord: false,
        browser: true
    },
    refreshInterval: 5000,
    maxLogs: 1000
}
```

## Usage Example

### Basic Setup
```javascript
import dashboardServer from './utils/dashboard.js';

dashboardServer.start();
```

### With Custom Configuration
```javascript
import dashboardServer from './utils/dashboard.js';

const dashboard = new DashboardServer({
    port: 3000
});

dashboard.start();
```

### Integration with Performance Monitor
```javascript
import performanceMonitor from './utils/performanceMonitor.js';
import dashboardServer from './utils/dashboard.js';

performanceMonitor.initialize();
dashboardServer.start();

// Dashboard automatically picks up performance metrics
```

## Dashboard Sections

### Overview
- Real-time performance metrics
- Memory/CPU usage charts
- Active alerts panel

### Servers
- List of all connected servers
- Member counts
- Online status
- Quick actions

### Moderation
- Action history table
- Ban/kick/mute tracking
- Moderator stats
- Filter by action type

### Anti-Spam
- Spam detection statistics
- Blocked content breakdown
- Top spammers
- Strike management

### Reputation
- Leaderboard display
- Top users
- Bottom users
- Score trends

### Channels
- Channel list
- Create new channels
- Delete/archive channels
- Channel settings

### Roles
- Role hierarchy view
- Permission editor
- Color customization
- Member counts

### Logs
- Real-time log stream
- Search functionality
- Level filtering
- Export options

### Settings
- Port configuration
- Refresh intervals
- Widget management
- Theme selection
- Export/backup tools

## Security Considerations

1. **Change Default Credentials**: Update `DASHBOARD_ADMIN_USER` and `DASHBOARD_ADMIN_PASS`
2. **Use Strong JWT Secret**: Set `JWT_SECRET` to a random string
3. **Enable HTTPS in Production**: Use a reverse proxy like nginx
4. **Rate Limit API Requests**: Add rate limiting middleware
5. **Validate All Inputs**: Sanitize user-provided data

## Production Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start src/index.js --name "bot-dashboard"
pm2 logs
pm2 monit
```

### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3000
CMD ["node", "src/index.js"]
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name dashboard.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```
