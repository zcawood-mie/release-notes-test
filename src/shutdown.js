/**
 * Graceful shutdown handler.
 * Captures SIGTERM/SIGINT, drains active connections, and exits cleanly.
 * Prevents abrupt termination that could corrupt in-flight requests.
 */

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

function createShutdownHandler(server, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const onShutdown = options.onShutdown || (() => {});
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[shutdown] Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
      console.log('[shutdown] All connections drained');

      try {
        await onShutdown();
        console.log('[shutdown] Cleanup complete, exiting');
        process.exit(0);
      } catch (err) {
        console.error('[shutdown] Cleanup failed:', err.message);
        process.exit(1);
      }
    });

    // Force exit if draining takes too long
    const forceTimer = setTimeout(() => {
      console.error(`[shutdown] Forced exit after ${timeoutMs}ms timeout`);
      process.exit(1);
    }, timeoutMs);

    forceTimer.unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return {
    isShuttingDown: () => isShuttingDown,
    shutdown,
  };
}

module.exports = { createShutdownHandler };
