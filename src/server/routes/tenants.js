const express = require('express');
const router = express.Router();
const tenantService = require('../services/TenantService');
const auth = require('../middleware/auth');
const { isSuperAdmin, isTenantAdmin } = require('../middleware/roleCheck');
const logger = require('../services/LoggerService');
const { validateTenant } = require('../validators/tenantValidator');

/**
 * @route POST /api/tenants
 * @desc Create a new tenant
 * @access Super Admin only
 */
router.post('/', [auth, isSuperAdmin], async (req, res) => {
  try {
    const { error } = validateTenant(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const tenant = await tenantService.createTenant(req.body, req.user.id);
    res.status(201).json(tenant);
  } catch (error) {
    logger.error('Error in tenant creation:', error);
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * @route GET /api/tenants
 * @desc Get all tenants (Super Admin) or current tenant (Tenant Admin)
 * @access Super Admin or Tenant Admin
 */
router.get('/', [auth], async (req, res) => {
  try {
    if (req.user.role === 'superadmin') {
      const tenants = await tenantService.getActiveTenants();
      res.json(tenants);
    } else {
      const tenant = await tenantService.getTenantById(req.user.tenantId);
      res.json([tenant]);
    }
  } catch (error) {
    logger.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route GET /api/tenants/:id
 * @desc Get tenant by ID
 * @access Super Admin or Own Tenant Admin
 */
router.get('/:id', [auth], async (req, res) => {
  try {
    // Check if user has access to this tenant
    if (req.user.role !== 'superadmin' && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await tenantService.getTenantById(req.params.id);
    res.json(tenant);
  } catch (error) {
    logger.error('Error fetching tenant:', error);
    if (error.status === 404) {
      res.status(404).json({ error: 'Tenant not found' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * @route PUT /api/tenants/:id
 * @desc Update tenant
 * @access Super Admin or Own Tenant Admin
 */
router.put('/:id', [auth], async (req, res) => {
  try {
    // Check if user has access to this tenant
    if (req.user.role !== 'superadmin' && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error } = validateTenant(req.body, true);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const tenant = await tenantService.updateTenant(
      req.params.id,
      req.body,
      req.user.id
    );
    res.json(tenant);
  } catch (error) {
    logger.error('Error updating tenant:', error);
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * @route DELETE /api/tenants/:id
 * @desc Delete tenant
 * @access Super Admin only
 */
router.delete('/:id', [auth, isSuperAdmin], async (req, res) => {
  try {
    await tenantService.deleteTenant(req.params.id);
    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    logger.error('Error deleting tenant:', error);
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * @route POST /api/tenants/:id/suspend
 * @desc Suspend tenant
 * @access Super Admin only
 */
router.post('/:id/suspend', [auth, isSuperAdmin], async (req, res) => {
  try {
    const tenant = await tenantService.suspendTenant(
      req.params.id,
      req.body.reason
    );
    res.json(tenant);
  } catch (error) {
    logger.error('Error suspending tenant:', error);
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * @route POST /api/tenants/:id/activate
 * @desc Activate tenant
 * @access Super Admin only
 */
router.post('/:id/activate', [auth, isSuperAdmin], async (req, res) => {
  try {
    const tenant = await tenantService.activateTenant(req.params.id);
    res.json(tenant);
  } catch (error) {
    logger.error('Error activating tenant:', error);
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * @route GET /api/tenants/:id/stats
 * @desc Get tenant statistics
 * @access Super Admin or Own Tenant Admin
 */
router.get('/:id/stats', [auth], async (req, res) => {
  try {
    // Check if user has access to this tenant
    if (req.user.role !== 'superadmin' && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = await tenantService.getTenantStats(req.params.id);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching tenant stats:', error);
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * @route PUT /api/tenants/:id/features
 * @desc Update tenant features
 * @access Super Admin only
 */
router.put('/:id/features', [auth, isSuperAdmin], async (req, res) => {
  try {
    const tenant = await tenantService.updateTenantFeatures(
      req.params.id,
      req.body.features
    );
    res.json(tenant);
  } catch (error) {
    logger.error('Error updating tenant features:', error);
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

module.exports = router;
