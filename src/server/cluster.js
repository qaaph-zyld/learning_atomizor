const cluster = require('cluster');
const os = require('os');
const express = require('express');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const logger = require('./services/LoggerService');
const loadBalancer = require('./services/LoadBalancerService');

// Load environment variables
require('dotenv').config();

// Configuration
const numCPUs = os.cpus().length;
const PORT = process.env.PORT || 3000;

async function startServer() {
  if (cluster.isPrimary) {
    logger.info(`Master process is running on PID: ${process.pid}`);

    // Initialize load balancer
    await loadBalancer.initialize();

    // Handle process signals
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received. Starting graceful shutdown...');
      await loadBalancer.performGracefulShutdown();
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received. Starting graceful shutdown...');
      await loadBalancer.performGracefulShutdown();
    });

  } else {
    // Worker process
    const app = express();
    
    // Connect to MongoDB
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      logger.info(`Worker ${process.pid} connected to MongoDB`);
    } catch (error) {
      logger.error(`Worker ${process.pid} MongoDB connection error:`, error);
      process.exit(1);
    }

    // Connect to Redis
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });

    redis.on('error', (error) => {
      logger.error(`Worker ${process.pid} Redis connection error:`, error);
    });

    redis.on('connect', () => {
      logger.info(`Worker ${process.pid} connected to Redis`);
    });

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/content', require('./routes/content'));
    app.use('/api/analytics', require('./routes/analytics'));
    app.use('/api/workspaces', require('./routes/workspaces'));
    app.use('/api/invitations', require('./routes/invitations'));
    app.use('/api/audit', require('./routes/audit'));

    // Error handling
    app.use((err, req, res, next) => {
      logger.error('Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    // Start server
    app.listen(PORT, () => {
      logger.info(`Worker ${process.pid} is listening on port ${PORT}`);
    });

    // Handle worker process signals
    process.on('SIGTERM', async () => {
      logger.info(`Worker ${process.pid} received SIGTERM. Shutting down...`);
      await loadBalancer.workerShutdown();
    });

    process.on('message', async (message) => {
      if (message.type === 'shutdown') {
        logger.info(`Worker ${process.pid} received shutdown message`);
        await loadBalancer.workerShutdown();
      }
    });
  }
}

// Start the server
startServer().catch((error) => {
  logger.error('Server startup error:', error);
  process.exit(1);
});
