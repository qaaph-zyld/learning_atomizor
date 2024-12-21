const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TenantSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  domain: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  settings: {
    theme: {
      primary: { type: String, default: '#4a90e2' },
      secondary: { type: String, default: '#50e3c2' },
      accent: { type: String, default: '#13ce66' }
    },
    features: {
      contentSharing: { type: Boolean, default: true },
      analytics: { type: Boolean, default: true },
      advancedSearch: { type: Boolean, default: true },
      mlRecommendations: { type: Boolean, default: true }
    },
    security: {
      mfaRequired: { type: Boolean, default: false },
      passwordPolicy: {
        minLength: { type: Number, default: 8 },
        requireNumbers: { type: Boolean, default: true },
        requireSymbols: { type: Boolean, default: true },
        requireUppercase: { type: Boolean, default: true },
        maxAge: { type: Number, default: 90 } // days
      },
      sessionTimeout: { type: Number, default: 30 } // minutes
    },
    storage: {
      maxSize: { type: Number, default: 5368709120 }, // 5GB in bytes
      allowedTypes: [{ type: String }]
    }
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'pending'
  },
  subscription: {
    plan: {
      type: String,
      enum: ['basic', 'professional', 'enterprise'],
      default: 'basic'
    },
    startDate: { type: Date },
    endDate: { type: Date },
    autoRenew: { type: Boolean, default: true }
  },
  contacts: [{
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, enum: ['admin', 'billing', 'technical'] },
    phone: String
  }],
  metadata: {
    industry: String,
    size: String,
    region: String,
    customFields: Schema.Types.Mixed
  },
  audit: {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
    lastLoginAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
TenantSchema.index({ domain: 1 });
TenantSchema.index({ status: 1 });
TenantSchema.index({ 'subscription.plan': 1 });
TenantSchema.index({ 'contacts.email': 1 });

// Virtuals
TenantSchema.virtual('isActive').get(function() {
  return this.status === 'active' && 
         (!this.subscription.endDate || this.subscription.endDate > new Date());
});

// Middleware
TenantSchema.pre('save', function(next) {
  this.audit.updatedAt = new Date();
  next();
});

// Methods
TenantSchema.methods.hasFeature = function(featureName) {
  return this.settings.features[featureName] === true;
};

TenantSchema.methods.withinStorageLimit = function(size) {
  return size <= this.settings.storage.maxSize;
};

TenantSchema.methods.isFileTypeAllowed = function(fileType) {
  return this.settings.storage.allowedTypes.includes(fileType);
};

// Statics
TenantSchema.statics.findByDomain = function(domain) {
  return this.findOne({ domain: domain.toLowerCase() });
};

TenantSchema.statics.getActiveTenants = function() {
  return this.find({ status: 'active' });
};

const Tenant = mongoose.model('Tenant', TenantSchema);

module.exports = Tenant;
