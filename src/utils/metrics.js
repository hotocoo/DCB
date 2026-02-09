/**
 * Metrics and monitoring utilities
 * @fileoverview Performance monitoring and metrics collection
 * @module utils/metrics
 */

import { logger } from '../logger.js';

/**
 * Metrics collector
 */
class MetricsCollector {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.startTime = Date.now();
  }

  /**
   * Increments a counter
   * @param {string} name - Counter name
   * @param {number} value - Value to add (default: 1)
   * @param {Object} labels - Optional labels
   */
  increment(name, value = 1, labels = {}) {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Sets a gauge value
   * @param {string} name - Gauge name
   * @param {number} value - Value to set
   * @param {Object} labels - Optional labels
   */
  gauge(name, value, labels = {}) {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Records a histogram value
   * @param {string} name - Histogram name
   * @param {number} value - Value to record
   * @param {Object} labels - Optional labels
   */
  histogram(name, value, labels = {}) {
    const key = this.makeKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key).push(value);
  }

  /**
   * Records execution time of a function
   * @param {string} name - Metric name
   * @param {Function} fn - Function to measure
   * @param {Object} labels - Optional labels
   * @returns {Promise<*>} Function result
   */
  async time(name, fn, labels = {}) {
    const start = Date.now();
    try {
      const result = await fn();
      this.histogram(`${name}_duration_ms`, Date.now() - start, labels);
      this.increment(`${name}_total`, 1, { ...labels, status: 'success' });
      return result;
    }
    catch (error) {
      this.increment(`${name}_total`, 1, { ...labels, status: 'error' });
      throw error;
    }
  }

  /**
   * Creates a key from name and labels
   * @param {string} name - Metric name
   * @param {Object} labels - Labels
   * @returns {string} Metric key
   */
  makeKey(name, labels) {
    if (Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  /**
   * Gets all metrics
   * @returns {Object} All metrics
   */
  getAll() {
    const histogramStats = new Map();
    for (const [key, values] of this.histograms.entries()) {
      histogramStats.set(key, this.calculateHistogramStats(values));
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(histogramStats),
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Calculates histogram statistics
   * @param {number[]} values - Histogram values
   * @returns {Object} Statistics
   */
  calculateHistogramStats(values) {
    if (values.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted.at(-1),
      avg: sum / values.length,
      p50: sorted[Math.floor(values.length * 0.5)],
      p95: sorted[Math.floor(values.length * 0.95)],
      p99: sorted[Math.floor(values.length * 0.99)]
    };
  }

  /**
   * Resets all metrics
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Logs current metrics
   */
  log() {
    const metrics = this.getAll();
    logger.info('Current metrics', metrics);
  }
}

/**
 * Command metrics tracker
 */
class CommandMetrics {
  constructor() {
    this.collector = new MetricsCollector();
  }

  /**
   * Records command execution
   * @param {string} commandName - Command name
   * @param {number} duration - Execution duration in ms
   * @param {boolean} success - Whether command succeeded
   */
  recordCommand(commandName, duration, success) {
    this.collector.histogram('command_duration_ms', duration, { command: commandName });
    this.collector.increment('command_total', 1, {
      command: commandName,
      status: success ? 'success' : 'error'
    });
  }

  /**
   * Records API call
   * @param {string} service - Service name
   * @param {number} duration - Call duration in ms
   * @param {number} statusCode - HTTP status code
   */
  recordAPICall(service, duration, statusCode) {
    this.collector.histogram('api_call_duration_ms', duration, { service });
    this.collector.increment('api_call_total', 1, {
      service,
      status: statusCode >= 200 && statusCode < 300 ? 'success' : 'error'
    });
  }

  /**
   * Records cache hit/miss
   * @param {string} cacheName - Cache name
   * @param {boolean} hit - Whether it was a hit
   */
  recordCacheAccess(cacheName, hit) {
    this.collector.increment('cache_access_total', 1, {
      cache: cacheName,
      result: hit ? 'hit' : 'miss'
    });
  }

  /**
   * Records database operation
   * @param {string} operation - Operation type
   * @param {number} duration - Operation duration in ms
   * @param {boolean} success - Whether operation succeeded
   */
  recordDBOperation(operation, duration, success) {
    this.collector.histogram('db_operation_duration_ms', duration, { operation });
    this.collector.increment('db_operation_total', 1, {
      operation,
      status: success ? 'success' : 'error'
    });
  }

  /**
   * Gets all metrics
   * @returns {Object} All metrics
   */
  getMetrics() {
    return this.collector.getAll();
  }

  /**
   * Gets metrics summary
   * @returns {Object} Metrics summary
   */
  getSummary() {
    const metrics = this.collector.getAll();
    return {
      totalCommands: Object.entries(metrics.counters)
        .filter(([k]) => k.startsWith('command_total'))
        .reduce((sum, [, v]) => sum + v, 0),
      totalAPICalls: Object.entries(metrics.counters)
        .filter(([k]) => k.startsWith('api_call_total'))
        .reduce((sum, [, v]) => sum + v, 0),
      totalDBOperations: Object.entries(metrics.counters)
        .filter(([k]) => k.startsWith('db_operation_total'))
        .reduce((sum, [, v]) => sum + v, 0),
      uptime: metrics.uptime
    };
  }
}

// Global metrics instance
export const metrics = new CommandMetrics();

export default { MetricsCollector, CommandMetrics, metrics };
