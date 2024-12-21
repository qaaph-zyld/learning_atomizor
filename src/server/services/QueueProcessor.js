const Queue = require('../models/Queue');
const Content = require('../models/Content');
const { processContent } = require('./nlp');
const EventEmitter = require('events');

class QueueProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.isProcessing = false;
    this.batchSize = options.batchSize || 10;
    this.maxConcurrent = options.maxConcurrent || 3;
    this.pollInterval = options.pollInterval || 5000;
    this.activeJobs = new Map();
    this.metrics = {
      processed: 0,
      failed: 0,
      totalProcessingTime: 0
    };
  }

  async start() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.pollInterval = setInterval(() => this.processBatch(), this.pollInterval);
    
    console.log('Queue processor started');
    this.emit('started');
  }

  async stop() {
    this.isProcessing = false;
    clearInterval(this.pollInterval);
    
    // Wait for active jobs to complete
    const activeJobIds = Array.from(this.activeJobs.keys());
    if (activeJobIds.length > 0) {
      console.log(`Waiting for ${activeJobIds.length} active jobs to complete...`);
      await Promise.all(Array.from(this.activeJobs.values()));
    }
    
    console.log('Queue processor stopped');
    this.emit('stopped');
  }

  async processBatch() {
    if (this.activeJobs.size >= this.maxConcurrent) {
      return;
    }

    try {
      const items = await Queue.getNextBatch(this.batchSize);
      
      if (items.length === 0) {
        return;
      }

      console.log(`Processing batch of ${items.length} items`);
      
      for (const item of items) {
        if (this.activeJobs.size >= this.maxConcurrent) {
          break;
        }
        
        this.processItem(item);
      }
    } catch (error) {
      console.error('Error processing batch:', error);
      this.emit('error', error);
    }
  }

  async processItem(queueItem) {
    const startTime = Date.now();
    const jobPromise = (async () => {
      try {
        // Mark as processing
        queueItem.status = 'processing';
        queueItem.startTime = new Date();
        await queueItem.save();

        // Get content
        const content = await Content.findById(queueItem.contentId);
        if (!content) {
          throw new Error('Content not found');
        }

        // Process content
        const result = await processContent(content.filePath, {
          onProgress: (progress) => {
            this.emit('progress', {
              queueItemId: queueItem._id,
              contentId: content._id,
              progress
            });
          }
        });

        // Update content with processed data
        content.atomizedContent = result.atomizedContent;
        content.summary = result.summary;
        content.keywords = result.keywords;
        content.processingMetrics = {
          processingTime: Date.now() - startTime,
          accuracyScore: result.accuracyScore
        };
        content.status = 'completed';
        await content.save();

        // Mark queue item as completed
        await queueItem.markAsCompleted(Date.now() - startTime);

        // Update metrics
        this.metrics.processed++;
        this.metrics.totalProcessingTime += Date.now() - startTime;

        this.emit('itemCompleted', {
          queueItemId: queueItem._id,
          contentId: content._id,
          processingTime: Date.now() - startTime
        });
      } catch (error) {
        console.error(`Error processing queue item ${queueItem._id}:`, error);
        
        await queueItem.markAsFailed(error);
        
        this.metrics.failed++;
        
        this.emit('itemFailed', {
          queueItemId: queueItem._id,
          error: error.message
        });
      } finally {
        this.activeJobs.delete(queueItem._id);
      }
    })();

    this.activeJobs.set(queueItem._id, jobPromise);
    this.emit('itemStarted', { queueItemId: queueItem._id });
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeJobs: this.activeJobs.size,
      averageProcessingTime: this.metrics.processed > 0
        ? this.metrics.totalProcessingTime / this.metrics.processed
        : 0
    };
  }

  async clearFailedJobs() {
    const result = await Queue.deleteMany({
      status: 'failed',
      attempts: { $gte: 3 }
    });
    
    console.log(`Cleared ${result.deletedCount} failed jobs`);
    return result.deletedCount;
  }

  async retryFailedJobs() {
    const failedJobs = await Queue.find({
      status: 'failed',
      attempts: { $lt: 3 }
    });

    for (const job of failedJobs) {
      job.status = 'pending';
      job.nextRetryTime = new Date();
      await job.save();
    }

    console.log(`Reset ${failedJobs.length} failed jobs for retry`);
    return failedJobs.length;
  }
}

module.exports = new QueueProcessor();
module.exports.QueueProcessor = QueueProcessor; // Export class for testing
