/**
 * Environment configuration loader with validation.
 * Reads from process.env, applies defaults, and validates required values.
 */

const REQUIRED_VARS = ['NODE_ENV'];

const DEFAULTS = {
  NODE_ENV: 'development',
  PORT: '3000',
  LOG_LEVEL: 'info',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX: '60',
  CORS_ORIGINS: 'http://localhost:3000',
  AUTH_SECRET: 'dev-secret',
  SESSION_TTL_MS: '3600000',
};

function loadConfig(overrides = {}) {
  const config = {};

  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    config[key] = overrides[key] || process.env[key] || defaultValue;
  }

  // Parse numeric values
  config.PORT = parseInt(config.PORT, 10);
  config.RATE_LIMIT_WINDOW_MS = parseInt(config.RATE_LIMIT_WINDOW_MS, 10);
  config.RATE_LIMIT_MAX = parseInt(config.RATE_LIMIT_MAX, 10);
  config.SESSION_TTL_MS = parseInt(config.SESSION_TTL_MS, 10);

  // Parse CORS origins as array
  config.CORS_ORIGINS = config.CORS_ORIGINS.split(',').map((s) => s.trim());

  // Validate required vars
  const missing = REQUIRED_VARS.filter((v) => !config[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Warn if using default secret in production
  if (config.NODE_ENV === 'production' && config.AUTH_SECRET === 'dev-secret') {
    console.warn('[CONFIG] WARNING: Using default AUTH_SECRET in production!');
  }

  config.IS_PRODUCTION = config.NODE_ENV === 'production';
  config.IS_TEST = config.NODE_ENV === 'test';

  return Object.freeze(config);
}

module.exports = { loadConfig, DEFAULTS };
