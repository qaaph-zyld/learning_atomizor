const mongoose = require('mongoose');
const Redis = require('ioredis');
const AWS = require('aws-sdk');
const logger = require('./LoggerService');
const LoadBalancerService = require('./LoadBalancerService');

class DisasterRecoveryService {
  constructor() {
    this.config = {
      backupInterval: process.env.BACKUP_INTERVAL || 86400000, // 24 hours
      retentionPeriod: process.env.BACKUP_RETENTION || 30, // 30 days
      maxBackupSize: process.env.MAX_BACKUP_SIZE || 1024 * 1024 * 1024, // 1GB
      recoveryPointObjective: process.env.RPO || 3600000, // 1 hour
      recoveryTimeObjective: process.env.RTO || 300000, // 5 minutes
      healthCheckInterval: process.env.HEALTH_CHECK_INTERVAL || 60000 // 1 minute
    };

    // Initialize AWS SDK
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });

    this.backupStatus = {
      lastBackup: null,
      lastRecovery: null,
      backupInProgress: false,
      recoveryInProgress: false
    };

    this.healthStatus = {
      status: 'healthy',
      lastCheck: null,
      issues: []
    };
  }

  /**
   * Initialize disaster recovery service
   */
  async initialize() {
    try {
      // Verify backup storage
      await this.verifyBackupStorage();
      
      // Start backup schedule
      this.startBackupSchedule();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      logger.info('Disaster Recovery Service initialized successfully');
    } catch (error) {
      logger.error('Error initializing Disaster Recovery Service:', error);
      throw error;
    }
  }

  /**
   * Verify backup storage configuration
   */
  async verifyBackupStorage() {
    try {
      // Check S3 bucket access
      await this.s3.headBucket({
        Bucket: process.env.AWS_BACKUP_BUCKET
      }).promise();

      // Check Redis connection
      await this.redis.ping();

      logger.info('Backup storage verification successful');
    } catch (error) {
      logger.error('Backup storage verification failed:', error);
      throw error;
    }
  }

  /**
   * Start backup schedule
   */
  startBackupSchedule() {
    setInterval(async () => {
      try {
        await this.performBackup();
      } catch (error) {
        logger.error('Scheduled backup failed:', error);
      }
    }, this.config.backupInterval);
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(async () => {
      try {
        await this.checkSystemHealth();
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform system backup
   */
  async performBackup() {
    if (this.backupStatus.backupInProgress) {
      throw new Error('Backup already in progress');
    }

    try {
      this.backupStatus.backupInProgress = true;
      logger.info('Starting system backup');

      // Create backup metadata
      const backupId = `backup-${Date.now()}`;
      const metadata = {
        id: backupId,
        timestamp: new Date(),
        type: 'full',
        components: []
      };

      // Backup MongoDB
      const mongoBackup = await this.backupMongoDB();
      metadata.components.push({
        type: 'mongodb',
        size: mongoBackup.size,
        collections: mongoBackup.collections
      });

      // Backup Redis
      const redisBackup = await this.backupRedis();
      metadata.components.push({
        type: 'redis',
        size: redisBackup.size,
        keys: redisBackup.keys
      });

      // Upload backups to S3
      await this.uploadBackup(backupId, metadata);

      // Clean up old backups
      await this.cleanupOldBackups();

      this.backupStatus.lastBackup = new Date();
      logger.info(`Backup completed: ${backupId}`);
    } catch (error) {
      logger.error('Backup failed:', error);
      throw error;
    } finally {
      this.backupStatus.backupInProgress = false;
    }
  }

  /**
   * Backup MongoDB
   */
  async backupMongoDB() {
    const collections = await mongoose.connection.db.collections();
    const backup = {
      collections: [],
      size: 0
    };

    for (const collection of collections) {
      const documents = await collection.find({}).toArray();
      const collectionBackup = {
        name: collection.collectionName,
        documents
      };

      backup.collections.push(collectionBackup);
      backup.size += Buffer.byteLength(JSON.stringify(documents));
    }

    return backup;
  }

  /**
   * Backup Redis
   */
  async backupRedis() {
    const backup = {
      keys: [],
      size: 0
    };

    const keys = await this.redis.keys('*');
    for (const key of keys) {
      const type = await this.redis.type(key);
      let value;

      switch (type) {
        case 'string':
          value = await this.redis.get(key);
          break;
        case 'hash':
          value = await this.redis.hgetall(key);
          break;
        case 'set':
          value = await this.redis.smembers(key);
          break;
        case 'zset':
          value = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
          break;
        case 'list':
          value = await this.redis.lrange(key, 0, -1);
          break;
      }

      backup.keys.push({
        key,
        type,
        value
      });

      backup.size += Buffer.byteLength(JSON.stringify(value));
    }

    return backup;
  }

  /**
   * Upload backup to S3
   */
  async uploadBackup(backupId, metadata) {
    const backupData = {
      metadata,
      mongodb: await this.backupMongoDB(),
      redis: await this.backupRedis()
    };

    await this.s3.putObject({
      Bucket: process.env.AWS_BACKUP_BUCKET,
      Key: `${backupId}.json`,
      Body: JSON.stringify(backupData),
      ContentType: 'application/json'
    }).promise();
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups() {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - this.config.retentionPeriod);

    const response = await this.s3.listObjects({
      Bucket: process.env.AWS_BACKUP_BUCKET
    }).promise();

    for (const object of response.Contents) {
      if (object.LastModified < retentionDate) {
        await this.s3.deleteObject({
          Bucket: process.env.AWS_BACKUP_BUCKET,
          Key: object.Key
        }).promise();

        logger.info(`Deleted old backup: ${object.Key}`);
      }
    }
  }

  /**
   * Perform system recovery
   */
  async performRecovery(backupId) {
    if (this.backupStatus.recoveryInProgress) {
      throw new Error('Recovery already in progress');
    }

    try {
      this.backupStatus.recoveryInProgress = true;
      logger.info(`Starting system recovery from backup: ${backupId}`);

      // Download backup from S3
      const backup = await this.downloadBackup(backupId);

      // Verify backup integrity
      this.verifyBackupIntegrity(backup);

      // Stop services
      await this.stopServices();

      // Restore MongoDB
      await this.restoreMongoDB(backup.mongodb);

      // Restore Redis
      await this.restoreRedis(backup.redis);

      // Restart services
      await this.startServices();

      this.backupStatus.lastRecovery = new Date();
      logger.info('Recovery completed successfully');
    } catch (error) {
      logger.error('Recovery failed:', error);
      throw error;
    } finally {
      this.backupStatus.recoveryInProgress = false;
    }
  }

  /**
   * Download backup from S3
   */
  async downloadBackup(backupId) {
    const response = await this.s3.getObject({
      Bucket: process.env.AWS_BACKUP_BUCKET,
      Key: `${backupId}.json`
    }).promise();

    return JSON.parse(response.Body.toString());
  }

  /**
   * Verify backup integrity
   */
  verifyBackupIntegrity(backup) {
    if (!backup.metadata || !backup.mongodb || !backup.redis) {
      throw new Error('Invalid backup format');
    }

    if (backup.metadata.type !== 'full') {
      throw new Error('Only full backups are supported for recovery');
    }
  }

  /**
   * Stop services before recovery
   */
  async stopServices() {
    // Notify load balancer to stop accepting new requests
    await LoadBalancerService.performGracefulShutdown();

    // Wait for active requests to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  /**
   * Start services after recovery
   */
  async startServices() {
    // Reinitialize services
    await LoadBalancerService.initialize();
  }

  /**
   * Restore MongoDB from backup
   */
  async restoreMongoDB(backup) {
    for (const collection of backup.collections) {
      const mongoCollection = mongoose.connection.db.collection(collection.name);
      
      // Clear existing data
      await mongoCollection.deleteMany({});

      // Insert backup data
      if (collection.documents.length > 0) {
        await mongoCollection.insertMany(collection.documents);
      }
    }
  }

  /**
   * Restore Redis from backup
   */
  async restoreRedis(backup) {
    // Clear existing data
    await this.redis.flushall();

    for (const item of backup.keys) {
      switch (item.type) {
        case 'string':
          await this.redis.set(item.key, item.value);
          break;
        case 'hash':
          await this.redis.hmset(item.key, item.value);
          break;
        case 'set':
          await this.redis.sadd(item.key, ...item.value);
          break;
        case 'zset':
          for (let i = 0; i < item.value.length; i += 2) {
            await this.redis.zadd(item.key, item.value[i + 1], item.value[i]);
          }
          break;
        case 'list':
          await this.redis.rpush(item.key, ...item.value);
          break;
      }
    }
  }

  /**
   * Check system health
   */
  async checkSystemHealth() {
    const issues = [];

    try {
      // Check MongoDB connection
      const mongoStatus = await mongoose.connection.db.admin().ping();
      if (!mongoStatus.ok) {
        issues.push('MongoDB connection issue');
      }

      // Check Redis connection
      const redisStatus = await this.redis.ping();
      if (redisStatus !== 'PONG') {
        issues.push('Redis connection issue');
      }

      // Check backup storage
      try {
        await this.s3.headBucket({
          Bucket: process.env.AWS_BACKUP_BUCKET
        }).promise();
      } catch (error) {
        issues.push('Backup storage access issue');
      }

      // Check last backup age
      if (this.backupStatus.lastBackup) {
        const backupAge = Date.now() - this.backupStatus.lastBackup.getTime();
        if (backupAge > this.config.recoveryPointObjective) {
          issues.push('Backup age exceeds RPO');
        }
      }

      // Update health status
      this.healthStatus = {
        status: issues.length === 0 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        issues
      };

      if (issues.length > 0) {
        logger.warn('Health check found issues:', issues);
      }
    } catch (error) {
      logger.error('Health check failed:', error);
      this.healthStatus.status = 'error';
      this.healthStatus.issues = [error.message];
    }
  }

  /**
   * Get backup status
   */
  getBackupStatus() {
    return {
      ...this.backupStatus,
      health: this.healthStatus
    };
  }

  /**
   * List available backups
   */
  async listBackups() {
    const response = await this.s3.listObjects({
      Bucket: process.env.AWS_BACKUP_BUCKET
    }).promise();

    return response.Contents.map(object => ({
      id: object.Key.replace('.json', ''),
      timestamp: object.LastModified,
      size: object.Size
    }));
  }
}

module.exports = new DisasterRecoveryService();
