const mongoose = require('mongoose');
const config = require('../config');
const logger = require('./LoggerService');

class ShardingService {
  constructor() {
    this.shards = new Map();
    this.config = {
      shardCount: process.env.SHARD_COUNT || 3,
      replicaCount: process.env.REPLICA_COUNT || 2,
      shardKeyFields: ['tenantId', 'createdAt'],
      chunkSize: process.env.CHUNK_SIZE || 64, // in MB
      balancerInterval: process.env.BALANCER_INTERVAL || 300000 // 5 minutes
    };
  }

  /**
   * Initialize sharding configuration
   */
  async initialize() {
    try {
      // Connect to config servers
      const configServer = await mongoose.createConnection(
        process.env.MONGODB_CONFIG_SERVER_URI,
        {
          useNewUrlParser: true,
          useUnifiedTopology: true
        }
      );

      logger.info('Connected to MongoDB config servers');

      // Initialize each shard
      for (let i = 0; i < this.config.shardCount; i++) {
        await this.initializeShard(i);
      }

      // Enable sharding for database
      await this.enableSharding();

      // Start balancer
      this.startBalancer();

      logger.info('Sharding initialization completed');
    } catch (error) {
      logger.error('Error initializing sharding:', error);
      throw error;
    }
  }

  /**
   * Initialize a single shard
   */
  async initializeShard(shardId) {
    try {
      const shardUri = process.env[`MONGODB_SHARD_${shardId}_URI`];
      if (!shardUri) {
        throw new Error(`No URI configured for shard ${shardId}`);
      }

      const shard = await mongoose.createConnection(shardUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        replicaSet: `shard${shardId}`
      });

      this.shards.set(shardId, {
        connection: shard,
        status: 'active',
        metrics: {
          documentCount: 0,
          storageSize: 0,
          lastUpdated: new Date()
        }
      });

      logger.info(`Initialized shard ${shardId}`);
    } catch (error) {
      logger.error(`Error initializing shard ${shardId}:`, error);
      throw error;
    }
  }

  /**
   * Enable sharding for database and collections
   */
  async enableSharding() {
    try {
      const db = mongoose.connection.db;
      
      // Enable sharding for database
      await db.admin().command({ enableSharding: config.database });
      
      // Create indexes for shard keys
      await this.createShardIndexes();
      
      // Enable sharding for collections
      await this.enableCollectionSharding();
      
      logger.info('Enabled sharding for database and collections');
    } catch (error) {
      logger.error('Error enabling sharding:', error);
      throw error;
    }
  }

  /**
   * Create indexes for shard keys
   */
  async createShardIndexes() {
    try {
      const collections = ['Content', 'User', 'Analytics'];
      
      for (const collection of collections) {
        const model = mongoose.model(collection);
        await model.collection.createIndex(
          this.getShardKeyIndex(),
          { unique: true }
        );
      }
      
      logger.info('Created shard key indexes');
    } catch (error) {
      logger.error('Error creating shard indexes:', error);
      throw error;
    }
  }

  /**
   * Enable sharding for collections
   */
  async enableCollectionSharding() {
    try {
      const db = mongoose.connection.db;
      const collections = ['Content', 'User', 'Analytics'];
      
      for (const collection of collections) {
        await db.admin().command({
          shardCollection: `${config.database}.${collection}`,
          key: this.getShardKeyIndex()
        });
      }
      
      logger.info('Enabled collection sharding');
    } catch (error) {
      logger.error('Error enabling collection sharding:', error);
      throw error;
    }
  }

  /**
   * Get shard key index
   */
  getShardKeyIndex() {
    return this.config.shardKeyFields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {});
  }

  /**
   * Start balancer process
   */
  startBalancer() {
    setInterval(async () => {
      await this.balanceShards();
    }, this.config.balancerInterval);
    
    logger.info('Started shard balancer');
  }

  /**
   * Balance shards
   */
  async balanceShards() {
    try {
      const stats = await this.getShardStats();
      const imbalance = this.calculateImbalance(stats);
      
      if (imbalance > 0.1) { // 10% threshold
        await this.rebalanceChunks(stats);
      }
      
      logger.info('Completed shard balancing check');
    } catch (error) {
      logger.error('Error balancing shards:', error);
    }
  }

  /**
   * Get shard statistics
   */
  async getShardStats() {
    const stats = [];
    
    for (const [shardId, shard] of this.shards) {
      const db = shard.connection.db;
      const serverStatus = await db.admin().serverStatus();
      
      stats.push({
        shardId,
        metrics: {
          documentCount: serverStatus.metrics.document.count,
          storageSize: serverStatus.mem.resident,
          connections: serverStatus.connections.current,
          opCounters: serverStatus.opcounters
        }
      });
    }
    
    return stats;
  }

  /**
   * Calculate shard imbalance
   */
  calculateImbalance(stats) {
    const sizes = stats.map(s => s.metrics.storageSize);
    const avg = sizes.reduce((a, b) => a + b) / sizes.length;
    const max = Math.max(...sizes);
    
    return (max - avg) / avg;
  }

  /**
   * Rebalance chunks across shards
   */
  async rebalanceChunks(stats) {
    try {
      const db = mongoose.connection.db;
      
      // Find donor and recipient shards
      const sorted = stats.sort((a, b) => 
        b.metrics.storageSize - a.metrics.storageSize
      );
      
      const donor = sorted[0];
      const recipient = sorted[sorted.length - 1];
      
      // Move chunks from donor to recipient
      await db.admin().command({
        moveChunk: `${config.database}.Content`,
        find: { tenantId: donor.shardId },
        to: `shard${recipient.shardId}`
      });
      
      logger.info(`Moved chunks from shard ${donor.shardId} to shard ${recipient.shardId}`);
    } catch (error) {
      logger.error('Error rebalancing chunks:', error);
      throw error;
    }
  }

  /**
   * Get shard for tenant
   */
  async getShardForTenant(tenantId) {
    try {
      const db = mongoose.connection.db;
      const result = await db.admin().command({
        usersInfo: { tenant: tenantId }
      });
      
      return result.users[0].shardId;
    } catch (error) {
      logger.error('Error getting shard for tenant:', error);
      throw error;
    }
  }

  /**
   * Get connection for shard
   */
  getShardConnection(shardId) {
    const shard = this.shards.get(shardId);
    if (!shard || shard.status !== 'active') {
      throw new Error(`Shard ${shardId} not available`);
    }
    return shard.connection;
  }
}

module.exports = new ShardingService();
