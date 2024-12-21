const mongoose = require('mongoose');
const Content = require('../models/Content');
const Workspace = require('../models/Workspace');
const AuditLog = require('../models/AuditLog');
const Queue = require('../models/Queue');

class AnalyticsService {
  async getWorkspaceAnalytics(workspaceId, options = {}) {
    const { startDate, endDate } = options;
    const dateFilter = {};
    
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const [
      contentMetrics,
      processingMetrics,
      userActivity,
      queueMetrics
    ] = await Promise.all([
      this.getContentMetrics(workspaceId, dateFilter),
      this.getProcessingMetrics(workspaceId, dateFilter),
      this.getUserActivity(workspaceId, dateFilter),
      this.getQueueMetrics(workspaceId, dateFilter)
    ]);

    return {
      contentMetrics,
      processingMetrics,
      userActivity,
      queueMetrics,
      timestamp: new Date()
    };
  }

  async getContentMetrics(workspaceId, dateFilter = {}) {
    const matchStage = {
      workspace: mongoose.Types.ObjectId(workspaceId)
    };

    if (Object.keys(dateFilter).length > 0) {
      matchStage.createdAt = dateFilter;
    }

    const contentStats = await Content.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalContent: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          avgProcessingTime: { $avg: '$processingMetrics.processingTime' },
          avgAccuracyScore: { $avg: '$processingMetrics.accuracyScore' },
          byStatus: {
            $push: {
              k: '$status',
              v: 1
            }
          },
          byType: {
            $push: {
              k: '$contentType',
              v: 1
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalContent: 1,
          totalSize: 1,
          avgProcessingTime: 1,
          avgAccuracyScore: 1,
          statusDistribution: { $arrayToObject: '$byStatus' },
          typeDistribution: { $arrayToObject: '$byType' }
        }
      }
    ]);

    const timeSeriesData = await Content.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          totalSize: { $sum: '$fileSize' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return {
      summary: contentStats[0] || {
        totalContent: 0,
        totalSize: 0,
        avgProcessingTime: 0,
        avgAccuracyScore: 0,
        statusDistribution: {},
        typeDistribution: {}
      },
      timeSeries: timeSeriesData
    };
  }

  async getProcessingMetrics(workspaceId, dateFilter = {}) {
    const matchStage = {
      workspace: mongoose.Types.ObjectId(workspaceId),
      'processingMetrics.completedAt': { $exists: true }
    };

    if (Object.keys(dateFilter).length > 0) {
      matchStage['processingMetrics.completedAt'] = dateFilter;
    }

    const processingStats = await Content.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalProcessed: { $sum: 1 },
          avgProcessingTime: { $avg: '$processingMetrics.processingTime' },
          avgAccuracyScore: { $avg: '$processingMetrics.accuracyScore' },
          successRate: {
            $avg: {
              $cond: [
                { $eq: ['$processingMetrics.status', 'completed'] },
                1,
                0
              ]
            }
          },
          errorRates: {
            $push: {
              k: '$processingMetrics.errorType',
              v: 1
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalProcessed: 1,
          avgProcessingTime: 1,
          avgAccuracyScore: 1,
          successRate: 1,
          errorDistribution: { $arrayToObject: '$errorRates' }
        }
      }
    ]);

    const timeSeriesData = await Content.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$processingMetrics.completedAt'
            }
          },
          count: { $sum: 1 },
          avgProcessingTime: { $avg: '$processingMetrics.processingTime' },
          avgAccuracyScore: { $avg: '$processingMetrics.accuracyScore' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return {
      summary: processingStats[0] || {
        totalProcessed: 0,
        avgProcessingTime: 0,
        avgAccuracyScore: 0,
        successRate: 0,
        errorDistribution: {}
      },
      timeSeries: timeSeriesData
    };
  }

  async getUserActivity(workspaceId, dateFilter = {}) {
    const matchStage = {
      'resource.workspace': mongoose.Types.ObjectId(workspaceId)
    };

    if (Object.keys(dateFilter).length > 0) {
      matchStage.timestamp = dateFilter;
    }

    const activityStats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalActions: { $sum: 1 },
          uniqueUsers: { $addToSet: '$actor.user' },
          byAction: {
            $push: {
              k: '$action',
              v: 1
            }
          },
          byResource: {
            $push: {
              k: '$resource.type',
              v: 1
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalActions: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
          actionDistribution: { $arrayToObject: '$byAction' },
          resourceDistribution: { $arrayToObject: '$byResource' }
        }
      }
    ]);

    const userActivity = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$actor.user',
          totalActions: { $sum: 1 },
          lastActive: { $max: '$timestamp' },
          actionTypes: { $addToSet: '$action' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $project: {
          _id: 1,
          totalActions: 1,
          lastActive: 1,
          actionTypes: 1,
          user: { $arrayElemAt: ['$user', 0] }
        }
      },
      { $sort: { totalActions: -1 } }
    ]);

    return {
      summary: activityStats[0] || {
        totalActions: 0,
        uniqueUsers: 0,
        actionDistribution: {},
        resourceDistribution: {}
      },
      userActivity
    };
  }

  async getQueueMetrics(workspaceId, dateFilter = {}) {
    const matchStage = {
      workspace: mongoose.Types.ObjectId(workspaceId)
    };

    if (Object.keys(dateFilter).length > 0) {
      matchStage.createdAt = dateFilter;
    }

    const queueStats = await Queue.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          avgProcessingTime: {
            $avg: {
              $subtract: ['$completedAt', '$startedAt']
            }
          },
          byStatus: {
            $push: {
              k: '$status',
              v: 1
            }
          },
          byPriority: {
            $push: {
              k: { $toString: '$priority' },
              v: 1
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalJobs: 1,
          avgProcessingTime: 1,
          statusDistribution: { $arrayToObject: '$byStatus' },
          priorityDistribution: { $arrayToObject: '$byPriority' }
        }
      }
    ]);

    const timeSeriesData = await Queue.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          totalJobs: { $sum: 1 },
          completedJobs: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          failedJobs: {
            $sum: {
              $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return {
      summary: queueStats[0] || {
        totalJobs: 0,
        avgProcessingTime: 0,
        statusDistribution: {},
        priorityDistribution: {}
      },
      timeSeries: timeSeriesData
    };
  }

  async generateReport(workspaceId, options = {}) {
    const analytics = await this.getWorkspaceAnalytics(workspaceId, options);
    const workspace = await Workspace.findById(workspaceId);

    return {
      reportId: mongoose.Types.ObjectId(),
      workspace: {
        id: workspace._id,
        name: workspace.name,
        owner: workspace.owner
      },
      period: {
        start: options.startDate || null,
        end: options.endDate || null
      },
      metrics: analytics,
      generatedAt: new Date()
    };
  }
}

module.exports = new AnalyticsService();
