/**
 * Advanced cache management with LRU eviction, TTL, and statistics
 */

import { logger } from '../logger.js';

/**
 * Enhanced LRU Cache with TTL support
 */
export class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 3600000; // 1 hour default
    this.cache = new Map();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      gets: 0
    };

    // Auto-cleanup expired entries
    if (options.cleanupInterval) {
      this.cleanupInterval = setInterval(
        () => this.cleanup(),
        options.cleanupInterval
      );
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    this.stats.gets++;

    if (!this.cache.has(key)) {
      this.stats.misses++;
      return undefined;
    }

    const entry = this.cache.get(key);

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, value, ttl = this.defaultTTL) {
    this.stats.sets++;

    // If updating existing key, remove from access order
    if (this.cache.has(key)) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest entry
      this.evictOldest();
    }

    const entry = {
      value,
      createdAt: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : null
    };

    this.cache.set(key, entry);
    this.accessOrder.push(key);
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and not expired
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    const entry = this.cache.get(key);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key was deleted
   */
  delete(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.accessOrder.length = 0;
    logger.info('Cache cleared', { stats: this.getStats() });
  }

  /**
   * Evict oldest entry from cache
   */
  evictOldest() {
    if (this.accessOrder.length === 0) return;

    const oldest = this.accessOrder.shift();
    this.cache.delete(oldest);
    this.stats.evictions++;
    
    logger.debug('Evicted oldest cache entry', { key: oldest });
  }

  /**
   * Cleanup expired entries
   * @returns {number} Number of entries cleaned up
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired cache entries', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getStats() {
    const hitRate = this.stats.gets > 0 
      ? (this.stats.hits / this.stats.gets * 100).toFixed(2) 
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      evictions: this.stats.evictions,
      sets: this.stats.sets,
      gets: this.stats.gets
    };
  }

  /**
   * Destroy cache and cleanup
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

/**
 * Global cache instances for different purposes
 */
export const caches = {
  music: new CacheManager({ maxSize: 500, defaultTTL: 1800000, cleanupInterval: 300000 }), // 30 min TTL, 5 min cleanup
  rpg: new CacheManager({ maxSize: 1000, defaultTTL: 3600000, cleanupInterval: 600000 }), // 1 hour TTL, 10 min cleanup
  economy: new CacheManager({ maxSize: 500, defaultTTL: 1800000, cleanupInterval: 300000 }), // 30 min TTL
  general: new CacheManager({ maxSize: 1000, defaultTTL: 3600000, cleanupInterval: 600000 }) // General purpose
};

/**
 * Cleanup all caches on shutdown
 */
export function destroyAllCaches() {
  Object.values(caches).forEach(cache => cache.destroy());
  logger.info('All caches destroyed');
}

export default CacheManager;
