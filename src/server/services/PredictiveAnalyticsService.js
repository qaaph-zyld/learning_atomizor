const mongoose = require('mongoose');
const natural = require('natural');
const Content = require('../models/Content');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Queue = require('../models/Queue');
const logger = require('./LoggerService');
const redis = require('./CacheService');

class PredictiveAnalyticsService {
  constructor() {
    this.classifier = new natural.BayesClassifier();
    
    this.modelCache = {
      userChurn: null,
      contentPerformance: null,
      systemLoad: null,
      lastUpdate: null
    };

    this.config = {
      updateInterval: process.env.PREDICTIVE_UPDATE_INTERVAL || 3600000, // 1 hour
      predictionHorizon: process.env.PREDICTION_HORIZON || 7, // days
      confidenceThreshold: process.env.PREDICTION_CONFIDENCE || 0.7,
      minDataPoints: process.env.MIN_DATA_POINTS || 100
    };
  }

  /**
   * Initialize predictive models
   */
  async initialize() {
    try {
      await this.updateModels();
      
      // Schedule periodic model updates
      setInterval(() => {
        this.updateModels();
      }, this.config.updateInterval);
      
      logger.info('Predictive Analytics Service initialized successfully');
    } catch (error) {
      logger.error('Error initializing Predictive Analytics Service:', error);
      throw error;
    }
  }

  /**
   * Update prediction models
   */
  async updateModels() {
    try {
      const [userChurn, contentPerformance, systemLoad] = await Promise.all([
        this.trainUserChurnModel(),
        this.trainContentPerformanceModel(),
        this.trainSystemLoadModel()
      ]);

      this.modelCache = {
        userChurn,
        contentPerformance,
        systemLoad,
        lastUpdate: new Date()
      };

      // Cache models in Redis
      await redis.set('predictive:models', JSON.stringify(this.modelCache), 'EX', 86400);
      
      logger.info('Predictive models updated successfully');
    } catch (error) {
      logger.error('Error updating predictive models:', error);
      throw error;
    }
  }

  /**
   * Train user churn prediction model
   */
  async trainUserChurnModel() {
    const users = await User.aggregate([
      {
        $lookup: {
          from: 'auditlogs',
          localField: '_id',
          foreignField: 'actor.user',
          as: 'activities'
        }
      },
      {
        $project: {
          _id: 1,
          activityCount: { $size: '$activities' },
          lastActive: { $max: '$activities.timestamp' },
          engagementMetrics: {
            contentViews: {
              $size: {
                $filter: {
                  input: '$activities',
                  as: 'activity',
                  cond: { 
                    $and: [
                      { $eq: ['$$activity.action', 'view'] },
                      { $eq: ['$$activity.resource.type', 'content'] }
                    ]
                  }
                }
              }
            },
            interactions: {
              $size: {
                $filter: {
                  input: '$activities',
                  as: 'activity',
                  cond: { 
                    $in: ['$$activity.action', ['like', 'comment', 'share']]
                  }
                }
              }
            }
          },
          createdAt: 1
        }
      }
    ]);

    if (users.length < this.config.minDataPoints) {
      return this.modelCache?.userChurn || { coefficients: null, accuracy: 0 };
    }

    // Prepare training data
    const trainingData = users.map(user => ({
      features: this.extractUserChurnFeatures(user),
      label: this.isChurned(user)
    }));

    // Train logistic regression model
    return this.trainLogisticRegression(trainingData);
  }

  /**
   * Extract features for user churn prediction
   */
  extractUserChurnFeatures(user) {
    const daysSinceActive = (new Date() - new Date(user.lastActive)) / (1000 * 60 * 60 * 24);
    const accountAge = (new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24);
    
    return [
      1, // Bias term
      user.activityCount / accountAge, // Activity frequency
      user.engagementMetrics.contentViews / Math.max(1, user.activityCount), // Content view ratio
      user.engagementMetrics.interactions / Math.max(1, user.activityCount), // Interaction ratio
      Math.exp(-daysSinceActive / 30), // Recency score
      Math.min(1, accountAge / 90) // Account age factor
    ];
  }

  /**
   * Determine if a user has churned
   */
  isChurned(user) {
    const daysSinceActive = (new Date() - new Date(user.lastActive)) / (1000 * 60 * 60 * 24);
    return daysSinceActive > 30; // Consider churned if inactive for 30 days
  }

  /**
   * Train content performance prediction model
   */
  async trainContentPerformanceModel() {
    const contents = await Content.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: {
            $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
          }
        }
      },
      {
        $lookup: {
          from: 'auditlogs',
          localField: '_id',
          foreignField: 'resource.content',
          as: 'interactions'
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          tags: 1,
          contentType: 1,
          fileSize: 1,
          processingMetrics: 1,
          interactionMetrics: {
            views: {
              $size: {
                $filter: {
                  input: '$interactions',
                  as: 'interaction',
                  cond: { $eq: ['$$interaction.action', 'view'] }
                }
              }
            },
            likes: {
              $size: {
                $filter: {
                  input: '$interactions',
                  as: 'interaction',
                  cond: { $eq: ['$$interaction.action', 'like'] }
                }
              }
            },
            shares: {
              $size: {
                $filter: {
                  input: '$interactions',
                  as: 'interaction',
                  cond: { $eq: ['$$interaction.action', 'share'] }
                }
              }
            }
          },
          createdAt: 1
        }
      }
    ]);

    if (contents.length < this.config.minDataPoints) {
      return this.modelCache?.contentPerformance || { coefficients: null, accuracy: 0 };
    }

    // Prepare training data
    const trainingData = contents.map(content => ({
      features: this.extractContentPerformanceFeatures(content),
      label: this.calculateContentScore(content)
    }));

    // Train regression model
    return this.trainLinearRegression(trainingData);
  }

  /**
   * Extract features for content performance prediction
   */
  extractContentPerformanceFeatures(content) {
    return [
      1, // Bias term
      content.tags.length, // Number of tags
      content.fileSize / 1024 / 1024, // Size in MB
      content.processingMetrics.accuracyScore || 0,
      content.processingMetrics.processingTime / 1000, // Processing time in seconds
      ['video', 'audio', 'document', 'image'].indexOf(content.contentType) / 3, // Content type factor
      Math.min(content.description.length / 500, 1) // Description length factor
    ];
  }

  /**
   * Calculate content performance score
   */
  calculateContentScore(content) {
    const age = (new Date() - new Date(content.createdAt)) / (1000 * 60 * 60 * 24);
    const dailyViews = content.interactionMetrics.views / Math.max(1, age);
    const engagementRate = (
      content.interactionMetrics.likes + 
      content.interactionMetrics.shares * 2
    ) / Math.max(1, content.interactionMetrics.views);

    return (dailyViews * 0.7 + engagementRate * 0.3);
  }

  /**
   * Train system load prediction model
   */
  async trainSystemLoadModel() {
    const metrics = await Queue.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d-%H',
              date: '$createdAt'
            }
          },
          jobCount: { $sum: 1 },
          avgProcessingTime: { $avg: '$processingTime' },
          maxProcessingTime: { $max: '$processingTime' },
          errorRate: {
            $avg: {
              $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    if (metrics.length < this.config.minDataPoints) {
      return this.modelCache?.systemLoad || { coefficients: null, accuracy: 0 };
    }

    // Prepare time series data
    const timeSeriesData = metrics.map((metric, i) => ({
      features: this.extractSystemLoadFeatures(metrics, i),
      label: metric.jobCount
    }));

    // Train time series model
    return this.trainTimeSeriesModel(timeSeriesData);
  }

  /**
   * Extract features for system load prediction
   */
  extractSystemLoadFeatures(metrics, index) {
    const recent = metrics.slice(Math.max(0, index - 24), index);
    const hourOfDay = parseInt(metrics[index]._id.split('-')[3]);
    const dayOfWeek = new Date(metrics[index]._id).getDay();

    return [
      1, // Bias term
      recent.reduce((sum, m) => sum + m.jobCount, 0) / recent.length, // Average recent load
      recent.reduce((sum, m) => sum + m.avgProcessingTime, 0) / recent.length, // Average processing time
      recent.reduce((sum, m) => sum + m.errorRate, 0) / recent.length, // Average error rate
      Math.sin(2 * Math.PI * hourOfDay / 24), // Hour of day (cyclic)
      Math.cos(2 * Math.PI * hourOfDay / 24),
      Math.sin(2 * Math.PI * dayOfWeek / 7), // Day of week (cyclic)
      Math.cos(2 * Math.PI * dayOfWeek / 7)
    ];
  }

  /**
   * Train logistic regression model
   */
  trainLogisticRegression(data) {
    const features = data.map(d => d.features);
    const labels = data.map(d => d.label);
    
    // Initialize coefficients
    let coefficients = new Array(features[0].length).fill(0);
    const learningRate = 0.1;
    const iterations = 100;

    // Gradient descent
    for (let iter = 0; iter < iterations; iter++) {
      const predictions = features.map(f => 
        this.sigmoid(f.reduce((sum, val, i) => sum + val * coefficients[i], 0))
      );

      // Update coefficients
      for (let j = 0; j < coefficients.length; j++) {
        const gradient = features.reduce((sum, f, i) => 
          sum + f[j] * (predictions[i] - labels[i]), 0
        ) / features.length;

        coefficients[j] -= learningRate * gradient;
      }
    }

    // Calculate accuracy
    const accuracy = this.calculateAccuracy(features, labels, coefficients);

    return { coefficients, accuracy };
  }

  /**
   * Train linear regression model
   */
  trainLinearRegression(data) {
    const features = data.map(d => d.features);
    const labels = data.map(d => d.label);
    
    // Initialize coefficients
    let coefficients = new Array(features[0].length).fill(0);
    const learningRate = 0.1;
    const iterations = 100;

    // Gradient descent
    for (let iter = 0; iter < iterations; iter++) {
      const predictions = features.map(f => 
        f.reduce((sum, val, i) => sum + val * coefficients[i], 0)
      );

      // Update coefficients
      for (let j = 0; j < coefficients.length; j++) {
        const gradient = features.reduce((sum, f, i) => 
          sum + f[j] * (predictions[i] - labels[i]), 0
        ) / features.length;

        coefficients[j] -= learningRate * gradient;
      }
    }

    // Calculate R-squared
    const accuracy = this.calculateRSquared(features, labels, coefficients);

    return { coefficients, accuracy };
  }

  /**
   * Train time series model (Simple exponential smoothing)
   */
  trainTimeSeriesModel(data) {
    const features = data.map(d => d.features);
    const labels = data.map(d => d.label);
    
    // Initialize coefficients
    let coefficients = new Array(features[0].length).fill(0);
    const learningRate = 0.1;
    const iterations = 100;

    // Gradient descent with time-based weights
    for (let iter = 0; iter < iterations; iter++) {
      const predictions = features.map(f => 
        f.reduce((sum, val, i) => sum + val * coefficients[i], 0)
      );

      // Update coefficients with time-based weights
      for (let j = 0; j < coefficients.length; j++) {
        const gradient = features.reduce((sum, f, i) => {
          const timeWeight = Math.exp(-(data.length - i) / data.length);
          return sum + timeWeight * f[j] * (predictions[i] - labels[i]);
        }, 0) / features.length;

        coefficients[j] -= learningRate * gradient;
      }
    }

    // Calculate accuracy (RMSE)
    const accuracy = this.calculateRMSE(features, labels, coefficients);

    return { coefficients, accuracy };
  }

  /**
   * Sigmoid function for logistic regression
   */
  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Calculate accuracy for classification
   */
  calculateAccuracy(features, labels, coefficients) {
    const predictions = features.map(f => 
      this.sigmoid(f.reduce((sum, val, i) => sum + val * coefficients[i], 0)) > 0.5
    );

    return predictions.reduce((sum, pred, i) => 
      sum + (pred === labels[i] ? 1 : 0), 0
    ) / features.length;
  }

  /**
   * Calculate R-squared for regression
   */
  calculateRSquared(features, labels, coefficients) {
    const predictions = features.map(f => 
      f.reduce((sum, val, i) => sum + val * coefficients[i], 0)
    );

    const meanLabel = labels.reduce((sum, val) => sum + val, 0) / labels.length;
    const totalSS = labels.reduce((sum, val) => sum + Math.pow(val - meanLabel, 2), 0);
    const residualSS = labels.reduce((sum, val, i) => 
      sum + Math.pow(val - predictions[i], 2), 0
    );

    return 1 - (residualSS / totalSS);
  }

  /**
   * Calculate RMSE for time series
   */
  calculateRMSE(features, labels, coefficients) {
    const predictions = features.map(f => 
      f.reduce((sum, val, i) => sum + val * coefficients[i], 0)
    );

    const mse = labels.reduce((sum, val, i) => 
      sum + Math.pow(val - predictions[i], 2), 0
    ) / labels.length;

    return Math.sqrt(mse);
  }

  /**
   * Predict user churn probability
   */
  async predictUserChurn(userId) {
    try {
      const user = await User.findById(userId).populate('activities');
      if (!user) throw new Error('User not found');

      const model = this.modelCache?.userChurn;
      if (!model?.coefficients) return { probability: 0.5, confidence: 0 };

      const features = this.extractUserChurnFeatures(user);
      const probability = this.sigmoid(
        features.reduce((sum, val, i) => sum + val * model.coefficients[i], 0)
      );

      return {
        probability,
        confidence: model.accuracy,
        features: {
          activityFrequency: features[1],
          contentViewRatio: features[2],
          interactionRatio: features[3],
          recencyScore: features[4],
          accountAgeFactor: features[5]
        }
      };
    } catch (error) {
      logger.error('Error predicting user churn:', error);
      throw error;
    }
  }

  /**
   * Predict content performance
   */
  async predictContentPerformance(contentId) {
    try {
      const content = await Content.findById(contentId).populate('interactions');
      if (!content) throw new Error('Content not found');

      const model = this.modelCache?.contentPerformance;
      if (!model?.coefficients) return { score: 0, confidence: 0 };

      const features = this.extractContentPerformanceFeatures(content);
      const score = features.reduce((sum, val, i) => sum + val * model.coefficients[i], 0);

      return {
        score: Math.max(0, Math.min(1, score)), // Normalize to [0,1]
        confidence: model.accuracy,
        features: {
          tagCount: features[1],
          fileSize: features[2],
          accuracyScore: features[3],
          processingTime: features[4],
          contentTypeFactor: features[5],
          descriptionFactor: features[6]
        }
      };
    } catch (error) {
      logger.error('Error predicting content performance:', error);
      throw error;
    }
  }

  /**
   * Predict system load
   */
  async predictSystemLoad(hours = 24) {
    try {
      const model = this.modelCache?.systemLoad;
      if (!model?.coefficients) return { predictions: [], confidence: 0 };

      const metrics = await Queue.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d-%H',
                date: '$createdAt'
              }
            },
            jobCount: { $sum: 1 },
            avgProcessingTime: { $avg: '$processingTime' },
            maxProcessingTime: { $max: '$processingTime' },
            errorRate: {
              $avg: {
                $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
              }
            }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 24 } // Last 24 hours
      ]);

      const predictions = [];
      let currentDate = new Date();

      for (let i = 0; i < hours; i++) {
        const features = this.extractSystemLoadFeatures(
          [...metrics.reverse(), ...predictions], 
          metrics.length + i
        );

        const prediction = features.reduce(
          (sum, val, i) => sum + val * model.coefficients[i], 
          0
        );

        predictions.push({
          timestamp: new Date(currentDate.getTime() + i * 60 * 60 * 1000),
          predictedLoad: Math.max(0, prediction),
          features: {
            recentLoad: features[1],
            processingTime: features[2],
            errorRate: features[3],
            hourOfDay: features[4],
            dayOfWeek: features[6]
          }
        });
      }

      return {
        predictions,
        confidence: model.accuracy
      };
    } catch (error) {
      logger.error('Error predicting system load:', error);
      throw error;
    }
  }
}

module.exports = new PredictiveAnalyticsService();
