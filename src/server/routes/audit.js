const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { rbac, requireSystemAdmin } = require('../middleware/rbac');
const AuditLog = require('../models/AuditLog');

// Get workspace audit logs
router.get('/workspace/:workspaceId', [
  auth,
  rbac('workspace', 'read')
], async (req, res) => {
  try {
    const {
      action,
      resourceType,
      status,
      startDate,
      endDate,
      limit
    } = req.query;

    const logs = await AuditLog.findByWorkspace(req.params.workspaceId, {
      action,
      resourceType,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: parseInt(limit) || 100
    });

    res.json(logs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get user audit logs
router.get('/user/:userId', [
  auth,
  rbac('users', 'read')
], async (req, res) => {
  try {
    const {
      action,
      resourceType,
      startDate,
      endDate,
      limit
    } = req.query;

    // Users can only view their own logs unless they're system admin
    if (req.params.userId !== req.user._id.toString() && !req.user.isSystemAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logs = await AuditLog.findByUser(req.params.userId, {
      action,
      resourceType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: parseInt(limit) || 100
    });

    res.json(logs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get workspace activity summary
router.get('/workspace/:workspaceId/summary', [
  auth,
  rbac('workspace', 'read')
], async (req, res) => {
  try {
    const { days } = req.query;
    const summary = await AuditLog.getActivitySummary(
      req.params.workspaceId,
      parseInt(days) || 30
    );

    res.json(summary);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// System admin routes
router.get('/system', [
  auth,
  requireSystemAdmin
], async (req, res) => {
  try {
    const {
      action,
      resourceType,
      status,
      startDate,
      endDate,
      limit
    } = req.query;

    const query = {};
    
    if (action) query.action = action;
    if (resourceType) query['resource.type'] = resourceType;
    if (status) query['metadata.status'] = status;
    if (startDate) query.timestamp = { $gte: new Date(startDate) };
    if (endDate) query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .populate('actor.user', 'name email')
      .populate('resource.workspace', 'name')
      .limit(parseInt(limit) || 100);

    res.json(logs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get system activity summary
router.get('/system/summary', [
  auth,
  requireSystemAdmin
], async (req, res) => {
  try {
    const { days } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (parseInt(days) || 30));

    const summary = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            action: '$action',
            resourceType: '$resource.type',
            status: '$metadata.status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          activities: {
            $push: {
              action: '$_id.action',
              resourceType: '$_id.resourceType',
              status: '$_id.status',
              count: '$count'
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json(summary);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Export audit logs
router.post('/export', [
  auth,
  requireSystemAdmin
], async (req, res) => {
  try {
    const {
      workspaceId,
      userId,
      startDate,
      endDate,
      format = 'json'
    } = req.body;

    const query = {};
    
    if (workspaceId) {
      query['resource.workspace'] = workspaceId;
    }
    if (userId) {
      query['actor.user'] = userId;
    }
    if (startDate) {
      query.timestamp = { $gte: new Date(startDate) };
    }
    if (endDate) {
      query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };
    }

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .populate('actor.user', 'name email')
      .populate('resource.workspace', 'name');

    let result;
    if (format === 'csv') {
      const fields = [
        'timestamp',
        'actor.email',
        'actor.role',
        'action',
        'resource.type',
        'resource.name',
        'metadata.status'
      ];
      
      const json2csv = require('json2csv');
      result = json2csv.parse(logs, { fields });
      res.header('Content-Type', 'text/csv');
      res.attachment('audit_logs.csv');
    } else {
      result = logs;
      res.header('Content-Type', 'application/json');
      res.attachment('audit_logs.json');
    }

    res.send(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
