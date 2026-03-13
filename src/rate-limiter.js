class RateLimiter {
  constructor({
    windowMs = 60000,
    max = 60,
    cleanupIntervalMs = 600000,
  } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
    this.cleanupIntervalMs = cleanupIntervalMs;
    this._interval = null;
    if (this.cleanupIntervalMs > 0) {
      this._interval = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    }
  }

  _now() {
    return Date.now();
  }

  isAllowed(key) {
    const now = this._now();
    const windowStart = now - this.windowMs;
    let arr = this.hits.get(key);
    if (!arr) {
      arr = [];
      this.hits.set(key, arr);
    }
    // remove timestamps outside the window
    while (arr.length && arr[0] <= windowStart) {
      arr.shift();
    }
    if (arr.length < this.max) {
      arr.push(now);
      return true;
    }
    return false;
  }

  // Manual cleanup to remove stale keys and reduce memory usage
  cleanup() {
    const now = this._now();
    const windowStart = now - this.windowMs;
    for (const [key, arr] of this.hits.entries()) {
      // drop old timestamps
      while (arr.length && arr[0] <= windowStart) {
        arr.shift();
      }
      if (arr.length === 0) {
        this.hits.delete(key);
      }
    }
  }

  // Stop any background cleanup interval
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

module.exports = RateLimiter;
