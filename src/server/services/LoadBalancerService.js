const cluster = require('cluster');
const os = require('os');
const Redis = require('ioredis');
const logger = require('./LoggerService');
const MemoryStore = require('./MemoryStore');

class LoadBalancerService {
  constructor() {
    this.numCPUs = os.cpus().length;
    this.workers = new Map();
    this.currentWorkerIndex = 0;
    this.healthChecks = new Map();
    
    // Configuration
    this.config = {
      maxWorkers: process.env.MAX_WORKERS || this.numCPUs,
      minWorkers: process.env.MIN_WORKERS || 2,
      healthCheckInterval: process.env.HEALTH_CHECK_INTERVAL || 30000,
      workerTimeout: process.env.WORKER_TIMEOUT || 5000,
      retryAttempts: process.env.RETRY_ATTEMPTS || 3,
      scaleUpThreshold: process.env.SCALE_UP_THRESHOLD || 0.8,
      scaleDownThreshold: process.env.SCALE_DOWN_THRESHOLD || 0.3,
      loadCheckInterval: process.env.LOAD_CHECK_INTERVAL || 60000
    };

    // Load prediction metrics
    this.loadMetrics = {
      lastCheck: Date.now(),
      requestRate: 0,
      cpuUsage: 0,
      memoryUsage: 0
    };

    // Initialize storage
    this.initializeStorage();
  }

  /**
   * Initialize storage system (Redis or Memory)
   */
  async initializeStorage() {
    try {
      if (process.env.USE_MEMORY_STORE === 'true') {
        logger.info('Using memory store as configured');
        this.store = new MemoryStore();
        return;
      }

      logger.info('Initializing Redis connection...');
      this.store = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.warn('Redis connection failed, falling back to memory store');
            this.switchToMemoryStore();
            return null;
          }
          return Math.min(times * 100, 3000);
        }
      });

      this.store.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          logger.warn('Redis connection refused, falling back to memory store');
          this.switchToMemoryStore();
        } else {
          logger.error('Redis error:', err);
        }
      });

      this.store.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      // Try to connect to Redis
      try {
        await this.store.connect();
      } catch (err) {
        logger.warn('Failed to connect to Redis, using memory store:', err);
        this.switchToMemoryStore();
      }
    } catch (err) {
      logger.warn('Failed to initialize Redis, using memory store:', err);
      this.switchToMemoryStore();
    }
  }

  /**
   * Switch to memory store
   */
  switchToMemoryStore() {
    if (this.store instanceof MemoryStore) return;
    
    const oldStore = this.store;
    this.store = new MemoryStore();
    
    // Close old Redis connection if it exists
    if (oldStore && oldStore instanceof Redis) {
      try {
        oldStore.quit();
      } catch (err) {
        logger.error('Error disconnecting from Redis:', err);
      }
    }
  }

  /**
   * Initialize the load balancer
   */
  async initialize() {
    try {
      if (cluster.isPrimary) {
        logger.info(`Master process is running on PID: ${process.pid}`);

        // Initialize storage first
        await this.initializeStorage();

        // Fork initial workers
        const initialWorkers = Math.max(
          this.config.minWorkers,
          Math.min(this.config.maxWorkers, Math.floor(this.numCPUs * 0.5))
        );
        
        logger.info(`Initializing with ${initialWorkers} workers`);
        
        for (let i = 0; i < initialWorkers; i++) {
          this.createWorker();
        }

        // Set up event handlers
        this.setupMasterEventHandlers();
        
        // Start health checks
        this.startHealthChecks();
        
        // Initialize worker metrics
        await this.initializeWorkerMetrics();

        // Start load prediction and auto-scaling
        this.startLoadPrediction();
        
        logger.info('Load balancer initialization complete');
      } else {
        logger.info(`Worker process is running on PID: ${process.pid}`);
        await this.initializeStorage();
        this.setupWorkerEventHandlers();
        logger.info(`Worker ${process.pid} initialization complete`);
      }
    } catch (error) {
      logger.error('Failed to initialize load balancer:', error);
      throw error;
    }
  }

  /**
   * Create a new worker
   */
  createWorker() {
    try {
      const worker = cluster.fork();
      this.workers.set(worker.id, {
        id: worker.id,
        pid: worker.process.pid,
        status: 'starting',
        startTime: Date.now(),
        metrics: {
          requestCount: 0,
          errorCount: 0,
          avgResponseTime: 0
        }
      });

      logger.info(`Created new worker with ID: ${worker.id}`);
      return worker;
    } catch (error) {
      logger.error('Failed to create worker:', error);
      throw error;
    }
  }

  /**
   * Initialize worker metrics in storage
   */
  async initializeWorkerMetrics() {
    try {
      logger.info('Initializing worker metrics');
      for (const [workerId, worker] of this.workers) {
        try {
          await this.store.hset(
            `worker:${workerId}:metrics`,
            {
              requestCount: 0,
              errorCount: 0,
              avgResponseTime: 0
            }
          );
        } catch (error) {
          logger.error(`Failed to initialize metrics for worker ${workerId}:`, error);
          // Continue with other workers even if one fails
        }
      }
      logger.info('Worker metrics initialization complete');
    } catch (error) {
      logger.error('Failed to initialize worker metrics:', error);
      // Don't throw error here, just log it and continue
      // This allows the load balancer to work even without metrics
    }
  }

  /**
   * Set up event handlers for the master process
   */
  setupMasterEventHandlers() {
    try {
      logger.info('Setting up master event handlers');
      
      // Handle worker online event
      cluster.on('online', (worker) => {
        const workerInfo = this.workers.get(worker.id);
        if (workerInfo) {
          workerInfo.status = 'online';
          logger.info(`Worker ${worker.id} is online`);
        }
      });

      // Handle worker exit
      cluster.on('exit', (worker, code, signal) => {
        logger.warn(`Worker ${worker.id} died. Code: ${code}, Signal: ${signal}`);
        this.workers.delete(worker.id);
        
        // Replace dead worker
        this.createWorker();
      });

      // Handle worker messages
      cluster.on('message', (worker, message) => {
        this.handleWorkerMessage(worker, message);
      });

      logger.info('Master event handlers setup complete');
    } catch (error) {
      logger.error('Failed to setup master event handlers:', error);
      throw error;
    }
  }

  /**
   * Set up event handlers for worker processes
   */
  setupWorkerEventHandlers() {
    try {
      logger.info('Setting up worker event handlers');
      
      process.on('message', (message) => {
        this.handleMasterMessage(message);
      });

      // Report metrics periodically
      setInterval(() => {
        this.reportWorkerMetrics();
      }, 5000);

      logger.info('Worker event handlers setup complete');
    } catch (error) {
      logger.error('Failed to setup worker event handlers:', error);
      throw error;
    }
  }

  /**
   * Handle messages from workers
   */
  handleWorkerMessage(worker, message) {
    const workerInfo = this.workers.get(worker.id);
    if (!workerInfo) return;

    switch (message.type) {
      case 'metrics':
        this.updateWorkerMetrics(worker.id, message.data);
        break;
      case 'health':
        this.updateWorkerHealth(worker.id, message.data);
        break;
      case 'error':
        this.handleWorkerError(worker.id, message.data);
        break;
    }
  }

  /**
   * Handle messages from master
   */
  handleMasterMessage(message) {
    switch (message.type) {
      case 'healthCheck':
        this.performHealthCheck();
        break;
      case 'shutdown':
        this.performGracefulShutdown();
        break;
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    setInterval(() => {
      this.checkWorkersHealth();
    }, this.config.healthCheckInterval);
  }

  /**
   * Check health of all workers
   */
  async checkWorkersHealth() {
    for (const [workerId, worker] of this.workers) {
      if (worker.status === 'online') {
        cluster.workers[workerId].send({ type: 'healthCheck' });
        
        // Set timeout for response
        const timeout = setTimeout(() => {
          this.handleWorkerTimeout(workerId);
        }, this.config.workerTimeout);

        this.healthChecks.set(workerId, timeout);
      }
    }
  }

  /**
   * Handle worker timeout
   */
  handleWorkerTimeout(workerId) {
    const worker = cluster.workers[workerId];
    if (worker) {
      logger.error(`Worker ${workerId} is not responding, killing it`);
      worker.kill();
    }
  }

  /**
   * Update worker metrics
   */
  async updateWorkerMetrics(workerId, metrics) {
    const workerInfo = this.workers.get(workerId);
    if (workerInfo) {
      workerInfo.metrics = {
        ...workerInfo.metrics,
        ...metrics
      };

      // Store metrics in storage
      await this.store.hset(
        `worker:${workerId}:metrics`,
        metrics
      );
    }
  }

  /**
   * Update worker health status
   */
  updateWorkerHealth(workerId, health) {
    const workerInfo = this.workers.get(workerId);
    if (workerInfo) {
      workerInfo.health = health;
      
      // Clear health check timeout
      const timeout = this.healthChecks.get(workerId);
      if (timeout) {
        clearTimeout(timeout);
        this.healthChecks.delete(workerId);
      }
    }
  }

  /**
   * Handle worker errors
   */
  handleWorkerError(workerId, error) {
    logger.error(`Error in worker ${workerId}:`, error);
    
    const workerInfo = this.workers.get(workerId);
    if (workerInfo) {
      workerInfo.metrics.errorCount++;
    }
  }

  /**
   * Report worker metrics
   */
  reportWorkerMetrics() {
    if (!cluster.isWorker) return;

    const metrics = {
      requestCount: process._getActiveRequests().length,
      errorCount: process._getActiveHandles().length,
      avgResponseTime: process.uptime(),
      memory: process.memoryUsage()
    };

    process.send({
      type: 'metrics',
      data: metrics
    });
  }

  /**
   * Perform worker health check
   */
  performHealthCheck() {
    if (!cluster.isWorker) return;

    const health = {
      status: 'healthy',
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };

    process.send({
      type: 'health',
      data: health
    });
  }

  /**
   * Perform graceful shutdown
   */
  async performGracefulShutdown() {
    if (cluster.isPrimary) {
      logger.info('Initiating graceful shutdown');

      // Notify all workers
      for (const id in cluster.workers) {
        cluster.workers[id].send({ type: 'shutdown' });
      }

      // Wait for workers to finish
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (this.workers.size === 0) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 1000);
      });

      // Close storage connection
      await this.store.quit();
      
      process.exit(0);
    } else {
      // Worker shutdown
      await this.workerShutdown();
    }
  }

  /**
   * Worker shutdown procedure
   */
  async workerShutdown() {
    logger.info(`Worker ${process.pid} shutting down`);

    // Stop accepting new requests
    if (process.send) {
      process.send({
        type: 'shutdown',
        data: { pid: process.pid }
      });
    }

    // Wait for active requests to complete
    const waitForRequests = new Promise(resolve => {
      const check = () => {
        if (process._getActiveRequests().length === 0) {
          resolve();
        } else {
          setTimeout(check, 1000);
        }
      };
      check();
    });

    await waitForRequests;
    process.exit(0);
  }

  /**
   * Get next available worker
   */
  getNextWorker() {
    const workers = Array.from(this.workers.values())
      .filter(w => w.status === 'online');

    if (workers.length === 0) {
      throw new Error('No workers available');
    }

    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % workers.length;
    return workers[this.currentWorkerIndex];
  }

  /**
   * Get worker statistics
   */
  async getWorkerStats() {
    const stats = {
      totalWorkers: this.workers.size,
      activeWorkers: 0,
      totalRequests: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      workers: []
    };

    for (const [workerId, worker] of this.workers) {
      if (worker.status === 'online') {
        stats.activeWorkers++;
      }

      const metrics = await this.store.hgetall(`worker:${workerId}:metrics`);
      stats.totalRequests += parseInt(metrics.requestCount || 0);
      stats.totalErrors += parseInt(metrics.errorCount || 0);
      stats.avgResponseTime += parseFloat(metrics.avgResponseTime || 0);

      stats.workers.push({
        id: workerId,
        status: worker.status,
        uptime: Date.now() - worker.startTime,
        metrics
      });
    }

    if (stats.activeWorkers > 0) {
      stats.avgResponseTime /= stats.activeWorkers;
    }

    // Store load metrics
    await this.store.hset('cluster:load_metrics', this.loadMetrics);

    return stats;
  }

  /**
   * Start load prediction and auto-scaling
   */
  startLoadPrediction() {
    setInterval(async () => {
      await this.predictAndScale();
    }, this.config.loadCheckInterval);
  }

  /**
   * Predict load and scale workers accordingly
   */
  async predictAndScale() {
    const stats = await this.getWorkerStats();
    const currentLoad = stats.totalRequests / (stats.activeWorkers * 100);
    
    // Calculate system metrics
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    const memUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
    
    // Update load metrics
    this.loadMetrics = {
      lastCheck: Date.now(),
      requestRate: stats.totalRequests,
      cpuUsage,
      memoryUsage: memUsage
    };

    // Scale up if load is high
    if (currentLoad > this.config.scaleUpThreshold && stats.activeWorkers < this.config.maxWorkers) {
      const workersToAdd = Math.min(
        2,
        this.config.maxWorkers - stats.activeWorkers
      );
      
      logger.info(`Scaling up: Adding ${workersToAdd} workers due to high load`);
      for (let i = 0; i < workersToAdd; i++) {
        this.createWorker();
      }
    }
    
    // Scale down if load is low
    else if (currentLoad < this.config.scaleDownThreshold && 
             stats.activeWorkers > this.config.minWorkers) {
      const workersToRemove = Math.min(
        2,
        stats.activeWorkers - this.config.minWorkers
      );
      
      logger.info(`Scaling down: Removing ${workersToRemove} workers due to low load`);
      const workers = Array.from(this.workers.values())
        .filter(w => w.status === 'online')
        .slice(-workersToRemove);
        
      for (const worker of workers) {
        cluster.workers[worker.id].send({ type: 'shutdown' });
      }
    }
  }
}

module.exports = new LoadBalancerService();
