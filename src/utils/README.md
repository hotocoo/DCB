# Utility Modules

Comprehensive utility modules for the Discord bot providing robust error handling, performance optimization, and code reusability.

## Modules

### fileStorage.js
Async file operations with atomic writes and locking.

**Features:**
- Async JSON read/write operations
- Atomic writes with temporary files
- File locking to prevent race conditions
- Automatic backup functionality
- File size validation
- Directory management

**Usage:**
```javascript
import { readJSON, writeJSON, backupJSON } from './utils/fileStorage.js';

// Read JSON file
const data = await readJSON('/path/to/file.json', {});

// Write JSON file atomically
await writeJSON('/path/to/file.json', data);

// Create backup
await backupJSON('/path/to/file.json');
```

### apiClient.js
HTTP client with retry logic and timeout handling.

**Features:**
- Automatic retry with exponential backoff
- Configurable timeout handling
- Rate limiting support
- Comprehensive error handling
- Request/response logging

**Usage:**
```javascript
import { getJSON, postJSON, createRateLimitedClient } from './utils/apiClient.js';

// Simple GET request with retry
const data = await getJSON('https://api.example.com/data');

// POST with custom config
const result = await postJSON('https://api.example.com/submit', 
  { key: 'value' }, 
  {}, 
  { timeout: 60000, retries: 5 }
);

// Rate-limited client
const client = createRateLimitedClient(100, 60000); // 100 req/min
const data = await client.getJSON('https://api.example.com/data');
```

### cache.js
Memory-efficient caching with TTL and automatic cleanup.

**Features:**
- Time-to-live (TTL) support
- Automatic expiration
- Hit/miss tracking
- Size limits with LRU eviction
- Statistics tracking
- Multiple cache instances

**Usage:**
```javascript
import { Cache, cacheManager } from './utils/cache.js';

// Create cache
const cache = cacheManager.create('myCache', { 
  ttl: 300000, // 5 minutes
  maxSize: 1000 
});

// Set/get values
cache.set('key', 'value', 60000); // Custom TTL
const value = cache.get('key');

// Get or set with factory
const data = await cache.getOrSet('key', async () => {
  return await fetchExpensiveData();
});

// Stats
console.log(cache.stats());
```

### config.js
Centralized configuration management.

**Features:**
- Environment variable parsing
- Type conversion (int, bool, string)
- Default values
- Configuration validation
- Feature flags
- Nested configuration objects

**Usage:**
```javascript
import { config, validateConfig } from './utils/config.js';

// Access configuration
console.log(config.discord.token);
console.log(config.ai.maxTokens);
console.log(config.features.enableMusic);

// Validate required config
validateConfig();
```

### metrics.js
Performance monitoring and metrics collection.

**Features:**
- Counters, gauges, histograms
- Command execution tracking
- API call monitoring
- Database operation metrics
- Cache performance tracking
- Statistical analysis (p50, p95, p99)

**Usage:**
```javascript
import { metrics } from './utils/metrics.js';

// Record command execution
metrics.recordCommand('rpg', 150, true);

// Record API call
metrics.recordAPICall('openai', 2500, 200);

// Record cache access
metrics.recordCacheAccess('rpg', true);

// Get metrics
const allMetrics = metrics.getMetrics();
const summary = metrics.getSummary();
```

### healthCheck.js
System health monitoring framework.

**Features:**
- Custom health checks
- Discord connection monitoring
- Memory usage tracking
- Uptime monitoring
- Async check execution
- Timeout protection

**Usage:**
```javascript
import { createBotHealthChecks } from './utils/healthCheck.js';

const healthCheck = createBotHealthChecks(client);
const results = await healthCheck.runAll();

console.log(results.status); // 'healthy', 'degraded', or 'unhealthy'
```

### validators.js
Input validation and sanitization.

**Features:**
- String validation with length/pattern
- Number validation with range checking
- User/Guild ID validation
- URL validation with protocol checking
- Email validation
- JSON validation
- XSS protection
- Path traversal prevention

**Usage:**
```javascript
import { validateString, validateNumber, validateURL, sanitizeInput } from './utils/validators.js';

// Validate string
const result = validateString(input, { minLength: 3, maxLength: 32 });
if (!result.valid) {
  console.error(result.error);
}

// Validate number
const numResult = validateNumber(amount, { min: 0, max: 1000, integer: true });

// Validate URL
const urlResult = validateURL(url, { allowedProtocols: ['https:'] });

// Sanitize input
const safe = sanitizeInput(userInput);
```

### rateLimiter.js
Rate limiting for commands and API calls.

**Features:**
- Token bucket algorithm
- Per-user rate limiting
- Configurable windows
- Automatic cleanup
- Reset time tracking

**Usage:**
```javascript
import { commandLimiter } from './utils/rateLimiter.js';

const result = await commandLimiter.check(userId);
if (!result.allowed) {
  console.log(`Rate limited. Wait ${result.waitTime}ms`);
}
```

## Best Practices

1. **Always use async file operations** - Never use sync operations in production
2. **Implement proper error handling** - Catch and log all errors
3. **Use caching wisely** - Set appropriate TTLs for your use case
4. **Monitor performance** - Track metrics for all critical operations
5. **Validate all inputs** - Never trust user input
6. **Rate limit API calls** - Prevent abuse and respect external service limits
7. **Check health regularly** - Monitor system health and respond to issues

## Architecture

```
src/utils/
├── README.md           # This file
├── fileStorage.js      # File I/O operations
├── apiClient.js        # HTTP client
├── cache.js            # Caching system
├── config.js           # Configuration
├── metrics.js          # Monitoring
├── healthCheck.js      # Health checks
├── validators.js       # Input validation
└── rateLimiter.js      # Rate limiting
```

## Migration Guide

### From sync to async file operations:
```javascript
// Before
const data = JSON.parse(fs.readFileSync(file));

// After
const data = await readJSON(file, {});
```

### From fetch to apiClient:
```javascript
// Before
const res = await fetch(url);
const data = await res.json();

// After
const data = await getJSON(url);
```

### From Map cache to Cache utility:
```javascript
// Before
const cache = new Map();
cache.set(key, value);

// After
const cache = cacheManager.create('myCache');
cache.set(key, value, 60000); // With TTL
```
