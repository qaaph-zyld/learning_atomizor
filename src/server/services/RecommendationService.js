const mongoose = require('mongoose');
const Content = require('../models/Content');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const cache = require('./CacheService');
const logger = require('./LoggerService');
const { computeCosineSimilarity, extractFeatures } = require('./MLService');

class RecommendationService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 hour
    this.SIMILARITY_THRESHOLD = 0.6;
    this.MAX_RECOMMENDATIONS = 10;
    this.FEATURE_WEIGHTS = {
      content: 0.4,
      tags: 0.2,
      userBehavior: 0.2,
      popularity: 0.1,
      recency: 0.1
    };
  }

  /**
   * Get personalized content recommendations for a user
   */
  async getRecommendations(userId, workspaceId, options = {}) {
    const cacheKey = `recommendations:${userId}:${workspaceId}`;
    
    try {
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Cache hit for recommendations', { userId, workspaceId });
        return cached;
      }

      // Get user data and history
      const [user, userHistory] = await Promise.all([
        User.findById(userId),
        this.getUserHistory(userId, workspaceId)
      ]);

      if (!user) {
        throw new Error('User not found');
      }

      // Get candidate content items
      const candidates = await this.getCandidateContent(workspaceId, userHistory);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        user,
        candidates,
        userHistory,
        options
      );

      // Cache results
      await cache.set(cacheKey, recommendations, this.CACHE_TTL);

      return recommendations;
    } catch (error) {
      logger.error('Error generating recommendations:', error);
      throw error;
    }
  }

  /**
   * Get user's content interaction history
   */
  async getUserHistory(userId, workspaceId) {
    const history = await AuditLog.aggregate([
      {
        $match: {
          'actor.user': mongoose.Types.ObjectId(userId),
          'resource.workspace': mongoose.Types.ObjectId(workspaceId),
          'resource.type': 'content',
          action: { $in: ['view', 'complete', 'like', 'share'] }
        }
      },
      {
        $group: {
          _id: '$resource.id',
          interactions: {
            $push: {
              action: '$action',
              timestamp: '$timestamp'
            }
          },
          interactionCount: { $sum: 1 },
          lastInteraction: { $max: '$timestamp' }
        }
      }
    ]);

    return history.reduce((acc, item) => {
      acc[item._id] = {
        interactions: item.interactions,
        count: item.interactionCount,
        lastInteraction: item.lastInteraction
      };
      return acc;
    }, {});
  }

  /**
   * Get candidate content items for recommendations
   */
  async getCandidateContent(workspaceId, userHistory) {
    const viewedContentIds = Object.keys(userHistory);

    return Content.find({
      workspace: workspaceId,
      _id: { $nin: viewedContentIds },
      status: 'published'
    }).select('title description tags metrics processingMetrics createdAt');
  }

  /**
   * Generate personalized recommendations
   */
  async generateRecommendations(user, candidates, userHistory, options) {
    const { limit = this.MAX_RECOMMENDATIONS } = options;

    // Get user preferences
    const userPreferences = await this.getUserPreferences(user, userHistory);

    // Score candidates
    const scoredCandidates = await Promise.all(
      candidates.map(async content => {
        const score = await this.scoreContent(content, userPreferences, userHistory);
        return { content, score };
      })
    );

    // Sort and filter recommendations
    return scoredCandidates
      .filter(item => item.score >= this.SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        content: item.content,
        score: item.score,
        reasons: this.getRecommendationReasons(item.content, userPreferences)
      }));
  }

  /**
   * Get user preferences based on interaction history
   */
  async getUserPreferences(user, userHistory) {
    const interactedContent = await Content.find({
      _id: { $in: Object.keys(userHistory) }
    }).select('title description tags metrics processingMetrics');

    // Extract features from interacted content
    const contentFeatures = interactedContent.map(content => ({
      features: extractFeatures(content),
      weight: this.calculateInteractionWeight(userHistory[content._id])
    }));

    // Compute weighted average of features
    return this.computeWeightedFeatures(contentFeatures);
  }

  /**
   * Calculate weight for user interactions
   */
  calculateInteractionWeight(interactions) {
    const weights = {
      view: 1,
      complete: 3,
      like: 2,
      share: 2
    };

    return interactions.interactions.reduce((total, interaction) => {
      const timeFactor = this.calculateTimeFactor(interaction.timestamp);
      return total + (weights[interaction.action] || 1) * timeFactor;
    }, 0);
  }

  /**
   * Calculate time decay factor
   */
  calculateTimeFactor(timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    const days = age / (1000 * 60 * 60 * 24);
    return Math.exp(-0.1 * days); // Exponential decay
  }

  /**
   * Compute weighted average of features
   */
  computeWeightedFeatures(contentFeatures) {
    const totalWeight = contentFeatures.reduce((sum, item) => sum + item.weight, 0);
    
    return contentFeatures.reduce((avg, item) => {
      const weight = item.weight / totalWeight;
      Object.keys(item.features).forEach(key => {
        avg[key] = (avg[key] || 0) + item.features[key] * weight;
      });
      return avg;
    }, {});
  }

  /**
   * Score content item based on user preferences
   */
  async scoreContent(content, userPreferences, userHistory) {
    const features = extractFeatures(content);
    
    const scores = {
      content: computeCosineSimilarity(features, userPreferences),
      tags: this.calculateTagScore(content.tags, userPreferences.tags),
      userBehavior: await this.calculateUserBehaviorScore(content, userHistory),
      popularity: this.calculatePopularityScore(content),
      recency: this.calculateRecencyScore(content.createdAt)
    };

    // Compute weighted average
    return Object.entries(scores).reduce((total, [key, score]) => {
      return total + score * this.FEATURE_WEIGHTS[key];
    }, 0);
  }

  /**
   * Calculate similarity score for tags
   */
  calculateTagScore(contentTags, userTags) {
    if (!contentTags || !userTags) return 0;
    
    const intersection = contentTags.filter(tag => userTags.includes(tag));
    return intersection.length / Math.max(contentTags.length, userTags.length);
  }

  /**
   * Calculate score based on user behavior patterns
   */
  async calculateUserBehaviorScore(content, userHistory) {
    const similarContent = await this.findSimilarContent(content);
    
    return similarContent.reduce((score, similar) => {
      const history = userHistory[similar._id];
      if (history) {
        return score + this.calculateInteractionWeight(history);
      }
      return score;
    }, 0) / similarContent.length;
  }

  /**
   * Find similar content items
   */
  async findSimilarContent(content) {
    const cacheKey = `similar:${content._id}`;
    
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const similar = await Content.find({
      _id: { $ne: content._id },
      workspace: content.workspace,
      tags: { $in: content.tags }
    }).limit(5);

    await cache.set(cacheKey, similar, this.CACHE_TTL);
    return similar;
  }

  /**
   * Calculate popularity score
   */
  calculatePopularityScore(content) {
    const { viewCount, likeCount, shareCount } = content.metrics;
    const total = viewCount + likeCount * 2 + shareCount * 3;
    return Math.min(total / 1000, 1); // Normalize to [0,1]
  }

  /**
   * Calculate recency score
   */
  calculateRecencyScore(createdAt) {
    const age = Date.now() - new Date(createdAt).getTime();
    const days = age / (1000 * 60 * 60 * 24);
    return Math.exp(-0.05 * days); // Exponential decay
  }

  /**
   * Get human-readable reasons for recommendation
   */
  getRecommendationReasons(content, userPreferences) {
    const reasons = [];

    // Content similarity
    if (computeCosineSimilarity(extractFeatures(content), userPreferences) > 0.7) {
      reasons.push('Similar to content you\'ve enjoyed');
    }

    // Tag matching
    const matchingTags = content.tags.filter(tag => 
      userPreferences.tags && userPreferences.tags.includes(tag)
    );
    if (matchingTags.length > 0) {
      reasons.push(`Matches your interests: ${matchingTags.join(', ')}`);
    }

    // Popularity
    if (this.calculatePopularityScore(content) > 0.8) {
      reasons.push('Popular among other users');
    }

    // Recency
    if (this.calculateRecencyScore(content.createdAt) > 0.9) {
      reasons.push('Recently added');
    }

    return reasons;
  }

  /**
   * Update recommendations when content is updated
   */
  async handleContentUpdate(contentId, workspaceId) {
    const users = await User.find({
      'workspaces.workspace': workspaceId
    }).select('_id');

    // Invalidate cache for affected users
    await Promise.all(
      users.map(user =>
        cache.delete(`recommendations:${user._id}:${workspaceId}`)
      )
    );
  }
}

module.exports = new RecommendationService();
