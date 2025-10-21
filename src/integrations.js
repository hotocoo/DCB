import fs from 'fs';
import path from 'path';

const INTEGRATIONS_FILE = path.join(process.cwd(), 'data', 'integrations.json');

// Advanced External API Integration System
class IntegrationManager {
  constructor() {
    this.ensureStorage();
    this.loadIntegrations();
    this.apiCache = new Map();
    this.rateLimiters = new Map();
  }

  ensureStorage() {
    const dir = path.dirname(INTEGRATIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(INTEGRATIONS_FILE)) {
      fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify({
        apiKeys: {},
        usageStats: {},
        cache: {},
        settings: {}
      }));
    }
  }

  loadIntegrations() {
    try {
      const data = JSON.parse(fs.readFileSync(INTEGRATIONS_FILE, 'utf8'));
      this.integrations = data;
    } catch (error) {
      console.error('Failed to load integrations:', error);
      this.integrations = {
        apiKeys: {},
        usageStats: {},
        cache: {},
        settings: {}
      };
    }
  }

  saveIntegrations() {
    try {
      fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify(this.integrations, null, 2));
    } catch (error) {
      console.error('Failed to save integrations:', error);
    }
  }

  // API Key Management
  setAPIKey(service, apiKey) {
    this.integrations.apiKeys[service] = {
      key: apiKey,
      setAt: Date.now(),
      lastUsed: null,
      usageCount: 0
    };
    this.saveIntegrations();
    return true;
  }

  getAPIKey(service) {
    return this.integrations.apiKeys[service];
  }

  // Rate Limiting for External APIs
  checkRateLimit(service) {
    const apiKey = this.getAPIKey(service);
    if (!apiKey) return { allowed: false, reason: 'no_api_key' };

    const now = Date.now();
    const rateLimit = this.getServiceRateLimit(service);

    if (!this.rateLimiters.has(service)) {
      this.rateLimiters.set(service, { requests: [], windowStart: now });
    }

    const limiter = this.rateLimiters.get(service);
    const windowStart = now - rateLimit.windowMs;

    // Clean old requests
    limiter.requests = limiter.requests.filter(time => time > windowStart);

    if (limiter.requests.length >= rateLimit.maxRequests) {
      const resetTime = limiter.requests[0] + rateLimit.windowMs;
      return {
        allowed: false,
        reason: 'rate_limit',
        resetIn: resetTime - now,
        resetAt: new Date(resetTime)
      };
    }

    return { allowed: true };
  }

  recordAPIUsage(service) {
    const apiKey = this.integrations.apiKeys[service];
    if (apiKey) {
      apiKey.lastUsed = Date.now();
      apiKey.usageCount++;

      if (!this.integrations.usageStats[service]) {
        this.integrations.usageStats[service] = { calls: 0, errors: 0, lastError: null };
      }
      this.integrations.usageStats[service].calls++;
    }

    // Update rate limiter
    if (!this.rateLimiters.has(service)) {
      this.rateLimiters.set(service, { requests: [], windowStart: Date.now() });
    }
    this.rateLimiters.get(service).requests.push(Date.now());

    this.saveIntegrations();
  }

  recordAPIError(service, error) {
    if (this.integrations.usageStats[service]) {
      this.integrations.usageStats[service].errors++;
      this.integrations.usageStats[service].lastError = {
        message: error.message,
        timestamp: Date.now()
      };
    }
    this.saveIntegrations();
  }

  getServiceRateLimit(service) {
    const limits = {
      'openweather': { maxRequests: 60, windowMs: 60000 }, // 60 per minute
      'newsapi': { maxRequests: 1000, windowMs: 86400000 }, // 1000 per day
      'jokes': { maxRequests: 100, windowMs: 60000 }, // 100 per minute
      'catfacts': { maxRequests: 50, windowMs: 60000 }, // 50 per minute
      'numbersapi': { maxRequests: 100, windowMs: 60000 } // 100 per minute
    };

    return limits[service] || { maxRequests: 10, windowMs: 60000 };
  }

  // Advanced Caching System
  getCachedData(key, maxAge = 300000) { // 5 minutes default
    const cached = this.apiCache.get(key);
    if (cached && Date.now() - cached.timestamp < maxAge) {
      return cached.data;
    }
    return null;
  }

  setCachedData(key, data) {
    this.apiCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Clean old cache entries
    if (this.apiCache.size > 1000) {
      const oldestKeys = Array.from(this.apiCache.keys()).slice(0, 200);
      oldestKeys.forEach(key => this.apiCache.delete(key));
    }
  }

  // News Integration
  async getNews(query = '', limit = 5) {
    const service = 'newsapi';
    const rateLimit = this.checkRateLimit(service);

    if (!rateLimit.allowed) {
      return { success: false, reason: rateLimit.reason, resetIn: rateLimit.resetIn };
    }

    const apiKey = this.getAPIKey(service);
    if (!apiKey) {
      return { success: false, reason: 'news_api_not_configured' };
    }

    // Check cache
    const cacheKey = `news_${query}_${limit}`;
    const cached = this.getCachedData(cacheKey, 1800000); // 30 minutes
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      const response = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&apiKey=${apiKey.key}&pageSize=${limit}&sortBy=publishedAt`);

      if (!response.ok) {
        throw new Error(`News API error: ${response.status}`);
      }

      const data = await response.json();
      this.recordAPIUsage(service);

      // Cache the results
      this.setCachedData(cacheKey, data.articles);

      return { success: true, data: data.articles };
    } catch (error) {
      this.recordAPIError(service, error);
      return { success: false, reason: error.message };
    }
  }

  // Jokes Integration
  async getRandomJoke() {
    const service = 'jokes';
    const rateLimit = this.checkRateLimit(service);

    if (!rateLimit.allowed) {
      return { success: false, reason: rateLimit.reason };
    }

    try {
      const response = await fetch('https://official-joke-api.appspot.com/random_joke');

      if (!response.ok) {
        throw new Error(`Joke API error: ${response.status}`);
      }

      const joke = await response.json();
      this.recordAPIUsage(service);

      return { success: true, data: joke };
    } catch (error) {
      this.recordAPIError(service, error);
      return { success: false, reason: error.message };
    }
  }

  // Cat Facts Integration
  async getCatFact() {
    const service = 'catfacts';
    const rateLimit = this.checkRateLimit(service);

    if (!rateLimit.allowed) {
      return { success: false, reason: rateLimit.reason };
    }

    try {
      const response = await fetch('https://catfact.ninja/fact');

      if (!response.ok) {
        throw new Error(`Cat Facts API error: ${response.status}`);
      }

      const fact = await response.json();
      this.recordAPIUsage(service);

      return { success: true, data: fact };
    } catch (error) {
      this.recordAPIError(service, error);
      return { success: false, reason: error.message };
    }
  }

  // Numbers API Integration
  async getNumberFact(number = null) {
    const service = 'numbersapi';
    const rateLimit = this.checkRateLimit(service);

    if (!rateLimit.allowed) {
      return { success: false, reason: rateLimit.reason };
    }

    const targetNumber = number || Math.floor(Math.random() * 1000) + 1;

    try {
      const response = await fetch(`http://numbersapi.com/${targetNumber}?json`);

      if (!response.ok) {
        throw new Error(`Numbers API error: ${response.status}`);
      }

      const fact = await response.json();
      this.recordAPIUsage(service);

      return { success: true, data: fact };
    } catch (error) {
      this.recordAPIError(service, error);
      return { success: false, reason: error.message };
    }
  }

  // Dad Jokes Integration
  async getDadJoke() {
    try {
      const response = await fetch('https://icanhazdadjoke.com/', {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Dad Jokes API error: ${response.status}`);
      }

      const joke = await response.json();

      return { success: true, data: joke };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  // Programming Quotes
  async getProgrammingQuote() {
    try {
      const response = await fetch('https://programming-quotes-api.herokuapp.com/quotes/random');

      if (!response.ok) {
        throw new Error(`Programming Quotes API error: ${response.status}`);
      }

      const quote = await response.json();

      return { success: true, data: quote };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  // GitHub Integration
  async getGitHubStats(username) {
    try {
      const response = await fetch(`https://api.github.com/users/${username}`);

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const user = await response.json();

      return {
        success: true,
        data: {
          name: user.name,
          bio: user.bio,
          location: user.location,
          publicRepos: user.public_repos,
          followers: user.followers,
          following: user.following,
          created: user.created_at
        }
      };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  // Weather Integration (Enhanced)
  async getWeather(location) {
    const service = 'openweather';
    const rateLimit = this.checkRateLimit(service);

    if (!rateLimit.allowed) {
      return { success: false, reason: rateLimit.reason };
    }

    const apiKey = this.getAPIKey(service);
    if (!apiKey) {
      return { success: false, reason: 'weather_api_not_configured' };
    }

    try {
      const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey.key}&units=metric`);

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      this.recordAPIUsage(service);

      return { success: true, data };
    } catch (error) {
      this.recordAPIError(service, error);
      return { success: false, reason: error.message };
    }
  }

  // Advanced Features
  getIntegrationStats() {
    return {
      apiKeys: Object.keys(this.integrations.apiKeys).length,
      totalUsage: Object.values(this.integrations.usageStats).reduce((sum, stats) => sum + stats.calls, 0),
      totalErrors: Object.values(this.integrations.usageStats).reduce((sum, stats) => sum + stats.errors, 0),
      cacheSize: this.apiCache.size,
      rateLimitStatus: this.getRateLimitStatus()
    };
  }

  getRateLimitStatus() {
    const status = {};

    for (const service of ['openweather', 'newsapi', 'jokes', 'catfacts', 'numbersapi']) {
      const rateLimit = this.checkRateLimit(service);
      status[service] = {
        allowed: rateLimit.allowed,
        remaining: rateLimit.allowed ? 'unknown' : Math.ceil(rateLimit.resetIn / 1000)
      };
    }

    return status;
  }

  // API Health Monitoring
  async checkAPIHealth() {
    const health = {};

    // Test each configured API
    for (const [service, apiKey] of Object.entries(this.integrations.apiKeys)) {
      try {
        let testResult;

        switch (service) {
          case 'openweather':
            testResult = await this.getWeather('London');
            break;
          case 'newsapi':
            testResult = await this.getNews('technology', 1);
            break;
          default:
            testResult = await this.getDadJoke();
        }

        health[service] = {
          status: testResult.success ? 'healthy' : 'error',
          lastCheck: Date.now(),
          error: testResult.success ? null : testResult.reason
        };
      } catch (error) {
        health[service] = {
          status: 'error',
          lastCheck: Date.now(),
          error: error.message
        };
      }
    }

    return health;
  }

  // Cleanup and Maintenance
  cleanup() {
    // Clean old cache
    const now = Date.now();
    for (const [key, cached] of this.apiCache) {
      if (now - cached.timestamp > 3600000) { // 1 hour
        this.apiCache.delete(key);
      }
    }

    // Clean old rate limit data
    for (const [service, limiter] of this.rateLimiters) {
      const cutoff = now - this.getServiceRateLimit(service).windowMs;
      limiter.requests = limiter.requests.filter(time => time > cutoff);
    }

    this.saveIntegrations();
  }
}

// Export singleton instance
export const integrationManager = new IntegrationManager();

// Convenience functions
export async function getNews(query = '', limit = 5) {
  return integrationManager.getNews(query, limit);
}

export async function getRandomJoke() {
  return integrationManager.getRandomJoke();
}

export async function getCatFact() {
  return integrationManager.getCatFact();
}

export async function getNumberFact(number = null) {
  return integrationManager.getNumberFact(number);
}

export async function getDadJoke() {
  return integrationManager.getDadJoke();
}

export async function getProgrammingQuote() {
  return integrationManager.getProgrammingQuote();
}

export async function getGitHubStats(username) {
  return integrationManager.getGitHubStats(username);
}

export async function getWeather(location) {
  return integrationManager.getWeather(location);
}

export function setAPIKey(service, apiKey) {
  return integrationManager.setAPIKey(service, apiKey);
}

export function getAPIKey(service) {
  return integrationManager.getAPIKey(service);
}

export function getIntegrationStats() {
  return integrationManager.getIntegrationStats();
}

// Auto-cleanup every 30 minutes
setInterval(() => {
  integrationManager.cleanup();
}, 30 * 60 * 1000);