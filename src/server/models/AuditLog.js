const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    email: String,
    role: String,
    ip: String,
    userAgent: String
  },
  action: {
    type: String,
    required: true,
    enum: [
      'create',
      'read',
      'update',
      'delete',
      'login',
      'logout',
      'invite',
      'accept_invite',
      'remove_member',
      'change_role',
      'export',
      'process',
      'configure',
      'share'
    ]
  },
  resource: {
    type: {
      type: String,
      required: true,
      enum: [
        'workspace',
        'content',
        'user',
        'role',
        'invitation',
        'webhook',
        'export',
        'settings'
      ]
    },
    id: mongoose.Schema.Types.ObjectId,
    name: String,
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace'
    }
  },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  metadata: {
    status: {
      type: String,
      enum: ['success', 'failure'],
      required: true
    },
    error: {
      message: String,
      code: String,
      stack: String
    },
    details: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  }
});

// Indexes
auditLogSchema.index({ 'actor.user': 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ 'resource.type': 1 });
auditLogSchema.index({ 'resource.workspace': 1 });
auditLogSchema.index({ timestamp: 1 });
auditLogSchema.index({ 'metadata.status': 1 });

// Instance methods
auditLogSchema.methods.addError = function(error) {
  this.metadata.status = 'failure';
  this.metadata.error = {
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  };
};

// Static methods
auditLogSchema.statics.log = async function(params) {
  const {
    user,
    action,
    resourceType,
    resourceId,
    resourceName,
    workspace,
    changes,
    metadata = {},
    req
  } = params;

  const log = new this({
    actor: {
      user: user._id,
      email: user.email,
      role: user.role,
      ip: req?.ip,
      userAgent: req?.headers['user-agent']
    },
    action,
    resource: {
      type: resourceType,
      id: resourceId,
      name: resourceName,
      workspace
    },
    changes,
    metadata: {
      status: metadata.status || 'success',
      details: metadata.details
    }
  });

  if (metadata.error) {
    log.addError(metadata.error);
  }

  await log.save();
  return log;
};

auditLogSchema.statics.findByWorkspace = function(workspaceId, options = {}) {
  const query = { 'resource.workspace': workspaceId };
  
  if (options.action) {
    query.action = options.action;
  }
  if (options.resourceType) {
    query['resource.type'] = options.resourceType;
  }
  if (options.status) {
    query['metadata.status'] = options.status;
  }
  if (options.startDate) {
    query.timestamp = { $gte: options.startDate };
  }
  if (options.endDate) {
    query.timestamp = { ...query.timestamp, $lte: options.endDate };
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .populate('actor.user', 'name email')
    .limit(options.limit || 100);
};

auditLogSchema.statics.findByUser = function(userId, options = {}) {
  const query = { 'actor.user': userId };
  
  if (options.action) {
    query.action = options.action;
  }
  if (options.resourceType) {
    query['resource.type'] = options.resourceType;
  }
  if (options.startDate) {
    query.timestamp = { $gte: options.startDate };
  }
  if (options.endDate) {
    query.timestamp = { ...query.timestamp, $lte: options.endDate };
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .populate('resource.workspace', 'name')
    .limit(options.limit || 100);
};

auditLogSchema.statics.getActivitySummary = async function(workspaceId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        'resource.workspace': mongoose.Types.ObjectId(workspaceId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          action: '$action',
          status: '$metadata.status',
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$timestamp'
            }
          }
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
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
