const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Content = require('../models/Content');
const logger = require('./LoggerService');
const { createError } = require('../utils/errorUtils');

class TenantService {
  /**
   * Create a new tenant
   */
  async createTenant(tenantData, createdBy) {
    try {
      const existingTenant = await Tenant.findOne({ domain: tenantData.domain });
      if (existingTenant) {
        throw createError('Tenant with this domain already exists', 409);
      }

      const tenant = new Tenant({
        ...tenantData,
        audit: {
          createdBy: createdBy,
          createdAt: new Date()
        }
      });

      await tenant.save();
      logger.info(`Created new tenant: ${tenant.name}`);
      return tenant;
    } catch (error) {
      logger.error('Error creating tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw createError('Tenant not found', 404);
      }
      return tenant;
    } catch (error) {
      logger.error('Error getting tenant:', error);
      throw error;
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId, updateData, updatedBy) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw createError('Tenant not found', 404);
      }

      // Update audit information
      updateData.audit = {
        ...tenant.audit,
        updatedAt: new Date(),
        updatedBy: updatedBy
      };

      const updatedTenant = await Tenant.findByIdAndUpdate(
        tenantId,
        updateData,
        { new: true, runValidators: true }
      );

      logger.info(`Updated tenant: ${tenant.name}`);
      return updatedTenant;
    } catch (error) {
      logger.error('Error updating tenant:', error);
      throw error;
    }
  }

  /**
   * Delete tenant and all associated data
   */
  async deleteTenant(tenantId) {
    const session = await Tenant.startSession();
    session.startTransaction();

    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw createError('Tenant not found', 404);
      }

      // Delete all associated users
      await User.deleteMany({ tenantId }, { session });

      // Delete all associated content
      await Content.deleteMany({ tenantId }, { session });

      // Delete the tenant
      await Tenant.findByIdAndDelete(tenantId, { session });

      await session.commitTransaction();
      logger.info(`Deleted tenant: ${tenant.name}`);
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error deleting tenant:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Suspend tenant
   */
  async suspendTenant(tenantId, reason) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw createError('Tenant not found', 404);
      }

      tenant.status = 'suspended';
      tenant.audit.updatedAt = new Date();
      tenant.metadata.suspensionReason = reason;

      await tenant.save();
      logger.info(`Suspended tenant: ${tenant.name}`);
      return tenant;
    } catch (error) {
      logger.error('Error suspending tenant:', error);
      throw error;
    }
  }

  /**
   * Activate tenant
   */
  async activateTenant(tenantId) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw createError('Tenant not found', 404);
      }

      tenant.status = 'active';
      tenant.audit.updatedAt = new Date();
      delete tenant.metadata.suspensionReason;

      await tenant.save();
      logger.info(`Activated tenant: ${tenant.name}`);
      return tenant;
    } catch (error) {
      logger.error('Error activating tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats(tenantId) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw createError('Tenant not found', 404);
      }

      const [userCount, contentCount] = await Promise.all([
        User.countDocuments({ tenantId }),
        Content.countDocuments({ tenantId })
      ]);

      return {
        userCount,
        contentCount,
        status: tenant.status,
        subscription: tenant.subscription,
        storage: tenant.settings.storage
      };
    } catch (error) {
      logger.error('Error getting tenant stats:', error);
      throw error;
    }
  }

  /**
   * Update tenant feature flags
   */
  async updateTenantFeatures(tenantId, features) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw createError('Tenant not found', 404);
      }

      tenant.settings.features = {
        ...tenant.settings.features,
        ...features
      };
      tenant.audit.updatedAt = new Date();

      await tenant.save();
      logger.info(`Updated features for tenant: ${tenant.name}`);
      return tenant;
    } catch (error) {
      logger.error('Error updating tenant features:', error);
      throw error;
    }
  }

  /**
   * Get all active tenants
   */
  async getActiveTenants() {
    try {
      return await Tenant.find({ status: 'active' });
    } catch (error) {
      logger.error('Error getting active tenants:', error);
      throw error;
    }
  }

  /**
   * Check if tenant has specific feature enabled
   */
  async hasFeature(tenantId, featureName) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw createError('Tenant not found', 404);
      }

      return tenant.hasFeature(featureName);
    } catch (error) {
      logger.error('Error checking tenant feature:', error);
      throw error;
    }
  }
}

module.exports = new TenantService();
