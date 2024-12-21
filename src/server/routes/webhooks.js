const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { auth, adminOnly } = require('../middleware/auth');
const WebhookSubscription = require('../models/WebhookSubscription');
const webhookService = require('../services/WebhookService');

// Start webhook service
webhookService.start();

// List webhook subscriptions
router.get('/subscriptions', auth, async (req, res) => {
  try {
    const subscriptions = await WebhookSubscription.findByUser(req.user._id);
    res.json(subscriptions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create webhook subscription
router.post('/subscriptions', auth, async (req, res) => {
  try {
    const { name, endpoint, events, metadata } = req.body;

    // Generate secret key
    const secretKey = crypto.randomBytes(32).toString('hex');

    const subscription = new WebhookSubscription({
      name,
      endpoint,
      events,
      secretKey,
      metadata,
      createdBy: req.user._id
    });

    await subscription.save();

    res.status(201).json({
      message: 'Webhook subscription created successfully',
      subscription: {
        ...subscription.toObject(),
        secretKey // Only show secret key on creation
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update webhook subscription
router.patch('/subscriptions/:id', auth, async (req, res) => {
  try {
    const subscription = await WebhookSubscription.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const updates = req.body;
    const allowedUpdates = ['name', 'endpoint', 'events', 'isActive', 'metadata'];
    
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        subscription[key] = updates[key];
      }
    });

    await subscription.save();

    res.json({
      message: 'Webhook subscription updated successfully',
      subscription
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete webhook subscription
router.delete('/subscriptions/:id', auth, async (req, res) => {
  try {
    const result = await WebhookSubscription.deleteOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({
      message: 'Webhook subscription deleted successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rotate webhook secret
router.post('/subscriptions/:id/rotate-secret', auth, async (req, res) => {
  try {
    const subscription = await WebhookSubscription.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Generate new secret key
    subscription.secretKey = crypto.randomBytes(32).toString('hex');
    await subscription.save();

    res.json({
      message: 'Secret key rotated successfully',
      secretKey: subscription.secretKey
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Test webhook
router.post('/subscriptions/:id/test', auth, async (req, res) => {
  try {
    const subscription = await WebhookSubscription.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Send test event
    await webhookService.enqueueWebhook('test', {
      message: 'This is a test event',
      timestamp: new Date()
    }, subscription.endpoint, {
      maxRetries: 1
    });

    res.json({
      message: 'Test webhook enqueued successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin routes
router.get('/metrics', auth, adminOnly, async (req, res) => {
  try {
    const metrics = {
      totalSubscriptions: await WebhookSubscription.countDocuments(),
      activeSubscriptions: await WebhookSubscription.countDocuments({ isActive: true }),
      subscriptionsByEvent: await WebhookSubscription.aggregate([
        { $unwind: '$events' },
        {
          $group: {
            _id: '$events',
            count: { $sum: 1 }
          }
        }
      ]),
      errorRates: await WebhookSubscription.aggregate([
        {
          $group: {
            _id: null,
            totalErrors: { $sum: '$errorCount' },
            avgErrorsPerSubscription: { $avg: '$errorCount' }
          }
        }
      ])
    };

    res.json(metrics);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
