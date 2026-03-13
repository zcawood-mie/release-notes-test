/**
 * Health check endpoint handler.
 * Returns system status including uptime, memory usage, and version.
 */

const os = require('os');
const pkg = require('../package.json');

function getHealthStatus() {
  const memUsage = process.memoryUsage();
  return {
    status: 'healthy',
    version: pkg.version || '0.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    },
    system: {
      platform: os.platform(),
      nodeVersion: process.version,
      cpus: os.cpus().length,
      freeMemory: Math.round(os.freemem() / 1024 / 1024),
    },
  };
}

function registerHealthRoute(app) {
  app.get('/health', (_req, res) => {
    const status = getHealthStatus();
    res.status(200).json(status);
  });

  app.get('/health/ready', (_req, res) => {
    // Readiness check - could verify DB connections, etc.
    res.status(200).json({ ready: true });
  });
}

module.exports = { getHealthStatus, registerHealthRoute };
