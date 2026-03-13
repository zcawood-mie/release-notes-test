/**
 * CORS middleware with configurable allowed origins.
 * Supports preflight (OPTIONS) requests and credentials.
 */

const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];
const ALLOWED_METHODS = 'GET,POST,PUT,DELETE,PATCH,OPTIONS';
const ALLOWED_HEADERS = 'Content-Type,Authorization,X-Request-ID';

function createCorsMiddleware(options = {}) {
  const allowedOrigins = options.origins || DEFAULT_ORIGINS;
  const allowCredentials = options.credentials !== false;
  const maxAge = options.maxAge || 86400; // 24 hours

  return function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;

    if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    if (allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.setHeader('Access-Control-Max-Age', String(maxAge));

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    next();
  };
}

module.exports = { createCorsMiddleware };
