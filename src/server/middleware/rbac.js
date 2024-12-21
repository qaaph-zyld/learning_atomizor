const Role = require('../models/Role');
const Workspace = require('../models/Workspace');
const AuditLog = require('../models/AuditLog');

// Cache roles for 5 minutes
const roleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getRoleFromCache(roleId) {
  const cached = roleCache.get(roleId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.role;
  }
  
  const role = await Role.findById(roleId);
  if (role) {
    roleCache.set(roleId.toString(), {
      role,
      timestamp: Date.now()
    });
  }
  
  return role;
}

function clearRoleCache(roleId) {
  if (roleId) {
    roleCache.delete(roleId.toString());
  } else {
    roleCache.clear();
  }
}

// RBAC middleware factory
function rbac(resource, action) {
  return async (req, res, next) => {
    try {
      // Skip for system admin
      if (req.user.isSystemAdmin) {
        return next();
      }

      let workspaceId;
      
      // Determine workspace context
      if (req.params.workspaceId) {
        workspaceId = req.params.workspaceId;
      } else if (req.body.workspaceId) {
        workspaceId = req.body.workspaceId;
      } else if (resource === 'workspace' && req.params.id) {
        workspaceId = req.params.id;
      }

      // If workspace context exists, verify membership and role
      if (workspaceId) {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
          return res.status(404).json({ error: 'Workspace not found' });
        }

        const member = workspace.members.find(m => 
          m.user.toString() === req.user._id.toString()
        );

        if (!member && workspace.owner.toString() !== req.user._id.toString()) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (member) {
          const role = await getRoleFromCache(member.role);
          if (!role || !role.hasPermission(resource, action)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }
        }
      }

      // Log the access attempt
      await AuditLog.log({
        user: req.user,
        action,
        resourceType: resource,
        resourceId: req.params.id || workspaceId,
        workspace: workspaceId,
        metadata: {
          status: 'success',
          details: {
            method: req.method,
            path: req.path
          }
        },
        req
      });

      next();
    } catch (error) {
      // Log the error
      await AuditLog.log({
        user: req.user,
        action,
        resourceType: resource,
        resourceId: req.params.id,
        workspace: req.params.workspaceId || req.body.workspaceId,
        metadata: {
          status: 'failure',
          error,
          details: {
            method: req.method,
            path: req.path
          }
        },
        req
      });

      next(error);
    }
  };
}

// Role-specific middleware factories
const requireSystemAdmin = async (req, res, next) => {
  if (!req.user.isSystemAdmin) {
    return res.status(403).json({ error: 'System administrator access required' });
  }
  next();
};

const requireWorkspaceAdmin = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const member = workspace.members.find(m => 
      m.user.toString() === req.user._id.toString()
    );

    if (workspace.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ error: 'Workspace administrator access required' });
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Utility middleware
const attachWorkspace = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    if (workspaceId) {
      const workspace = await Workspace.findById(workspaceId);
      if (workspace) {
        req.workspace = workspace;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  rbac,
  requireSystemAdmin,
  requireWorkspaceAdmin,
  attachWorkspace,
  clearRoleCache
};
