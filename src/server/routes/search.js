const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const searchService = require('../services/SearchService');
const logger = require('../services/LoggerService');

/**
 * @route POST /api/search
 * @desc Perform advanced search
 * @access Private
 */
router.post('/', auth, async (req, res) => {
  try {
    const {
      query,
      workspace,
      filters,
      sort,
      page,
      limit,
      useML
    } = req.body;

    if (!query || !workspace) {
      return res.status(400).json({
        error: 'Query and workspace are required'
      });
    }

    const results = await searchService.search({
      query,
      workspace,
      filters,
      sort,
      page,
      limit,
      useML
    });

    res.json(results);
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ error: 'Error performing search' });
  }
});

/**
 * @route GET /api/search/suggestions
 * @desc Get search suggestions
 * @access Private
 */
router.get('/suggestions', auth, async (req, res) => {
  try {
    const { query, workspace } = req.query;

    if (!query || !workspace) {
      return res.status(400).json({
        error: 'Query and workspace are required'
      });
    }

    const suggestions = await searchService.getSuggestions(
      query,
      workspace
    );

    res.json(suggestions);
  } catch (error) {
    logger.error('Error getting suggestions:', error);
    res.status(500).json({ error: 'Error getting suggestions' });
  }
});

/**
 * @route GET /api/search/analytics
 * @desc Get search analytics
 * @access Private
 */
router.get('/analytics', auth, async (req, res) => {
  try {
    const { workspace, timeframe } = req.query;

    if (!workspace) {
      return res.status(400).json({
        error: 'Workspace is required'
      });
    }

    const analytics = await searchService.getSearchAnalytics(
      workspace,
      timeframe
    );

    res.json(analytics);
  } catch (error) {
    logger.error('Error getting search analytics:', error);
    res.status(500).json({ error: 'Error getting search analytics' });
  }
});

/**
 * @route POST /api/search/reindex
 * @desc Reindex all content
 * @access Private
 */
router.post('/reindex', auth, async (req, res) => {
  try {
    const { workspace } = req.body;

    if (!workspace) {
      return res.status(400).json({
        error: 'Workspace is required'
      });
    }

    // Check if user has admin rights
    if (!req.user.roles.includes('admin')) {
      return res.status(403).json({
        error: 'Not authorized to perform this action'
      });
    }

    await searchService.indexExistingContent();

    res.json({ message: 'Reindexing completed successfully' });
  } catch (error) {
    logger.error('Error reindexing content:', error);
    res.status(500).json({ error: 'Error reindexing content' });
  }
});

/**
 * @route GET /api/search/health
 * @desc Check search service health
 * @access Private
 */
router.get('/health', auth, async (req, res) => {
  try {
    // Check if user has admin rights
    if (!req.user.roles.includes('admin')) {
      return res.status(403).json({
        error: 'Not authorized to perform this action'
      });
    }

    const health = await searchService.client.cluster.health();
    res.json(health);
  } catch (error) {
    logger.error('Error checking search health:', error);
    res.status(500).json({ error: 'Error checking search health' });
  }
});

module.exports = router;
