/**
 * Health check system for monitoring bot status
 */

import { performanceMonitor } from './performanceMonitor.js';
import { caches } from './cacheManager.js';
import { logger } from '../logger.js';

/**
 * Health check statuses
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy'
};

/**
 * Health check result
 */
class HealthCheckResult {
  constructor(name, status, details = {}) {
    this.name = name;
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  isHealthy() {
    return this.status === HealthStatus.HEALTHY;
  }
}

/**
 * Health check manager
 */
export class HealthCheckManager {
  constructor() {
    this.checks = new Map();
    this.lastResults = new Map();
    this.checkInterval = null;
  }

  /**
   * Register a health check
   * @param {string} name - Check name
   * @param {Function} checkFn - Check function returning HealthCheckResult
   * @param {object} options - Check options
   */
  register(name, checkFn, options = {}) {
    this.checks.set(name, {
      fn: checkFn,
      timeout: options.timeout || 5000,
      critical: options.critical !== false
    });
    
    logger.info('Health check registered', { name });
  }

  /**
   * Run a single health check
   * @param {string} name - Check name
   * @returns {Promise<HealthCheckResult>} Check result
   */
  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) {
      return new HealthCheckResult(
        name,
        HealthStatus.UNHEALTHY,
        { error: 'Check not found' }
      );
    }

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
      });

      const result = await Promise.race([
        check.fn(),
        timeoutPromise
      ]);

      this.lastResults.set(name, result);
      return result;
    } catch (error) {
      logger.error('Health check failed', error, { name });
      const result = new HealthCheckResult(
        name,
        HealthStatus.UNHEALTHY,
        { error: error.message }
      );
      this.lastResults.set(name, result);
      return result;
    }
  }

  /**
   * Run all health checks
   * @returns {Promise<object>} All check results
   */
  async runAllChecks() {
    const results = {};
    const promises = [];

    for (const [name] of this.checks) {
      promises.push(
        this.runCheck(name).then(result => {
          results[name] = result;
        })
      );
    }

    await Promise.all(promises);

    return results;
  }

  /**
   * Get overall health status
   * @returns {Promise<object>} Overall health status
   */
  async getOverallHealth() {
    const results = await this.runAllChecks();
    const checks = Object.values(results);

    let overallStatus = HealthStatus.HEALTHY;
    let criticalIssues = 0;
    let degradedIssues = 0;

    for (const result of checks) {
      const check = this.checks.get(result.name);
      
      if (result.status === HealthStatus.UNHEALTHY) {
        if (check.critical) {
          criticalIssues++;
          overallStatus = HealthStatus.UNHEALTHY;
        } else {
          degradedIssues++;
          if (overallStatus === HealthStatus.HEALTHY) {
            overallStatus = HealthStatus.DEGRADED;
          }
        }
      } else if (result.status === HealthStatus.DEGRADED) {
        degradedIssues++;
        if (overallStatus === HealthStatus.HEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results,
      summary: {
        total: checks.length,
        healthy: checks.filter(c => c.status === HealthStatus.HEALTHY).length,
        degraded: degradedIssues,
        unhealthy: criticalIssues
      }
    };
  }

  /**
   * Start periodic health checks
   * @param {number} intervalMs - Check interval in milliseconds
   */
  startPeriodicChecks(intervalMs = 60000) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      try {
        const health = await this.getOverallHealth();
        
        if (health.status !== HealthStatus.HEALTHY) {
          logger.warn('Health check detected issues', {
            status: health.status,
            summary: health.summary
          });
        }
      } catch (error) {
        logger.error('Periodic health check failed', error);
      }
    }, intervalMs);

    logger.info('Periodic health checks started', { intervalMs });
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Periodic health checks stopped');
    }
  }
}

// Global health check manager
export const healthCheckManager = new HealthCheckManager();

/**
 * Register default health checks
 */
export function registerDefaultHealthChecks(client = null) {
  // Memory health check
  healthCheckManager.register('memory', async () => {
    const mem = process.memoryUsage();
    const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100;

    let status = HealthStatus.HEALTHY;
    if (heapUsagePercent > 90) {
      status = HealthStatus.UNHEALTHY;
    } else if (heapUsagePercent > 80) {
      status = HealthStatus.DEGRADED;
    }

    return new HealthCheckResult('memory', status, {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      heapUsagePercent: heapUsagePercent.toFixed(2) + '%',
      rss: mem.rss
    });
  }, { critical: true });

  // Discord connection health check
  if (client) {
    healthCheckManager.register('discord', async () => {
      const isReady = client.isReady();
      const ws = client.ws;

      const status = isReady ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY;

      return new HealthCheckResult('discord', status, {
        ready: isReady,
        ping: ws?.ping || null,
        guilds: client.guilds?.cache.size || 0,
        users: client.users?.cache.size || 0
      });
    }, { critical: true });
  }

  // Performance health check
  healthCheckManager.register('performance', async () => {
    const avgResponseTime = performanceMonitor.getAverageResponseTime(5);
    const isUnderLoad = performanceMonitor.isUnderHeavyLoad();

    let status = HealthStatus.HEALTHY;
    if (isUnderLoad || avgResponseTime > 5000) {
      status = HealthStatus.DEGRADED;
    }
    if (avgResponseTime > 10000) {
      status = HealthStatus.UNHEALTHY;
    }

    return new HealthCheckResult('performance', status, {
      averageResponseTime: avgResponseTime.toFixed(2) + 'ms',
      underHeavyLoad: isUnderLoad
    });
  }, { critical: false });

  // Cache health check
  healthCheckManager.register('cache', async () => {
    const stats = {};
    for (const [name, cache] of Object.entries(caches)) {
      stats[name] = cache.getStats();
    }

    return new HealthCheckResult('cache', HealthStatus.HEALTHY, stats);
  }, { critical: false });

  // Disk space health check (if data directory exists)
  healthCheckManager.register('disk', async () => {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      
      const dataDir = path.join(process.cwd(), 'data');
      
      if (!fs.existsSync(dataDir)) {
        return new HealthCheckResult('disk', HealthStatus.HEALTHY, {
          message: 'Data directory not yet created'
        });
      }

      // Simple check - just verify we can write
      const testFile = path.join(dataDir, '.health-check');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      return new HealthCheckResult('disk', HealthStatus.HEALTHY, {
        message: 'Disk write successful'
      });
    } catch (error) {
      return new HealthCheckResult('disk', HealthStatus.UNHEALTHY, {
        error: error.message
      });
    }
  }, { critical: true });

  logger.info('Default health checks registered');
}

/**
 * Create a health check endpoint handler
 * @returns {Function} Express-style handler
 */
export function createHealthCheckEndpoint() {
  return async (req, res) => {
    try {
      const health = await healthCheckManager.getOverallHealth();
      const statusCode = health.status === HealthStatus.HEALTHY ? 200 :
                        health.status === HealthStatus.DEGRADED ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Health check endpoint error', error);
      res.status(500).json({
        status: HealthStatus.UNHEALTHY,
        error: error.message
      });
    }
  };
}

export default HealthCheckManager;
