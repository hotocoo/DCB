/**
 * API client utilities with retry logic and timeout handling
 * @fileoverview Centralized HTTP client for external API calls
 * @module utils/apiClient
 */

import { logger } from '../logger.js';

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  retryBackoff: 2
};

/**
 * Makes an HTTP request with retry logic and timeout handling
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} config - Request configuration
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError;

  for (let attempt = 0; attempt < finalConfig.retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), finalConfig.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status >= 500) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      return response;

    } catch (error) {
      lastError = error;
      
      if (error.name === 'AbortError') {
        logger.warn(`Request timeout for ${url} (attempt ${attempt + 1}/${finalConfig.retries})`);
      } else {
        logger.warn(`Request failed for ${url} (attempt ${attempt + 1}/${finalConfig.retries}): ${error.message}`);
      }

      // Don't retry on client errors (4xx)
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }

      // Wait before retrying
      if (attempt < finalConfig.retries - 1) {
        const delay = finalConfig.retryDelay * Math.pow(finalConfig.retryBackoff, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Makes a GET request with JSON response parsing
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} config - Request configuration
 * @returns {Promise<*>} Parsed JSON response
 */
export async function getJSON(url, options = {}, config = {}) {
  try {
    const response = await fetchWithRetry(url, { ...options, method: 'GET' }, config);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error(`GET JSON request failed for ${url}`, error);
    throw error;
  }
}

/**
 * Makes a POST request with JSON body and response parsing
 * @param {string} url - Request URL
 * @param {*} body - Request body (will be JSON stringified)
 * @param {Object} options - Fetch options
 * @param {Object} config - Request configuration
 * @returns {Promise<*>} Parsed JSON response
 */
export async function postJSON(url, body, options = {}, config = {}) {
  try {
    const response = await fetchWithRetry(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: JSON.stringify(body)
    }, config);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error(`POST JSON request failed for ${url}`, error);
    throw error;
  }
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async acquire() {
    const now = Date.now();
    
    // Remove expired requests
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    // Check if we can make a request
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire();
    }
    
    this.requests.push(now);
  }
}

/**
 * Creates a rate-limited API client
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} Rate-limited API client
 */
export function createRateLimitedClient(maxRequests, windowMs) {
  const limiter = new RateLimiter(maxRequests, windowMs);
  
  return {
    async fetch(url, options, config) {
      await limiter.acquire();
      return fetchWithRetry(url, options, config);
    },
    async getJSON(url, options, config) {
      await limiter.acquire();
      return getJSON(url, options, config);
    },
    async postJSON(url, body, options, config) {
      await limiter.acquire();
      return postJSON(url, body, options, config);
    }
  };
}

export default {
  fetchWithRetry,
  getJSON,
  postJSON,
  createRateLimitedClient
};
