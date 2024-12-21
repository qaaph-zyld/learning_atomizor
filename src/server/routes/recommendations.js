const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const recommendationService = require('../services/RecommendationService');
const logger = require('../services/LoggerService');

/**
 * @route GET /api/recommendations
 * @desc Get personalized content recommendations
 * @access Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    const { limit, includeReasons } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace ID is required' 
      });
    }

    const recommendations = await recommendationService.getRecommendations(
      req.user.id,
      workspaceId,
      { 
        limit: parseInt(limit) || 10,
        includeReasons: includeReasons === 'true'
      }
    );

    res.json(recommendations);
  } catch (error) {
    logger.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Error getting recommendations' });
  }
});

/**
 * @route GET /api/recommendations/similar/:contentId
 * @desc Get similar content items
 * @access Private
 */
router.get('/similar/:contentId', auth, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { workspaceId } = req.query;
    const { limit } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace ID is required' 
      });
    }

    const similar = await recommendationService.findSimilarContent(
      contentId,
      workspaceId,
      { limit: parseInt(limit) || 5 }
    );

    res.json(similar);
  } catch (error) {
    logger.error('Error getting similar content:', error);
    res.status(500).json({ error: 'Error getting similar content' });
  }
});

/**
 * @route GET /api/recommendations/trending
 * @desc Get trending content in workspace
 * @access Private
 */
router.get('/trending', auth, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    const { timeframe, limit } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace ID is required' 
      });
    }

    const trending = await recommendationService.getTrendingContent(
      workspaceId,
      {
        timeframe: timeframe || '7d',
        limit: parseInt(limit) || 10
      }
    );

    res.json(trending);
  } catch (error) {
    logger.error('Error getting trending content:', error);
    res.status(500).json({ error: 'Error getting trending content' });
  }
});

/**
 * @route GET /api/recommendations/topics
 * @desc Get recommended topics based on user interests
 * @access Private
 */
router.get('/topics', auth, async (req, res) => {
  try {
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace ID is required' 
      });
    }

    const topics = await recommendationService.getRecommendedTopics(
      req.user.id,
      workspaceId
    );

    res.json(topics);
  } catch (error) {
    logger.error('Error getting recommended topics:', error);
    res.status(500).json({ error: 'Error getting recommended topics' });
  }
});

/**
 * @route POST /api/recommendations/feedback
 * @desc Submit feedback on recommendations
 * @access Private
 */
router.post('/feedback', auth, async (req, res) => {
  try {
    const { contentId, workspaceId, feedback } = req.body;

    if (!contentId || !workspaceId || !feedback) {
      return res.status(400).json({ 
        error: 'Content ID, workspace ID, and feedback are required' 
      });
    }

    await recommendationService.handleRecommendationFeedback(
      req.user.id,
      contentId,
      workspaceId,
      feedback
    );

    res.json({ message: 'Feedback recorded successfully' });
  } catch (error) {
    logger.error('Error recording recommendation feedback:', error);
    res.status(500).json({ error: 'Error recording feedback' });
  }
});

module.exports = router;
