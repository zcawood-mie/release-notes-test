/**
 * In-memory sliding-window rate limiter.
 * Tracks request counts per key within a configurable time window.
 */

class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.store = new Map();
  }

  /**
   * Check if a request is allowed for the given key.
   * @param {string} key - Identifier (e.g., IP address)
   * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
   */
  check(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.store.has(key)) {
      this.store.set(key, []);
    }

    const timestamps = this.store.get(key).filter((t) => t > windowStart);
    this.store.set(key, timestamps);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldestInWindow + this.windowMs - now,
      };
    }

    timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetMs: this.windowMs,
    };
  }

  /**
   * Clear all entries (useful for testing).
   */
  reset() {
    this.store.clear();
  }

  /**
   * Remove expired entries to prevent memory leaks.
   */
  cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, timestamps] of this.store.entries()) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, valid);
      }
    }
  }
}

module.exports = { RateLimiter };
