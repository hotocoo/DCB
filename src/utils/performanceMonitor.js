/**
 * Performance monitoring and health check utilities
 */

import os from 'node:os';
import { logger } from '../logger.js';

/**
 * Performance metrics tracker
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      commandExecutions: new Map(),
      errors: new Map(),
      responseTimes: [],
      memoryUsage: [],
      startTime: Date.now()
    };

    this.maxHistorySize = 1000;
  }

  /**
   * Record command execution
   * @param {string} commandName - Name of the command
   * @param {number} duration - Execution duration in ms
   * @param {boolean} success - Whether execution was successful
   */
  recordCommand(commandName, duration, success = true) {
    if (!this.metrics.commandExecutions.has(commandName)) {
      this.metrics.commandExecutions.set(commandName, {
        count: 0,
        totalDuration: 0,
        errors: 0,
        avgDuration: 0
      });
    }

    const stats = this.metrics.commandExecutions.get(commandName);
    stats.count++;
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.count;

    if (!success) {
      stats.errors++;
    }

    // Record response time
    this.metrics.responseTimes.push({
      command: commandName,
      duration,
      timestamp: Date.now()
    });

    // Keep only recent history
    if (this.metrics.responseTimes.length > this.maxHistorySize) {
      this.metrics.responseTimes.shift();
    }
  }

  /**
   * Record an error
   * @param {string} errorType - Type of error
   * @param {Error} error - Error object
   */
  recordError(errorType, error) {
    if (!this.metrics.errors.has(errorType)) {
      this.metrics.errors.set(errorType, {
        count: 0,
        lastOccurrence: null,
        lastMessage: null
      });
    }

    const errorStats = this.metrics.errors.get(errorType);
    errorStats.count++;
    errorStats.lastOccurrence = Date.now();
    errorStats.lastMessage = error?.message || 'Unknown error';

    logger.debug('Error recorded', { errorType, count: errorStats.count });
  }

  /**
   * Record memory usage snapshot
   */
  recordMemoryUsage() {
    const usage = process.memoryUsage();
    
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    });

    // Keep only recent history
    if (this.metrics.memoryUsage.length > this.maxHistorySize) {
      this.metrics.memoryUsage.shift();
    }
  }

  /**
   * Get command statistics
   * @param {string} commandName - Optional command name filter
   * @returns {object} Command statistics
   */
  getCommandStats(commandName = null) {
    if (commandName) {
      return this.metrics.commandExecutions.get(commandName) || null;
    }

    const stats = {};
    for (const [name, data] of this.metrics.commandExecutions.entries()) {
      stats[name] = data;
    }
    return stats;
  }

  /**
   * Get top slowest commands
   * @param {number} limit - Number of results
   * @returns {Array} Top slowest commands
   */
  getTopSlowestCommands(limit = 10) {
    const commands = Array.from(this.metrics.commandExecutions.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);

    return commands;
  }

  /**
   * Get error statistics
   * @returns {object} Error statistics
   */
  getErrorStats() {
    const stats = {};
    for (const [type, data] of this.metrics.errors.entries()) {
      stats[type] = data;
    }
    return stats;
  }

  /**
   * Get system health metrics
   * @returns {object} System health metrics
   */
  getHealthMetrics() {
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const systemUptime = os.uptime();

    return {
      status: 'healthy',
      uptime: {
        process: uptime,
        system: systemUptime,
        processFormatted: this.formatUptime(uptime),
        systemFormatted: this.formatUptime(systemUptime)
      },
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2),
        heapUsagePercent: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(2),
        rss: mem.rss,
        rssMB: (mem.rss / 1024 / 1024).toFixed(2),
        external: mem.external,
        externalMB: (mem.external / 1024 / 1024).toFixed(2)
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        totalMemory: os.totalmem(),
        totalMemoryMB: (os.totalmem() / 1024 / 1024).toFixed(2),
        freeMemory: os.freemem(),
        freeMemoryMB: (os.freemem() / 1024 / 1024).toFixed(2),
        loadAverage: os.loadavg()
      },
      commands: {
        total: Array.from(this.metrics.commandExecutions.values())
          .reduce((sum, stats) => sum + stats.count, 0),
        errors: Array.from(this.metrics.commandExecutions.values())
          .reduce((sum, stats) => sum + stats.errors, 0)
      },
      errors: {
        total: Array.from(this.metrics.errors.values())
          .reduce((sum, stats) => sum + stats.count, 0),
        types: this.metrics.errors.size
      }
    };
  }

  /**
   * Format uptime in human-readable format
   * @param {number} seconds - Uptime in seconds
   * @returns {string} Formatted uptime
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Get average response time
   * @param {number} minutes - Time window in minutes
   * @returns {number} Average response time in ms
   */
  getAverageResponseTime(minutes = 5) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const recent = this.metrics.responseTimes.filter(r => r.timestamp > cutoff);

    if (recent.length === 0) return 0;

    const sum = recent.reduce((total, r) => total + r.duration, 0);
    return sum / recent.length;
  }

  /**
   * Check if system is under heavy load
   * @returns {boolean} True if system is under load
   */
  isUnderHeavyLoad() {
    const mem = process.memoryUsage();
    const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100;
    const loadAvg = os.loadavg()[0]; // 1-minute load average
    const cpuCount = os.cpus().length;

    return heapUsagePercent > 90 || loadAvg > cpuCount * 2;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.commandExecutions.clear();
    this.metrics.errors.clear();
    this.metrics.responseTimes = [];
    this.metrics.memoryUsage = [];
    this.metrics.startTime = Date.now();
    
    logger.info('Performance metrics reset');
  }

  /**
   * Generate performance report
   * @returns {object} Performance report
   */
  generateReport() {
    const health = this.getHealthMetrics();
    const slowestCommands = this.getTopSlowestCommands(5);
    const errorStats = this.getErrorStats();
    const avgResponseTime = this.getAverageResponseTime(5);

    return {
      timestamp: new Date().toISOString(),
      health,
      performance: {
        averageResponseTime: avgResponseTime.toFixed(2),
        slowestCommands,
        totalCommands: health.commands.total,
        errorRate: health.commands.total > 0 
          ? ((health.commands.errors / health.commands.total) * 100).toFixed(2) + '%'
          : '0%'
      },
      errors: errorStats,
      warnings: {
        heavyLoad: this.isUnderHeavyLoad(),
        highMemoryUsage: health.memory.heapUsagePercent > 80
      }
    };
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Start periodic memory tracking
let memoryTrackingInterval = null;

/**
 * Start memory tracking
 * @param {number} intervalMs - Tracking interval in milliseconds
 */
export function startMemoryTracking(intervalMs = 60000) {
  if (memoryTrackingInterval) {
    clearInterval(memoryTrackingInterval);
  }

  memoryTrackingInterval = setInterval(() => {
    performanceMonitor.recordMemoryUsage();
  }, intervalMs);

  logger.info('Memory tracking started', { intervalMs });
}

/**
 * Stop memory tracking
 */
export function stopMemoryTracking() {
  if (memoryTrackingInterval) {
    clearInterval(memoryTrackingInterval);
    memoryTrackingInterval = null;
    logger.info('Memory tracking stopped');
  }
}

export default PerformanceMonitor;
