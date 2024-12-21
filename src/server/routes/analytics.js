const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const AnalyticsService = require('../services/AnalyticsService');
const ReportingService = require('../services/ReportingService');
const AtomizedContent = require('../models/Content');
const fs = require('fs');

// Get workspace analytics
router.get('/workspace/:workspaceId', [
  auth,
  rbac('workspace', 'read')
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const analytics = await AnalyticsService.getWorkspaceAnalytics(
      req.params.workspaceId,
      { startDate, endDate }
    );
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get content metrics
router.get('/workspace/:workspaceId/content', [
  auth,
  rbac('workspace', 'read')
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const metrics = await AnalyticsService.getContentMetrics(
      req.params.workspaceId,
      startDate && endDate ? { $gte: new Date(startDate), $lte: new Date(endDate) } : {}
    );
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get processing metrics
router.get('/workspace/:workspaceId/processing', [
  auth,
  rbac('workspace', 'read')
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const metrics = await AnalyticsService.getProcessingMetrics(
      req.params.workspaceId,
      startDate && endDate ? { $gte: new Date(startDate), $lte: new Date(endDate) } : {}
    );
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user activity
router.get('/workspace/:workspaceId/users', [
  auth,
  rbac('workspace', 'read')
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const activity = await AnalyticsService.getUserActivity(
      req.params.workspaceId,
      startDate && endDate ? { $gte: new Date(startDate), $lte: new Date(endDate) } : {}
    );
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get queue metrics
router.get('/workspace/:workspaceId/queue', [
  auth,
  rbac('workspace', 'read')
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const metrics = await AnalyticsService.getQueueMetrics(
      req.params.workspaceId,
      startDate && endDate ? { $gte: new Date(startDate), $lte: new Date(endDate) } : {}
    );
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate report
router.post('/workspace/:workspaceId/report', [
  auth,
  rbac('workspace', 'read')
], async (req, res) => {
  try {
    const {
      format = 'pdf',
      startDate,
      endDate,
      sections
    } = req.body;

    const report = await ReportingService.generateReport(
      req.params.workspaceId,
      { format, startDate, endDate, sections }
    );

    const reportFile = await fs.readFile(report.path);
    
    res.setHeader('Content-Type', getContentType(format));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=report-${report.timestamp}.${format}`
    );
    
    res.send(reportFile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy routes for backward compatibility
router.get('/metrics', auth, async (req, res) => {
  try {
    const totalContents = await AtomizedContent.countDocuments();
    
    const aggregateMetrics = await AtomizedContent.aggregate([
      {
        $group: {
          _id: null,
          averageProcessingTime: { $avg: '$processingMetrics.processingTime' },
          averageAccuracy: { $avg: '$processingMetrics.accuracyScore' },
          averageMemoryUsage: { $avg: '$processingMetrics.memoryUsage' }
        }
      }
    ]);

    const metrics = aggregateMetrics[0] || {
      averageProcessingTime: 0,
      averageAccuracy: 0,
      averageMemoryUsage: 0
    };

    res.json({
      totalContents,
      ...metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/trends', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const trends = await AtomizedContent.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          averageProcessingTime: { $avg: '$processingMetrics.processingTime' },
          averageMemoryUsage: { $avg: '$processingMetrics.memoryUsage' },
          averageAccuracy: { $avg: '$processingMetrics.accuracyScore' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.json(trends);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/detailed', auth, async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const query = {};
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const skip = (page - 1) * limit;
    
    const [metrics, total] = await Promise.all([
      AtomizedContent.find(query)
        .select('createdAt processingMetrics')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AtomizedContent.countDocuments(query)
    ]);

    res.json({
      metrics,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/distribution', auth, async (req, res) => {
  try {
    const distribution = await AtomizedContent.aggregate([
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lt: ['$duration', 60] }, then: '< 1 min' },
                { case: { $lt: ['$duration', 120] }, then: '1-2 min' },
                { case: { $lt: ['$duration', 180] }, then: '2-3 min' }
              ],
              default: '> 3 min'
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json(distribution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getContentType(format) {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

module.exports = router;
