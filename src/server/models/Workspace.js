const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  settings: {
    defaultContentVisibility: {
      type: String,
      enum: ['private', 'team', 'public'],
      default: 'team'
    },
    allowExternalSharing: {
      type: Boolean,
      default: false
    },
    contentRetentionDays: {
      type: Number,
      default: 365
    },
    maxStorageGB: {
      type: Number,
      default: 10
    },
    allowedFileTypes: [{
      type: String,
      default: ['pdf', 'doc', 'docx', 'txt', 'md']
    }]
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer'],
      default: 'viewer'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  metadata: {
    industry: String,
    department: String,
    customFields: Map
  },
  statistics: {
    totalContent: {
      type: Number,
      default: 0
    },
    totalStorage: {
      type: Number,
      default: 0
    },
    activeMembers: {
      type: Number,
      default: 0
    },
    lastActivityAt: Date
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'suspended'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
workspaceSchema.index({ name: 1 });
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ 'members.user': 1 });
workspaceSchema.index({ status: 1 });
workspaceSchema.index({ tags: 1 });

// Update timestamps
workspaceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
workspaceSchema.methods.addMember = async function(userId, role, invitedBy) {
  if (!this.members.find(m => m.user.toString() === userId.toString())) {
    this.members.push({
      user: userId,
      role,
      invitedBy
    });
    await this.save();
  }
};

workspaceSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(m => m.user.toString() !== userId.toString());
  await this.save();
};

workspaceSchema.methods.updateMemberRole = async function(userId, newRole) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  if (member) {
    member.role = newRole;
    await this.save();
  }
};

workspaceSchema.methods.updateStatistics = async function() {
  const Content = mongoose.model('Content');
  
  const [contentCount, storageSize, activeMemberCount] = await Promise.all([
    Content.countDocuments({ workspace: this._id }),
    Content.aggregate([
      { $match: { workspace: this._id } },
      { $group: { _id: null, total: { $sum: '$fileSize' } } }
    ]),
    this.members.length
  ]);

  this.statistics = {
    totalContent: contentCount,
    totalStorage: storageSize[0]?.total || 0,
    activeMembers: activeMemberCount,
    lastActivityAt: new Date()
  };

  await this.save();
};

// Static methods
workspaceSchema.statics.findByUser = function(userId) {
  return this.find({
    $or: [
      { owner: userId },
      { 'members.user': userId }
    ]
  });
};

workspaceSchema.statics.findByMembership = function(userId, role) {
  const query = {
    'members.user': userId,
    status: 'active'
  };
  
  if (role) {
    query['members.role'] = role;
  }
  
  return this.find(query);
};

// Middleware to handle workspace deletion
workspaceSchema.pre('remove', async function(next) {
  try {
    // Remove all content associated with this workspace
    await mongoose.model('Content').deleteMany({ workspace: this._id });
    
    // Remove all invitations
    await mongoose.model('Invitation').deleteMany({ workspace: this._id });
    
    // Remove all webhooks
    await mongoose.model('WebhookSubscription').deleteMany({ workspace: this._id });
    
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Workspace', workspaceSchema);
