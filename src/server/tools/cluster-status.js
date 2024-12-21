const Redis = require('ioredis');
const logger = require('../services/LoggerService');

// Load environment variables
require('dotenv').config();

class MemoryStore {
  constructor() {
    this.store = new Map();
  }

  async hgetall(key) {
    const map = this.store.get(key);
    if (!map) return {};
    return Object.fromEntries(map);
  }

  async keys(pattern) {
    return Array.from(this.store.keys())
      .filter(key => key.includes(pattern.replace('*', '')));
  }

  async quit() {
    this.store.clear();
  }
}

async function getClusterStatus() {
  let store;

  try {
    store = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('Redis connection failed, falling back to memory store');
          return null;
        }
        return Math.min(times * 100, 3000);
      }
    });

    // Test Redis connection
    store.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        logger.warn('Redis connection refused, falling back to memory store');
        store = new MemoryStore();
      }
    });
  } catch (err) {
    logger.warn('Failed to initialize Redis, using memory store:', err);
    store = new MemoryStore();
  }

  try {
    // Get all worker keys
    const workerKeys = await store.keys('worker:*:metrics');
    
    if (workerKeys.length === 0) {
      console.log('No active workers found');
      process.exit(0);
    }

    console.log('\n=== Cluster Status ===\n');
    console.log(`Total Workers: ${workerKeys.length}`);

    let totalRequests = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;

    // Collect worker metrics
    for (const key of workerKeys) {
      const workerId = key.split(':')[1];
      const metrics = await store.hgetall(key);

      console.log(`\nWorker ${workerId}:`);
      console.log('  Status:', metrics.status || 'unknown');
      console.log('  Requests:', metrics.requestCount || 0);
      console.log('  Errors:', metrics.errorCount || 0);
      console.log('  Avg Response Time:', 
        `${(parseFloat(metrics.avgResponseTime) || 0).toFixed(2)}ms`
      );

      if (metrics.memory) {
        const memory = JSON.parse(metrics.memory);
        console.log('  Memory Usage:');
        console.log('    RSS:', formatBytes(memory.rss));
        console.log('    Heap Total:', formatBytes(memory.heapTotal));
        console.log('    Heap Used:', formatBytes(memory.heapUsed));
      }

      totalRequests += parseInt(metrics.requestCount || 0);
      totalErrors += parseInt(metrics.errorCount || 0);
      totalResponseTime += parseFloat(metrics.avgResponseTime || 0);
    }

    // Print summary
    console.log('\n=== Summary ===');
    console.log('Total Requests:', totalRequests);
    console.log('Total Errors:', totalErrors);
    console.log('Error Rate:', 
      `${((totalErrors / totalRequests) * 100 || 0).toFixed(2)}%`
    );
    console.log('Average Response Time:', 
      `${(totalResponseTime / workerKeys.length).toFixed(2)}ms`
    );

    // Get and display load prediction metrics
    const loadMetrics = await store.hgetall('cluster:load_metrics');
    if (loadMetrics && Object.keys(loadMetrics).length > 0) {
      console.log('\n=== Load Metrics ===');
      console.log('Last Check:', new Date(parseInt(loadMetrics.lastCheck)).toLocaleString());
      console.log('Request Rate:', loadMetrics.requestRate, 'req/min');
      console.log('CPU Usage:', `${(parseFloat(loadMetrics.cpuUsage) * 100).toFixed(2)}%`);
      console.log('Memory Usage:', `${(parseFloat(loadMetrics.memoryUsage) * 100).toFixed(2)}%`);
      
      // Calculate scaling indicators
      const scaleUpThreshold = process.env.SCALE_UP_THRESHOLD || 0.8;
      const scaleDownThreshold = process.env.SCALE_DOWN_THRESHOLD || 0.3;
      const currentLoad = totalRequests / (workerKeys.length * 100);
      
      console.log('\n=== Scaling Status ===');
      console.log('Current Load:', `${(currentLoad * 100).toFixed(2)}%`);
      console.log('Scale Up Threshold:', `${(scaleUpThreshold * 100).toFixed(2)}%`);
      console.log('Scale Down Threshold:', `${(scaleDownThreshold * 100).toFixed(2)}%`);
      
      if (currentLoad > scaleUpThreshold) {
        console.log('Status: High load - May scale up');
      } else if (currentLoad < scaleDownThreshold) {
        console.log('Status: Low load - May scale down');
      } else {
        console.log('Status: Optimal load');
      }
    }

    await store.quit();
  } catch (error) {
    logger.error('Error getting cluster status:', error);
    process.exit(1);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Run the status check
getClusterStatus().catch(error => {
  logger.error('Status check failed:', error);
  process.exit(1);
});
