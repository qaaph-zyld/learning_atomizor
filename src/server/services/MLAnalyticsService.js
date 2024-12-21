const mongoose = require('mongoose');
const natural = require('natural');
const Content = require('../models/Content');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('./LoggerService');
const redis = require('./CacheService');

class MLAnalyticsService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    
    this.modelCache = {
      contentClusters: null,
      userSegments: null,
      lastUpdate: null
    };

    this.config = {
      updateInterval: process.env.ML_UPDATE_INTERVAL || 3600000, // 1 hour
      minSamples: process.env.ML_MIN_SAMPLES || 50,
      maxClusters: process.env.ML_MAX_CLUSTERS || 10,
      confidenceThreshold: process.env.ML_CONFIDENCE_THRESHOLD || 0.7
    };
  }

  /**
   * Initialize ML models and cache
   */
  async initialize() {
    try {
      await this.updateModels();
      
      // Schedule periodic model updates
      setInterval(() => {
        this.updateModels();
      }, this.config.updateInterval);
      
      logger.info('ML Analytics Service initialized successfully');
    } catch (error) {
      logger.error('Error initializing ML Analytics Service:', error);
      throw error;
    }
  }

  /**
   * Update ML models with latest data
   */
  async updateModels() {
    try {
      const [contentClusters, userSegments] = await Promise.all([
        this.generateContentClusters(),
        this.generateUserSegments()
      ]);

      this.modelCache = {
        contentClusters,
        userSegments,
        lastUpdate: new Date()
      };

      // Cache models in Redis
      await redis.set('ml:models', JSON.stringify(this.modelCache), 'EX', 86400); // 24 hours
      
      logger.info('ML models updated successfully');
    } catch (error) {
      logger.error('Error updating ML models:', error);
      throw error;
    }
  }

  /**
   * Generate content clusters using TF-IDF and K-means
   */
  async generateContentClusters() {
    const contents = await Content.find({
      status: 'completed',
      'processingMetrics.accuracyScore': { $gt: this.config.confidenceThreshold }
    }).select('title description content tags processingMetrics');

    if (contents.length < this.config.minSamples) {
      return this.modelCache?.contentClusters || [];
    }

    // Build TF-IDF matrix
    contents.forEach((content, idx) => {
      const text = [
        content.title,
        content.description,
        ...content.tags,
        content.content
      ].join(' ');
      
      this.tfidf.addDocument(text);
    });

    // Convert to feature vectors
    const vectors = contents.map((_, idx) => {
      return this.tfidf.listTerms(idx)
        .sort((a, b) => b.tfidf - a.tfidf)
        .slice(0, 100)
        .map(term => term.tfidf);
    });

    // Perform K-means clustering
    const clusters = this.kMeansClustering(vectors, Math.min(
      this.config.maxClusters,
      Math.floor(Math.sqrt(contents.length / 2))
    ));

    return clusters.map((cluster, idx) => ({
      id: idx,
      size: cluster.points.length,
      centroid: cluster.centroid,
      topTerms: this.getTopTermsForCluster(cluster.points, contents),
      contentIds: cluster.points.map(point => contents[point.index]._id)
    }));
  }

  /**
   * Generate user segments based on behavior and preferences
   */
  async generateUserSegments() {
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
          preferences: 1,
          activityCount: { $size: '$activities' },
          contentInteractions: {
            $filter: {
              input: '$activities',
              as: 'activity',
              cond: { $eq: ['$$activity.resource.type', 'content'] }
            }
          },
          lastActive: { $max: '$activities.timestamp' }
        }
      }
    ]);

    if (users.length < this.config.minSamples) {
      return this.modelCache?.userSegments || [];
    }

    // Extract feature vectors
    const vectors = users.map(user => this.extractUserFeatures(user));

    // Perform clustering
    const segments = this.kMeansClustering(vectors, Math.min(
      this.config.maxClusters,
      Math.floor(Math.sqrt(users.length / 2))
    ));

    return segments.map((segment, idx) => ({
      id: idx,
      size: segment.points.length,
      characteristics: this.analyzeSegmentCharacteristics(segment.points, users),
      userIds: segment.points.map(point => users[point.index]._id)
    }));
  }

  /**
   * Extract feature vector from user data
   */
  extractUserFeatures(user) {
    return [
      user.activityCount / 100, // Normalized activity level
      user.contentInteractions.length / user.activityCount || 0, // Content interaction ratio
      this.calculateEngagementScore(user.contentInteractions),
      this.calculateRecency(user.lastActive),
      ...this.extractPreferenceFeatures(user.preferences)
    ];
  }

  /**
   * Calculate user engagement score
   */
  calculateEngagementScore(interactions) {
    if (!interactions.length) return 0;
    
    const weights = {
      view: 1,
      like: 2,
      comment: 3,
      share: 4
    };

    return interactions.reduce((score, interaction) => {
      return score + (weights[interaction.action] || 0);
    }, 0) / interactions.length;
  }

  /**
   * Calculate recency score
   */
  calculateRecency(lastActive) {
    if (!lastActive) return 0;
    const daysSinceActive = (new Date() - new Date(lastActive)) / (1000 * 60 * 60 * 24);
    return Math.exp(-daysSinceActive / 30); // Exponential decay over 30 days
  }

  /**
   * Extract features from user preferences
   */
  extractPreferenceFeatures(preferences) {
    const defaultPreferences = {
      contentTypes: [],
      topics: [],
      difficulty: 'medium',
      learningStyle: 'balanced'
    };

    const prefs = { ...defaultPreferences, ...preferences };
    
    return [
      prefs.contentTypes.length / 5, // Normalized content type diversity
      prefs.topics.length / 10, // Normalized topic diversity
      ['beginner', 'medium', 'advanced'].indexOf(prefs.difficulty) / 2, // Normalized difficulty preference
      ['visual', 'balanced', 'textual'].indexOf(prefs.learningStyle) / 2 // Normalized learning style
    ];
  }

  /**
   * K-means clustering implementation
   */
  kMeansClustering(vectors, k) {
    // Initialize centroids
    let centroids = vectors
      .slice(0, k)
      .map(vector => ({ ...vector }));

    let clusters;
    let iterations = 0;
    const maxIterations = 100;

    do {
      // Assign points to nearest centroid
      clusters = centroids.map(() => ({ points: [], centroid: null }));
      
      vectors.forEach((vector, index) => {
        const distances = centroids.map(centroid => 
          this.euclideanDistance(vector, centroid)
        );
        
        const nearestCentroid = distances.indexOf(Math.min(...distances));
        clusters[nearestCentroid].points.push({ vector, index });
      });

      // Update centroids
      const newCentroids = clusters.map(cluster => {
        if (!cluster.points.length) return cluster.centroid;
        
        return cluster.points[0].vector.map((_, dim) => {
          const sum = cluster.points.reduce((acc, point) => 
            acc + point.vector[dim], 0
          );
          return sum / cluster.points.length;
        });
      });

      // Check for convergence
      const centroidShift = centroids.reduce((acc, centroid, idx) => 
        acc + this.euclideanDistance(centroid, newCentroids[idx]), 0
      );

      centroids = newCentroids;
      iterations++;

      if (centroidShift < 0.001 || iterations >= maxIterations) break;
    } while (true);

    return clusters;
  }

  /**
   * Calculate Euclidean distance between vectors
   */
  euclideanDistance(a, b) {
    return Math.sqrt(
      a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
    );
  }

  /**
   * Get top terms for a content cluster
   */
  getTopTermsForCluster(points, contents) {
    const termFreq = {};
    
    points.forEach(point => {
      const content = contents[point.index];
      const text = [
        content.title,
        content.description,
        ...content.tags,
        content.content
      ].join(' ');
      
      const tokens = this.tokenizer.tokenize(text);
      tokens.forEach(token => {
        termFreq[token] = (termFreq[token] || 0) + 1;
      });
    });

    return Object.entries(termFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([term]) => term);
  }

  /**
   * Analyze characteristics of a user segment
   */
  analyzeSegmentCharacteristics(points, users) {
    const characteristics = {
      activityLevel: 0,
      contentPreferences: {},
      learningStyle: {},
      engagementPattern: {}
    };

    points.forEach(point => {
      const user = users[point.index];
      
      characteristics.activityLevel += user.activityCount;
      
      // Analyze content preferences
      user.contentInteractions.forEach(interaction => {
        characteristics.contentPreferences[interaction.resource.contentType] =
          (characteristics.contentPreferences[interaction.resource.contentType] || 0) + 1;
      });

      // Analyze learning style
      if (user.preferences?.learningStyle) {
        characteristics.learningStyle[user.preferences.learningStyle] =
          (characteristics.learningStyle[user.preferences.learningStyle] || 0) + 1;
      }

      // Analyze engagement pattern
      user.contentInteractions.forEach(interaction => {
        characteristics.engagementPattern[interaction.action] =
          (characteristics.engagementPattern[interaction.action] || 0) + 1;
      });
    });

    // Normalize values
    characteristics.activityLevel /= points.length;
    
    return characteristics;
  }

  /**
   * Get content recommendations for a user
   */
  async getContentRecommendations(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      // Get user's segment
      const userSegment = await this.getUserSegment(userId);
      if (!userSegment) return [];

      // Get relevant content clusters
      const relevantClusters = await this.getRelevantClusters(userSegment);
      
      // Get content recommendations
      const recommendations = await Content.find({
        _id: { $in: relevantClusters.flatMap(c => c.contentIds) },
        status: 'completed'
      }).select('title description tags processingMetrics.accuracyScore');

      // Score and rank recommendations
      return this.rankRecommendations(recommendations, user, userSegment);
    } catch (error) {
      logger.error('Error getting content recommendations:', error);
      throw error;
    }
  }

  /**
   * Get user's segment
   */
  async getUserSegment(userId) {
    const segments = this.modelCache?.userSegments;
    if (!segments) return null;

    return segments.find(segment => 
      segment.userIds.some(id => id.equals(userId))
    );
  }

  /**
   * Get relevant content clusters for a user segment
   */
  async getRelevantClusters(userSegment) {
    const clusters = this.modelCache?.contentClusters;
    if (!clusters) return [];

    // Calculate cluster relevance scores
    const scores = clusters.map(cluster => ({
      cluster,
      score: this.calculateClusterRelevance(cluster, userSegment)
    }));

    // Return top clusters
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(score => score.cluster);
  }

  /**
   * Calculate relevance score between content cluster and user segment
   */
  calculateClusterRelevance(cluster, segment) {
    // Implement relevance scoring based on:
    // - Content type alignment with segment preferences
    // - Topic overlap
    // - Difficulty level appropriateness
    // - Historical engagement patterns
    return Math.random(); // Placeholder implementation
  }

  /**
   * Rank content recommendations for a user
   */
  rankRecommendations(contents, user, segment) {
    return contents
      .map(content => ({
        content,
        score: this.calculateRecommendationScore(content, user, segment)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => ({
        ...item.content.toObject(),
        relevanceScore: item.score
      }));
  }

  /**
   * Calculate recommendation score for a content item
   */
  calculateRecommendationScore(content, user, segment) {
    const weights = {
      accuracy: 0.3,
      relevance: 0.3,
      recency: 0.2,
      popularity: 0.2
    };

    return (
      weights.accuracy * content.processingMetrics.accuracyScore +
      weights.relevance * this.calculateContentRelevance(content, user) +
      weights.recency * this.calculateRecencyScore(content.createdAt) +
      weights.popularity * this.calculatePopularityScore(content, segment)
    );
  }

  /**
   * Calculate content relevance score for a user
   */
  calculateContentRelevance(content, user) {
    // Calculate similarity between content and user preferences
    const contentFeatures = new Set([
      ...content.tags,
      content.type
    ]);
    
    const userPreferences = new Set([
      ...(user.preferences?.topics || []),
      ...(user.preferences?.contentTypes || [])
    ]);

    const intersection = new Set(
      [...contentFeatures].filter(x => userPreferences.has(x))
    );

    return intersection.size / Math.max(contentFeatures.size, userPreferences.size);
  }

  /**
   * Calculate popularity score within user segment
   */
  calculatePopularityScore(content, segment) {
    // Implement popularity scoring based on:
    // - View count within segment
    // - Engagement rate
    // - Sharing frequency
    return Math.random(); // Placeholder implementation
  }
}

module.exports = new MLAnalyticsService();
