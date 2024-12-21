const AWS = require('aws-sdk');
const cloudfront = new AWS.CloudFront();
const s3 = new AWS.S3();
const logger = require('./LoggerService');
const config = require('../config');
const path = require('path');
const crypto = require('crypto');

class CDNService {
  constructor() {
    this.config = {
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET,
      cloudfrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
      cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN,
      maxAge: process.env.CDN_MAX_AGE || 86400, // 24 hours
      compressionTypes: ['text/html', 'text/css', 'text/javascript', 'application/json'],
      defaultCachePolicy: {
        minTTL: 0,
        defaultTTL: 86400,
        maxTTL: 31536000, // 1 year
        compress: true
      }
    };

    // Configure AWS
    AWS.config.update({
      region: this.config.region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });
  }

  /**
   * Initialize CDN service
   */
  async initialize() {
    try {
      // Verify S3 bucket exists
      await this.verifyBucket();

      // Configure CloudFront distribution
      await this.configureDistribution();

      // Set up bucket policies
      await this.configureBucketPolicies();

      logger.info('CDN service initialized successfully');
    } catch (error) {
      logger.error('Error initializing CDN service:', error);
      throw error;
    }
  }

  /**
   * Verify S3 bucket exists and create if necessary
   */
  async verifyBucket() {
    try {
      await s3.headBucket({ Bucket: this.config.bucket }).promise();
      logger.info(`S3 bucket ${this.config.bucket} verified`);
    } catch (error) {
      if (error.code === 'NotFound') {
        await s3.createBucket({
          Bucket: this.config.bucket,
          ACL: 'private'
        }).promise();
        logger.info(`Created S3 bucket ${this.config.bucket}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Configure CloudFront distribution
   */
  async configureDistribution() {
    try {
      const params = {
        Id: this.config.cloudfrontDistributionId
      };

      const distribution = await cloudfront.getDistribution(params).promise();
      
      if (distribution.Status === 'Deployed') {
        logger.info('CloudFront distribution is already configured');
        return;
      }

      // Update distribution configuration
      const updateParams = {
        Id: this.config.cloudfrontDistributionId,
        DistributionConfig: {
          ...distribution.DistributionConfig,
          DefaultCacheBehavior: {
            ...distribution.DistributionConfig.DefaultCacheBehavior,
            MinTTL: this.config.defaultCachePolicy.minTTL,
            DefaultTTL: this.config.defaultCachePolicy.defaultTTL,
            MaxTTL: this.config.defaultCachePolicy.maxTTL,
            Compress: this.config.defaultCachePolicy.compress
          }
        },
        IfMatch: distribution.ETag
      };

      await cloudfront.updateDistribution(updateParams).promise();
      logger.info('Updated CloudFront distribution configuration');
    } catch (error) {
      logger.error('Error configuring CloudFront distribution:', error);
      throw error;
    }
  }

  /**
   * Configure S3 bucket policies
   */
  async configureBucketPolicies() {
    try {
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'CloudFrontAccess',
            Effect: 'Allow',
            Principal: {
              AWS: `arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${this.config.cloudfrontDistributionId}`
            },
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${this.config.bucket}/*`
          }
        ]
      };

      await s3.putBucketPolicy({
        Bucket: this.config.bucket,
        Policy: JSON.stringify(policy)
      }).promise();

      logger.info('Updated S3 bucket policy');
    } catch (error) {
      logger.error('Error configuring bucket policies:', error);
      throw error;
    }
  }

  /**
   * Upload file to CDN
   */
  async uploadFile(file, tenantId) {
    try {
      const key = this.generateKey(file.originalname, tenantId);
      const contentType = file.mimetype;
      
      const params = {
        Bucket: this.config.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: contentType,
        CacheControl: `public, max-age=${this.config.maxAge}`,
        Metadata: {
          'tenant-id': tenantId
        }
      };

      // Enable compression for supported content types
      if (this.config.compressionTypes.includes(contentType)) {
        params.ContentEncoding = 'gzip';
      }

      await s3.upload(params).promise();
      
      const url = this.getCDNUrl(key);
      logger.info(`Uploaded file to CDN: ${url}`);
      
      return url;
    } catch (error) {
      logger.error('Error uploading file to CDN:', error);
      throw error;
    }
  }

  /**
   * Delete file from CDN
   */
  async deleteFile(key, tenantId) {
    try {
      await s3.deleteObject({
        Bucket: this.config.bucket,
        Key: this.generateKey(key, tenantId)
      }).promise();

      // Invalidate CloudFront cache
      await this.invalidateCache([key]);
      
      logger.info(`Deleted file from CDN: ${key}`);
    } catch (error) {
      logger.error('Error deleting file from CDN:', error);
      throw error;
    }
  }

  /**
   * Invalidate CloudFront cache
   */
  async invalidateCache(paths) {
    try {
      const params = {
        DistributionId: this.config.cloudfrontDistributionId,
        InvalidationBatch: {
          CallerReference: Date.now().toString(),
          Paths: {
            Quantity: paths.length,
            Items: paths.map(p => `/${p}`)
          }
        }
      };

      await cloudfront.createInvalidation(params).promise();
      logger.info(`Invalidated CDN cache for paths: ${paths.join(', ')}`);
    } catch (error) {
      logger.error('Error invalidating CDN cache:', error);
      throw error;
    }
  }

  /**
   * Generate unique key for file
   */
  generateKey(filename, tenantId) {
    const ext = path.extname(filename);
    const hash = crypto
      .createHash('md5')
      .update(`${filename}${Date.now()}`)
      .digest('hex');
    
    return `${tenantId}/${hash}${ext}`;
  }

  /**
   * Get CDN URL for key
   */
  getCDNUrl(key) {
    return `https://${this.config.cloudfrontDomain}/${key}`;
  }

  /**
   * Get CDN distribution status
   */
  async getStatus() {
    try {
      const distribution = await cloudfront.getDistribution({
        Id: this.config.cloudfrontDistributionId
      }).promise();

      const bucketSize = await this.getBucketSize();

      return {
        status: distribution.Status,
        domain: this.config.cloudfrontDomain,
        bucketSize,
        lastModified: distribution.LastModifiedTime
      };
    } catch (error) {
      logger.error('Error getting CDN status:', error);
      throw error;
    }
  }

  /**
   * Get total bucket size
   */
  async getBucketSize() {
    try {
      const objects = await s3.listObjectsV2({
        Bucket: this.config.bucket
      }).promise();

      return objects.Contents.reduce((total, obj) => total + obj.Size, 0);
    } catch (error) {
      logger.error('Error getting bucket size:', error);
      throw error;
    }
  }
}

module.exports = new CDNService();
