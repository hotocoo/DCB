/**
 * Health check system for monitoring bot status
 * @fileoverview Health checks for various bot components
 * @module utils/healthCheck
 */

import { logger } from '../logger.js';

/**
 * Health check result
 */
class HealthCheckResult {
  constructor(name, status, message = '', details = {}) {
    this.name = name;
    this.status = status; // 'healthy', 'degraded', 'unhealthy'
    this.message = message;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Health check manager
 */
export class HealthCheck {
  constructor() {
    this.checks = new Map();
  }

  /**
   * Registers a health check
   * @param {string} name - Check name
   * @param {Function} checkFn - Check function that returns {status, message, details}
   */
  register(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  /**
   * Runs all health checks
   * @returns {Promise<Object>} Health check results
   */
  async runAll() {
    const results = [];
    const startTime = Date.now();

    for (const [name, checkFn] of this.checks.entries()) {
      try {
        const result = await Promise.race([
          checkFn(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        
        results.push(new HealthCheckResult(
          name,
          result.status || 'healthy',
          result.message || '',
          result.details || {}
        ));
      } catch (error) {
        results.push(new HealthCheckResult(
          name,
          'unhealthy',
          error.message,
          { error: error.toString() }
        ));
      }
    }

    const overallStatus = this.determineOverallStatus(results);
    
    return {
      status: overallStatus,
      checks: results,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Determines overall health status
   * @param {HealthCheckResult[]} results - Check results
   * @returns {string} Overall status
   */
  determineOverallStatus(results) {
    if (results.some(r => r.status === 'unhealthy')) {
      return 'unhealthy';
    }
    if (results.some(r => r.status === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Runs a specific health check
   * @param {string} name - Check name
   * @returns {Promise<HealthCheckResult>} Check result
   */
  async run(name) {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      return new HealthCheckResult(name, 'unhealthy', 'Check not found');
    }

    try {
      const result = await checkFn();
      return new HealthCheckResult(
        name,
        result.status || 'healthy',
        result.message || '',
        result.details || {}
      );
    } catch (error) {
      return new HealthCheckResult(
        name,
        'unhealthy',
        error.message,
        { error: error.toString() }
      );
    }
  }
}

/**
 * Creates standard health checks for the bot
 * @param {import('discord.js').Client} client - Discord client
 * @returns {HealthCheck} Health check instance
 */
export function createBotHealthChecks(client) {
  const healthCheck = new HealthCheck();

  // Discord connection check
  healthCheck.register('discord', async () => {
    if (!client.isReady()) {
      return {
        status: 'unhealthy',
        message: 'Discord client not ready'
      };
    }

    return {
      status: 'healthy',
      message: 'Connected to Discord',
      details: {
        guilds: client.guilds.cache.size,
        users: client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0),
        ping: client.ws.ping
      }
    };
  });

  // Memory check
  healthCheck.register('memory', async () => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;

    let status = 'healthy';
    let message = `Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`;

    if (usagePercent > 90) {
      status = 'unhealthy';
      message = `High memory usage: ${usagePercent.toFixed(1)}%`;
    } else if (usagePercent > 75) {
      status = 'degraded';
      message = `Elevated memory usage: ${usagePercent.toFixed(1)}%`;
    }

    return {
      status,
      message,
      details: {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        rss: Math.round(usage.rss / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024)
      }
    };
  });

  // Uptime check
  healthCheck.register('uptime', async () => {
    const uptimeSeconds = process.uptime();
    const uptimeHours = uptimeSeconds / 3600;

    return {
      status: 'healthy',
      message: `Uptime: ${uptimeHours.toFixed(2)} hours`,
      details: {
        seconds: Math.floor(uptimeSeconds),
        hours: uptimeHours.toFixed(2)
      }
    };
  });

  return healthCheck;
}

export default { HealthCheck, createBotHealthChecks };
