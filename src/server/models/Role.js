const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  permissions: [{
    resource: {
      type: String,
      required: true,
      enum: [
        'workspace',
        'content',
        'analytics',
        'users',
        'settings',
        'webhooks',
        'exports'
      ]
    },
    actions: [{
      type: String,
      required: true,
      enum: ['create', 'read', 'update', 'delete', 'manage']
    }]
  }],
  scope: {
    type: String,
    enum: ['system', 'workspace'],
    default: 'workspace'
  },
  metadata: {
    isCustom: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace'
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
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
roleSchema.index({ name: 1 });
roleSchema.index({ scope: 1 });
roleSchema.index({ 'metadata.workspace': 1 });

// Update timestamps
roleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
roleSchema.methods.hasPermission = function(resource, action) {
  return this.permissions.some(permission => 
    permission.resource === resource && 
    (permission.actions.includes(action) || permission.actions.includes('manage'))
  );
};

roleSchema.methods.addPermission = async function(resource, actions) {
  const permission = this.permissions.find(p => p.resource === resource);
  
  if (permission) {
    permission.actions = [...new Set([...permission.actions, ...actions])];
  } else {
    this.permissions.push({ resource, actions });
  }
  
  await this.save();
};

roleSchema.methods.removePermission = async function(resource, actions) {
  const permission = this.permissions.find(p => p.resource === resource);
  
  if (permission) {
    if (actions) {
      permission.actions = permission.actions.filter(a => !actions.includes(a));
      if (permission.actions.length === 0) {
        this.permissions = this.permissions.filter(p => p.resource !== resource);
      }
    } else {
      this.permissions = this.permissions.filter(p => p.resource !== resource);
    }
    await this.save();
  }
};

// Static methods
roleSchema.statics.findByScope = function(scope) {
  return this.find({ scope, status: 'active' });
};

roleSchema.statics.findByWorkspace = function(workspaceId) {
  return this.find({
    'metadata.workspace': workspaceId,
    status: 'active'
  });
};

// Create default roles
roleSchema.statics.createDefaultRoles = async function() {
  const defaults = [
    {
      name: 'System Administrator',
      description: 'Full system access',
      scope: 'system',
      permissions: [
        {
          resource: 'workspace',
          actions: ['create', 'read', 'update', 'delete', 'manage']
        },
        {
          resource: 'content',
          actions: ['create', 'read', 'update', 'delete', 'manage']
        },
        {
          resource: 'analytics',
          actions: ['read', 'manage']
        },
        {
          resource: 'users',
          actions: ['create', 'read', 'update', 'delete', 'manage']
        },
        {
          resource: 'settings',
          actions: ['read', 'update', 'manage']
        },
        {
          resource: 'webhooks',
          actions: ['create', 'read', 'update', 'delete', 'manage']
        },
        {
          resource: 'exports',
          actions: ['create', 'read', 'delete', 'manage']
        }
      ]
    },
    {
      name: 'Workspace Administrator',
      description: 'Full workspace access',
      scope: 'workspace',
      permissions: [
        {
          resource: 'workspace',
          actions: ['read', 'update', 'manage']
        },
        {
          resource: 'content',
          actions: ['create', 'read', 'update', 'delete', 'manage']
        },
        {
          resource: 'analytics',
          actions: ['read']
        },
        {
          resource: 'users',
          actions: ['read', 'update']
        },
        {
          resource: 'settings',
          actions: ['read', 'update']
        },
        {
          resource: 'webhooks',
          actions: ['create', 'read', 'update', 'delete']
        },
        {
          resource: 'exports',
          actions: ['create', 'read', 'delete']
        }
      ]
    },
    {
      name: 'Content Manager',
      description: 'Manage workspace content',
      scope: 'workspace',
      permissions: [
        {
          resource: 'workspace',
          actions: ['read']
        },
        {
          resource: 'content',
          actions: ['create', 'read', 'update', 'delete']
        },
        {
          resource: 'analytics',
          actions: ['read']
        },
        {
          resource: 'exports',
          actions: ['create', 'read']
        }
      ]
    },
    {
      name: 'Content Viewer',
      description: 'View workspace content',
      scope: 'workspace',
      permissions: [
        {
          resource: 'workspace',
          actions: ['read']
        },
        {
          resource: 'content',
          actions: ['read']
        },
        {
          resource: 'analytics',
          actions: ['read']
        },
        {
          resource: 'exports',
          actions: ['read']
        }
      ]
    }
  ];

  for (const role of defaults) {
    await this.findOneAndUpdate(
      { name: role.name },
      role,
      { upsert: true, new: true }
    );
  }
};

module.exports = mongoose.model('Role', roleSchema);
