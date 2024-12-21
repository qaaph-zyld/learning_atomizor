const mongoose = require('mongoose');

const webhookSubscriptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  endpoint: {
    type: String,
    required: true,
    validate: {
      validator: (v) => /^https?:\/\/.+/.test(v),
      message: 'Endpoint must be a valid URL'
    }
  },
  events: [{
    type: String,
    enum: [
      'content.created',
      'content.processed',
      'content.error',
      'batch.completed'
    ],
    required: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  secretKey: {
    type: String,
    required: true
  },
  lastCalled: {
    type: Date
  },
  errorCount: {
    type: Number,
    default: 0
  },
  lastError: {
    message: String,
    timestamp: Date
  },
  metadata: {
    description: String,
    tags: [String],
    customHeaders: Map
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
webhookSubscriptionSchema.index({ events: 1 });
webhookSubscriptionSchema.index({ createdBy: 1 });
webhookSubscriptionSchema.index({ isActive: 1 });

// Update timestamps
webhookSubscriptionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
webhookSubscriptionSchema.methods.incrementErrorCount = async function() {
  this.errorCount += 1;
  
  if (this.errorCount >= 10) { // Disable after 10 consecutive errors
    this.isActive = false;
  }
  
  await this.save();
};

webhookSubscriptionSchema.methods.resetErrorCount = async function() {
  this.errorCount = 0;
  this.lastError = null;
  await this.save();
};

webhookSubscriptionSchema.methods.updateLastCalled = async function(error = null) {
  this.lastCalled = new Date();
  
  if (error) {
    this.lastError = {
      message: error.message,
      timestamp: new Date()
    };
    await this.incrementErrorCount();
  } else {
    await this.resetErrorCount();
  }
};

// Static methods
webhookSubscriptionSchema.statics.findActiveSubscribers = function(event) {
  return this.find({
    events: event,
    isActive: true
  });
};

webhookSubscriptionSchema.statics.findByUser = function(userId) {
  return this.find({
    createdBy: userId
  });
};

module.exports = mongoose.model('WebhookSubscription', webhookSubscriptionSchema);
