const mongoose = require('mongoose');

const queueItemSchema = new mongoose.Schema({
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Content',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  error: {
    message: String,
    stack: String,
    timestamp: Date
  },
  processingTime: {
    type: Number,
    default: 0
  },
  startTime: Date,
  completedTime: Date,
  nextRetryTime: Date,
  metadata: {
    fileSize: Number,
    fileType: String,
    estimatedDuration: Number,
    batchId: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Indexes for efficient querying
queueItemSchema.index({ status: 1, priority: -1, nextRetryTime: 1 });
queueItemSchema.index({ batchId: 1 });
queueItemSchema.index({ createdBy: 1 });

// Update timestamps
queueItemSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
queueItemSchema.methods.markAsFailed = async function(error) {
  this.status = 'failed';
  this.attempts += 1;
  this.error = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date()
  };

  if (this.attempts < this.maxAttempts) {
    // Exponential backoff for retries
    const backoffTime = Math.pow(2, this.attempts) * 1000; // in milliseconds
    this.nextRetryTime = new Date(Date.now() + backoffTime);
    this.status = 'pending';
  }

  await this.save();
};

queueItemSchema.methods.markAsCompleted = async function(processingTime) {
  this.status = 'completed';
  this.completedTime = new Date();
  this.processingTime = processingTime;
  await this.save();
};

// Static methods
queueItemSchema.statics.getNextBatch = async function(batchSize = 10) {
  const now = new Date();
  
  return this.find({
    $or: [
      { status: 'pending', nextRetryTime: { $exists: false } },
      { status: 'pending', nextRetryTime: { $lte: now } }
    ]
  })
  .sort({ priority: -1, createdAt: 1 })
  .limit(batchSize)
  .populate('contentId')
  .exec();
};

queueItemSchema.statics.createBatch = async function(contentIds, userId, priority = 1) {
  const batchId = mongoose.Types.ObjectId().toString();
  
  const queueItems = contentIds.map(contentId => ({
    contentId,
    createdBy: userId,
    priority,
    metadata: {
      batchId
    }
  }));

  return this.insertMany(queueItems);
};

module.exports = mongoose.model('Queue', queueItemSchema);
