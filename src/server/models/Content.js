const mongoose = require('mongoose');

const atomizedContentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  summary: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // in seconds
    required: true,
    validate: {
      validator: (v) => v <= 180, // max 3 minutes
      message: 'Duration must not exceed 3 minutes'
    }
  },
  keywords: [{
    type: String,
    trim: true
  }],
  originalContent: {
    type: String,
    required: true
  },
  processingMetrics: {
    processingTime: Number, // in milliseconds
    accuracyScore: Number,
    memoryUsage: Number // in MB
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

// Middleware to update the updatedAt timestamp
atomizedContentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient querying
atomizedContentSchema.index({ keywords: 1 });
atomizedContentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AtomizedContent', atomizedContentSchema);
