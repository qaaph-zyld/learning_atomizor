const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema({
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  role: {
    type: String,
    enum: ['admin', 'editor', 'viewer'],
    default: 'viewer'
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  metadata: {
    message: String,
    customData: Map
  },
  acceptedAt: Date,
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
invitationSchema.index({ workspace: 1, email: 1 });
invitationSchema.index({ token: 1 });
invitationSchema.index({ status: 1 });
invitationSchema.index({ expiresAt: 1 });

// Update timestamps
invitationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Generate invitation token
invitationSchema.pre('validate', function(next) {
  if (!this.token) {
    this.token = crypto.randomBytes(32).toString('hex');
  }
  if (!this.expiresAt) {
    // Default expiration: 7 days
    this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  next();
});

// Instance methods
invitationSchema.methods.accept = async function(user) {
  if (this.status !== 'pending') {
    throw new Error('Invitation is no longer pending');
  }
  
  if (this.expiresAt < new Date()) {
    throw new Error('Invitation has expired');
  }
  
  const Workspace = mongoose.model('Workspace');
  const workspace = await Workspace.findById(this.workspace);
  
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  await workspace.addMember(user._id, this.role, this.invitedBy);
  
  this.status = 'accepted';
  this.acceptedAt = new Date();
  this.acceptedBy = user._id;
  
  await this.save();
  
  return workspace;
};

invitationSchema.methods.decline = async function() {
  if (this.status !== 'pending') {
    throw new Error('Invitation is no longer pending');
  }
  
  this.status = 'declined';
  await this.save();
};

// Static methods
invitationSchema.statics.findPendingByEmail = function(email) {
  return this.find({
    email,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  }).populate('workspace');
};

invitationSchema.statics.findByToken = function(token) {
  return this.findOne({
    token,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  }).populate('workspace invitedBy');
};

// Clean up expired invitations
invitationSchema.statics.cleanupExpired = async function() {
  return this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

module.exports = mongoose.model('Invitation', invitationSchema);
