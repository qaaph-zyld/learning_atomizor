const express = require('express');
const router = express.Router();
const Queue = require('../models/Queue');
const queueProcessor = require('../services/QueueProcessor');
const { auth, adminOnly } = require('../middleware/auth');

// NOTE: Queue processor auto-start disabled for Micro-MVP
// Start manually via POST /api/queue/maintenance { action: 'startProcessor' }
// queueProcessor.start();

// Add items to queue
router.post('/batch', auth, async (req, res) => {
  try {
    const { contentIds, priority } = req.body;
    
    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return res.status(400).json({ error: 'contentIds must be a non-empty array' });
    }

    const queueItems = await Queue.createBatch(contentIds, req.user._id, priority);
    
    res.status(201).json({
      message: `Added ${queueItems.length} items to queue`,
      queueItems
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get queue status
router.get('/status', auth, async (req, res) => {
  try {
    const { batchId, status } = req.query;
    const query = { createdBy: req.user._id };
    
    if (batchId) {
      query['metadata.batchId'] = batchId;
    }
    
    if (status) {
      query.status = status;
    }

    const items = await Queue.find(query)
      .populate('contentId', 'title status processingMetrics')
      .sort('-createdAt')
      .exec();

    const metrics = queueProcessor.getMetrics();
    
    res.json({
      metrics,
      items
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get specific queue item status
router.get('/status/:itemId', auth, async (req, res) => {
  try {
    const queueItem = await Queue.findById(req.params.itemId)
      .populate('contentId', 'title status processingMetrics')
      .exec();
    
    if (!queueItem) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    if (queueItem.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(queueItem);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Cancel queued items
router.delete('/batch', auth, async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds must be a non-empty array' });
    }

    const result = await Queue.deleteMany({
      _id: { $in: itemIds },
      createdBy: req.user._id,
      status: 'pending'
    });

    res.json({
      message: `Cancelled ${result.deletedCount} queue items`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin routes
router.get('/metrics', auth, adminOnly, async (req, res) => {
  try {
    const metrics = queueProcessor.getMetrics();
    
    const queueStats = await Queue.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgProcessingTime: { $avg: '$processingTime' }
        }
      }
    ]);

    res.json({
      processorMetrics: metrics,
      queueStats
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/maintenance', auth, adminOnly, async (req, res) => {
  try {
    const { action } = req.body;
    let result;

    switch (action) {
      case 'clearFailed':
        result = await queueProcessor.clearFailedJobs();
        break;
      case 'retryFailed':
        result = await queueProcessor.retryFailedJobs();
        break;
      case 'stopProcessor':
        await queueProcessor.stop();
        result = 'Processor stopped';
        break;
      case 'startProcessor':
        await queueProcessor.start();
        result = 'Processor started';
        break;
      default:
        return res.status(400).json({ error: 'Invalid maintenance action' });
    }

    res.json({
      message: 'Maintenance action completed',
      result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
