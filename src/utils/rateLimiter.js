/**
 * Rate limiting utilities
 * @module utils/rateLimiter
 */

import { logger } from '../logger.js';

export class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
    
    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), windowMs);
  }

  async check(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    
    // Remove expired requests
    const validRequests = userRequests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      const oldestRequest = validRequests[0];
      const resetTime = oldestRequest + this.windowMs;
      const waitTime = resetTime - now;
      
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        waitTime
      };
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return {
      allowed: true,
      remaining: this.maxRequests - validRequests.length,
      resetTime: now + this.windowMs,
      waitTime: 0
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }

  reset(key) {
    this.requests.delete(key);
  }
}

// Pre-configured rate limiters
export const commandLimiter = new RateLimiter(10, 10000); // 10 commands per 10 seconds
export const apiLimiter = new RateLimiter(30, 60000); // 30 API calls per minute
export const messageLimiter = new RateLimiter(20, 60000); // 20 messages per minute

export default { RateLimiter, commandLimiter, apiLimiter, messageLimiter };
