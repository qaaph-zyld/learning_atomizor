const express = require('express');
const router = express.Router();
const AtomizedContent = require('../models/Content');
const NLPService = require('../services/nlpService');

// Create new atomized content
router.post('/atomize', async (req, res) => {
  try {
    const startTime = process.hrtime();
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Process content using NLP service
    const nlpResult = await NLPService.processContent(content);
    
    const atomizedContent = new AtomizedContent({
      title: nlpResult.title,
      summary: nlpResult.summary,
      duration: nlpResult.duration,
      keywords: nlpResult.keywords,
      originalContent: content,
      processingMetrics: {
        processingTime: 0, // Will be updated below
        accuracyScore: nlpResult.metrics.accuracy_score,
        memoryUsage: nlpResult.metrics.memory_usage
      }
    });

    await atomizedContent.save();
    
    const endTime = process.hrtime(startTime);
    const processingTime = (endTime[0] * 1000 + endTime[1] / 1e6); // Convert to milliseconds

    // Update processing time
    atomizedContent.processingMetrics.processingTime = processingTime;
    await atomizedContent.save();

    res.status(201).json({
      message: 'Content atomized successfully',
      id: atomizedContent._id,
      processingTime,
      metrics: atomizedContent.processingMetrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get atomized content by ID
router.get('/:id', async (req, res) => {
  try {
    const content = await AtomizedContent.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all atomized content with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const contents = await AtomizedContent
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AtomizedContent.countDocuments();

    res.json({
      contents,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
