/**
 * Cache utilities with automatic expiration and cleanup
 * @fileoverview Memory-efficient caching with TTL support
 * @module utils/cache
 */

import { logger } from '../logger.js';

/**
 * Cache entry with expiration
 */
class CacheEntry {
  constructor(value, ttl) {
    this.value = value;
    this.expiresAt = Date.now() + ttl;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}

/**
 * Cache manager with automatic cleanup
 */
export class Cache {
  constructor(name, options = {}) {
    this.name = name;
    this.store = new Map();
    this.defaultTTL = options.ttl || 3_600_000; // 1 hour default
    this.maxSize = options.maxSize || 1000;
    this.cleanupInterval = options.cleanupInterval || 300_000; // 5 minutes

    // Start cleanup timer
    this.startCleanup();
  }

  /**
   * Sets a cache entry
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, value, ttl = this.defaultTTL) {
    // Check size limit
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      // Remove oldest entry
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }

    this.store.set(key, new CacheEntry(value, ttl));
  }

  /**
   * Gets a cache entry
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return;
    }

    if (entry.isExpired()) {
      this.store.delete(key);
      return;
    }

    return entry.value;
  }

  /**
   * Checks if a key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is valid
   */
  has(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return false;
    }

    if (entry.isExpired()) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Deletes a cache entry
   * @param {string} key - Cache key
   * @returns {boolean} True if entry was deleted
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Clears all cache entries
   */
  clear() {
    this.store.clear();
  }

  /**
   * Gets cache statistics
   * @returns {Object} Cache statistics
   */
  stats() {
    let expired = 0;
    for (const entry of this.store.values()) {
      if (entry.isExpired()) {
        expired++;
      }
    }

    return {
      name: this.name,
      size: this.store.size,
      expired,
      maxSize: this.maxSize,
      hitRate: this.hits / (this.hits + this.misses) || 0
    };
  }

  /**
   * Starts the automatic cleanup timer
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Stops the automatic cleanup timer
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Removes expired entries
   */
  cleanup() {
    const before = this.store.size;

    for (const [key, entry] of this.store.entries()) {
      if (entry.isExpired()) {
        this.store.delete(key);
      }
    }

    const removed = before - this.store.size;
    if (removed > 0) {
      logger.debug(`Cache [${this.name}] cleanup: removed ${removed} expired entries`);
    }
  }

  /**
   * Gets or sets a cache entry using a factory function
   * @param {string} key - Cache key
   * @param {Function} factory - Factory function to create value if not cached
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<*>} Cached or newly created value
   */
  async getOrSet(key, factory, ttl = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }
}

/**
 * Global cache manager
 */
class CacheManager {
  constructor() {
    this.caches = new Map();
  }

  /**
   * Creates or gets a named cache
   * @param {string} name - Cache name
   * @param {Object} options - Cache options
   * @returns {Cache} Cache instance
   */
  create(name, options = {}) {
    if (!this.caches.has(name)) {
      this.caches.set(name, new Cache(name, options));
    }
    return this.caches.get(name);
  }

  /**
   * Gets a cache by name
   * @param {string} name - Cache name
   * @returns {Cache|undefined} Cache instance
   */
  get(name) {
    return this.caches.get(name);
  }

  /**
   * Deletes a cache
   * @param {string} name - Cache name
   * @returns {boolean} True if cache was deleted
   */
  delete(name) {
    const cache = this.caches.get(name);
    if (cache) {
      cache.stopCleanup();
      cache.clear();
      return this.caches.delete(name);
    }
    return false;
  }

  /**
   * Gets statistics for all caches
   * @returns {Object[]} Array of cache statistics
   */
  stats() {
    return [...this.caches.values()].map(cache => cache.stats());
  }

  /**
   * Clears all caches
   */
  clearAll() {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }
}

// Global cache manager instance
export const cacheManager = new CacheManager();

export default { Cache, cacheManager };
