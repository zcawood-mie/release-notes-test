/**
 * Structured request logger middleware.
 * Logs method, path, status code, and duration for every request.
 * Supports configurable log levels and exclusion patterns.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function createRequestLogger(options = {}) {
  const level = options.level || 'info';
  const excludePaths = options.excludePaths || ['/healthz', '/readyz'];
  const slowThresholdMs = options.slowThresholdMs || 1000;

  function shouldLog(path) {
    return !excludePaths.some((pattern) => path.startsWith(pattern));
  }

  function formatDuration(ms) {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  return function requestLogger(req, res, next) {
    if (!shouldLog(req.url)) {
      return next();
    }

    const startTime = process.hrtime.bigint();
    const requestId = req.headers['x-request-id'] || generateRequestId();

    // Attach request ID to response headers
    res.setHeader('X-Request-ID', requestId);

    const originalEnd = res.end;
    res.end = function (...args) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      const entry = {
        timestamp: new Date().toISOString(),
        requestId,
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userAgent: req.headers['user-agent'] || 'unknown',
      };

      if (durationMs > slowThresholdMs) {
        entry.slow = true;
        console.warn('[SLOW]', JSON.stringify(entry));
      } else if (res.statusCode >= 500) {
        console.error('[ERROR]', JSON.stringify(entry));
      } else if (res.statusCode >= 400) {
        console.warn('[WARN]', JSON.stringify(entry));
      } else {
        console.log('[INFO]', JSON.stringify(entry));
      }

      originalEnd.apply(res, args);
    };

    next();
  };
}

let requestCounter = 0;
function generateRequestId() {
  return `req_${Date.now()}_${++requestCounter}`;
}

module.exports = { createRequestLogger };
