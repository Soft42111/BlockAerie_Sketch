# Performance Monitoring System

## Overview
The Performance Monitoring System (`src/utils/performanceMonitor.js`) provides real-time metrics tracking, alerting, and optimization suggestions for your Discord bot.

## Features

### Real-time Metrics Tracking
- **Command Execution Times**: Track how long each command takes to execute
- **Message Processing Rate**: Monitor messages processed per minute
- **Database Query Performance**: Track query durations and success rates
- **Memory Usage**: Heap, RSS, external memory tracking
- **CPU Usage**: Process CPU consumption percentages
- **Event Loop Lag**: Monitor Node.js event loop delays
- **WebSocket Latency**: Track connection latency for each WebSocket
- **Rate Limit Tracking**: Monitor API rate limit usage

### Performance Alerts
Configure thresholds for automatic alerts:
```javascript
performanceMonitor.initialize({
    thresholds: {
        commandExecution: 1000,   // Alert if command takes > 1s
        messageProcessing: 500,    // Alert if message processing > 500ms
        databaseQuery: 200,       // Alert if DB query > 200ms
        memoryHeap: 524288000,    // Alert if heap > 500MB
        cpuUsage: 80,             // Alert if CPU > 80%
        eventLoopLag: 100,        // Alert if event loop lags > 100ms
        websocketLatency: 500     // Alert if WS latency > 500ms
    }
});
```

### Slow Command Detection
Automatically detects and logs commands exceeding thresholds:
```javascript
// Commands are tracked automatically
await performanceMonitor.trackCommandExecution('help', 1500, { success: true });
```

### Memory Leak Detection
Analyzes memory growth patterns over time:
- Detects memory growing > 20% over 1 minute
- Calculates growth rate trend
- Generates alerts for potential memory leaks

### Database Connection Pool Monitoring
Track pool metrics:
```javascript
performanceMonitor.updateConnectionPoolMetrics({
    activeConnections: 5,
    idleConnections: 10,
    waitingRequests: 2,
    queryWaitTime: [10, 15, 20]
});
```

### Prometheus Export
Expose metrics in Prometheus format for external monitoring:
```
GET /api/metrics/prometheus
```

Output includes:
- `bot_command_duration_seconds{command="help"}`
- `bot_memory_heap_bytes`
- `bot_memory_rss_bytes`
- `bot_cpu_usage_percent`
- `bot_message_rate_messages_per_minute`
- `bot_database_query_duration_seconds{type="SELECT"}`
- `bot_event_loop_lag_seconds`
- `bot_websocket_latency_seconds`
- `bot_alerts_active`

### Auto-Optimization Suggestions
System analyzes metrics and suggests improvements:
- Memory optimization when heap > 80%
- Database optimization when avg query time > 100ms
- Command optimization for frequently slow commands
- Pool size recommendations

## API Reference

### `initialize(config)`
Initialize the monitor with custom configuration.

### `trackCommandExecution(name, duration, metadata)`
Track a command execution.

### `trackMessageProcessing(duration, channelType, success)`
Track message processing time.

### `trackDatabaseQuery(type, duration, success)`
Track database query performance.

### `trackWebSocketLatency(latency, connectionId)`
Track WebSocket latency.

### `trackRateLimit(type, current, maximum, resetIn)`
Track rate limit usage.

### `updateConnectionPoolMetrics(metrics)`
Update connection pool statistics.

### `getMetrics()`
Get current metrics summary.

### `getDetailedMetrics()`
Get full metrics with history.

### `getHistory(metricType, duration)`
Get historical data for a specific metric.

### `exportMetrics(format)`
Export metrics as JSON or Prometheus format.

### `acknowledgeAlert(alertId)`
Mark an alert as acknowledged.

### `clearAlerts(olderThan)`
Clear old alerts.

### `shutdown()`
Stop the monitoring system.

## Events
The monitor emits events for real-time updates:
- `collectionStarted`
- `collectionStopped`
- `alert` - New alert created
- `memoryMetrics` - New memory metrics collected
- `cpuMetrics` - New CPU metrics collected
- `commandExecution` - Command executed
- `messageProcessing` - Message processed
- `databaseQuery` - Database query completed
- `websocketLatency` - Latency measured
- `optimizationSuggestions` - New suggestions available

## Usage Example
```javascript
import performanceMonitor from './utils/performanceMonitor.js';

performanceMonitor.initialize({
    thresholds: {
        commandExecution: 500,
        memoryHeap: 400000000
    }
});

// Track commands
performanceMonitor.trackCommandExecution('generate', 245, { success: true });

// Get current metrics
const metrics = performanceMonitor.getMetrics();
console.log(metrics);

// Get Prometheus format
const prometheus = performanceMonitor.getPrometheusMetrics();
```
