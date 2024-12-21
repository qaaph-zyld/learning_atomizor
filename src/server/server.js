const express = require('express');
const cluster = require('cluster');
const fs = require('fs');
const path = require('path');
const loadBalancer = require('./services/LoadBalancerService');
const logger = require('./services/LoggerService');

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Initialize express app
const app = express();
app.use(express.json());

// Basic routes for testing
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', pid: process.pid });
});

app.get('/metrics', async (req, res) => {
  try {
    const stats = await loadBalancer.getWorkerStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting worker stats:', error);
    res.status(500).json({ error: 'Failed to get worker stats' });
  }
});

app.get('/load-test', (req, res) => {
  try {
    // Simulate CPU-intensive work
    const start = Date.now();
    while (Date.now() - start < 100) {
      Math.random() * Math.random();
    }
    res.json({ processed: true, pid: process.pid });
  } catch (error) {
    logger.error('Error in load test:', error);
    res.status(500).json({ error: 'Load test failed' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize load balancer and start server
async function start() {
  try {
    logger.info('Starting server initialization...');
    await loadBalancer.initialize();

    if (!cluster.isPrimary) {
      const port = process.env.PORT || 3000;
      app.listen(port, () => {
        logger.info(`Worker ${process.pid} listening on port ${port}`);
      }).on('error', (error) => {
        logger.error('Failed to start HTTP server:', error);
        process.exit(1);
      });
    }
  } catch (error) {
    logger.error('Failed to start server:', error.stack || error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error.stack || error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error.stack || error);
  process.exit(1);
});

// Log process events
process.on('exit', (code) => {
  logger.info(`Process exiting with code: ${code}`);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT signal');
  process.exit(0);
});

start();
