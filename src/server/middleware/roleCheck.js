const { createError } = require('../utils/errorUtils');
const logger = require('../services/LoggerService');

/**
 * Middleware to check if user is a super admin
 */
const isSuperAdmin = (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') {
      throw createError('Access denied. Super admin privileges required.', 403);
    }
    next();
  } catch (error) {
    logger.error('Super admin check failed:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
};

/**
 * Middleware to check if user is a tenant admin
 */
const isTenantAdmin = (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      throw createError('Access denied. Admin privileges required.', 403);
    }
    next();
  } catch (error) {
    logger.error('Tenant admin check failed:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
};

/**
 * Middleware to check if user belongs to specific tenant
 */
const isTenantMember = (tenantId) => {
  return (req, res, next) => {
    try {
      if (req.user.role === 'superadmin') {
        return next();
      }

      if (req.user.tenantId !== tenantId) {
        throw createError('Access denied. Invalid tenant.', 403);
      }
      next();
    } catch (error) {
      logger.error('Tenant member check failed:', error);
      res.status(error.status || 500).json({ error: error.message });
    }
  };
};

/**
 * Middleware to check if user has specific role
 */
const hasRole = (roles) => {
  return (req, res, next) => {
    try {
      const userRoles = Array.isArray(roles) ? roles : [roles];
      if (!userRoles.includes(req.user.role)) {
        throw createError('Access denied. Insufficient privileges.', 403);
      }
      next();
    } catch (error) {
      logger.error('Role check failed:', error);
      res.status(error.status || 500).json({ error: error.message });
    }
  };
};

/**
 * Middleware to check if user has specific permission
 */
const hasPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const userPermissions = req.user.permissions || [];
      if (!userPermissions.includes(permission) && req.user.role !== 'superadmin') {
        throw createError('Access denied. Required permission not found.', 403);
      }
      next();
    } catch (error) {
      logger.error('Permission check failed:', error);
      res.status(error.status || 500).json({ error: error.message });
    }
  };
};

module.exports = {
  isSuperAdmin,
  isTenantAdmin,
  isTenantMember,
  hasRole,
  hasPermission
};
