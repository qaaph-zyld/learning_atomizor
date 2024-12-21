const axios = require('axios');
const crypto = require('crypto');
const Queue = require('../models/Queue');
const Content = require('../models/Content');

class WebhookService {
  constructor() {
    this.webhookQueue = [];
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    this.processingInterval = null;
    this.webhookSecret = process.env.WEBHOOK_SECRET;
  }

  start() {
    if (!this.processingInterval) {
      this.processingInterval = setInterval(() => this.processQueue(), 1000);
      console.log('Webhook service started');
    }
  }

  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Webhook service stopped');
    }
  }

  async enqueueWebhook(event, data, endpoint, options = {}) {
    const webhook = {
      id: crypto.randomUUID(),
      event,
      data,
      endpoint,
      attempts: 0,
      maxRetries: options.maxRetries || this.maxRetries,
      timestamp: new Date(),
      signature: this.generateSignature(data),
      retryDelay: options.retryDelay || this.retryDelay
    };

    this.webhookQueue.push(webhook);
    console.log(`Enqueued webhook ${webhook.id} for event ${event}`);
  }

  async processQueue() {
    if (this.webhookQueue.length === 0) return;

    const webhook = this.webhookQueue[0];
    
    try {
      await this.deliverWebhook(webhook);
      this.webhookQueue.shift(); // Remove successfully delivered webhook
    } catch (error) {
      console.error(`Failed to deliver webhook ${webhook.id}:`, error);
      
      webhook.attempts++;
      webhook.lastError = error.message;

      if (webhook.attempts >= webhook.maxRetries) {
        console.log(`Webhook ${webhook.id} failed after ${webhook.attempts} attempts`);
        this.webhookQueue.shift();
        await this.logFailedWebhook(webhook);
      } else {
        // Move to end of queue with exponential backoff
        this.webhookQueue.shift();
        webhook.nextAttempt = Date.now() + (webhook.retryDelay * Math.pow(2, webhook.attempts));
        this.webhookQueue.push(webhook);
      }
    }
  }

  async deliverWebhook(webhook) {
    const payload = {
      id: webhook.id,
      event: webhook.event,
      data: webhook.data,
      timestamp: webhook.timestamp,
      signature: webhook.signature,
      attempt: webhook.attempts + 1
    };

    const response = await axios.post(webhook.endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': webhook.signature,
        'X-Webhook-ID': webhook.id,
        'X-Webhook-Timestamp': webhook.timestamp.toISOString()
      },
      timeout: 10000 // 10 seconds
    });

    if (response.status !== 200) {
      throw new Error(`Webhook delivery failed with status ${response.status}`);
    }

    return response;
  }

  generateSignature(data) {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(data))
      .digest('hex');
  }

  async logFailedWebhook(webhook) {
    // Implementation for logging failed webhooks to database
    console.error('Failed webhook:', webhook);
  }

  // Event handlers
  async handleContentCreated(content) {
    const subscribers = await this.getSubscribers('content.created');
    
    for (const subscriber of subscribers) {
      await this.enqueueWebhook('content.created', {
        contentId: content._id,
        title: content.title,
        status: content.status,
        createdAt: content.createdAt
      }, subscriber.endpoint);
    }
  }

  async handleContentProcessed(content) {
    const subscribers = await this.getSubscribers('content.processed');
    
    for (const subscriber of subscribers) {
      await this.enqueueWebhook('content.processed', {
        contentId: content._id,
        title: content.title,
        status: content.status,
        processingMetrics: content.processingMetrics,
        completedAt: new Date()
      }, subscriber.endpoint);
    }
  }

  async handleContentError(content, error) {
    const subscribers = await this.getSubscribers('content.error');
    
    for (const subscriber of subscribers) {
      await this.enqueueWebhook('content.error', {
        contentId: content._id,
        title: content.title,
        error: error.message,
        timestamp: new Date()
      }, subscriber.endpoint);
    }
  }

  async handleBatchCompleted(batchId, results) {
    const subscribers = await this.getSubscribers('batch.completed');
    
    for (const subscriber of subscribers) {
      await this.enqueueWebhook('batch.completed', {
        batchId,
        totalProcessed: results.totalProcessed,
        successCount: results.successCount,
        failureCount: results.failureCount,
        processingTime: results.processingTime,
        completedAt: new Date()
      }, subscriber.endpoint);
    }
  }

  // Utility methods
  async getSubscribers(event) {
    // Implementation for retrieving webhook subscribers from database
    // This would typically query a WebhookSubscription model
    return []; // Placeholder
  }

  verifySignature(signature, data) {
    const expectedSignature = this.generateSignature(data);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

module.exports = new WebhookService();
