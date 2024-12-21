const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const AnalyticsService = require('./AnalyticsService');

class ReportingService {
  constructor() {
    this.reportTypes = ['pdf', 'csv', 'json'];
  }

  async generateReport(workspaceId, options = {}) {
    const {
      format = 'pdf',
      startDate,
      endDate,
      sections = ['content', 'processing', 'users', 'queue']
    } = options;

    if (!this.reportTypes.includes(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }

    const analytics = await AnalyticsService.getWorkspaceAnalytics(
      workspaceId,
      { startDate, endDate }
    );

    const reportData = this.filterReportSections(analytics, sections);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = path.join(__dirname, '../reports');
    
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `report-${timestamp}.${format}`);

    switch (format) {
      case 'pdf':
        await this.generatePDFReport(reportPath, reportData);
        break;
      case 'csv':
        await this.generateCSVReport(reportPath, reportData);
        break;
      case 'json':
        await this.generateJSONReport(reportPath, reportData);
        break;
    }

    return {
      path: reportPath,
      format,
      sections,
      timestamp: new Date()
    };
  }

  filterReportSections(analytics, sections) {
    const filtered = {};
    sections.forEach(section => {
      switch (section) {
        case 'content':
          filtered.contentMetrics = analytics.contentMetrics;
          break;
        case 'processing':
          filtered.processingMetrics = analytics.processingMetrics;
          break;
        case 'users':
          filtered.userActivity = analytics.userActivity;
          break;
        case 'queue':
          filtered.queueMetrics = analytics.queueMetrics;
          break;
      }
    });
    return filtered;
  }

  async generatePDFReport(reportPath, data) {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(reportPath);

    return new Promise((resolve, reject) => {
      doc.pipe(stream);

      // Title
      doc.fontSize(20)
        .text('Workspace Analytics Report', { align: 'center' })
        .moveDown();

      // Content Metrics
      if (data.contentMetrics) {
        doc.fontSize(16)
          .text('Content Metrics', { underline: true })
          .moveDown();

        const { summary } = data.contentMetrics;
        doc.fontSize(12)
          .text(`Total Content: ${summary.totalContent}`)
          .text(`Total Size: ${this.formatBytes(summary.totalSize)}`)
          .text(`Average Processing Time: ${this.formatDuration(summary.avgProcessingTime)}`)
          .text(`Average Accuracy Score: ${(summary.avgAccuracyScore * 100).toFixed(1)}%`)
          .moveDown();

        // Status Distribution
        doc.text('Status Distribution:')
          .moveDown(0.5);
        Object.entries(summary.statusDistribution).forEach(([status, count]) => {
          doc.text(`${status}: ${count}`);
        });
        doc.moveDown();
      }

      // Processing Metrics
      if (data.processingMetrics) {
        doc.fontSize(16)
          .text('Processing Metrics', { underline: true })
          .moveDown();

        const { summary } = data.processingMetrics;
        doc.fontSize(12)
          .text(`Total Processed: ${summary.totalProcessed}`)
          .text(`Average Processing Time: ${this.formatDuration(summary.avgProcessingTime)}`)
          .text(`Success Rate: ${(summary.successRate * 100).toFixed(1)}%`)
          .moveDown();

        // Error Distribution
        if (Object.keys(summary.errorDistribution).length > 0) {
          doc.text('Error Distribution:')
            .moveDown(0.5);
          Object.entries(summary.errorDistribution).forEach(([error, count]) => {
            doc.text(`${error}: ${count}`);
          });
        }
        doc.moveDown();
      }

      // User Activity
      if (data.userActivity) {
        doc.fontSize(16)
          .text('User Activity', { underline: true })
          .moveDown();

        const { summary, userActivity } = data.userActivity;
        doc.fontSize(12)
          .text(`Total Actions: ${summary.totalActions}`)
          .text(`Unique Users: ${summary.uniqueUsers}`)
          .moveDown();

        // Action Distribution
        doc.text('Action Distribution:')
          .moveDown(0.5);
        Object.entries(summary.actionDistribution).forEach(([action, count]) => {
          doc.text(`${action}: ${count}`);
        });
        doc.moveDown();

        // Top Users
        doc.text('Most Active Users:')
          .moveDown(0.5);
        userActivity.slice(0, 5).forEach(user => {
          doc.text(`${user.user.name}: ${user.totalActions} actions`);
        });
        doc.moveDown();
      }

      // Queue Metrics
      if (data.queueMetrics) {
        doc.fontSize(16)
          .text('Queue Metrics', { underline: true })
          .moveDown();

        const { summary } = data.queueMetrics;
        doc.fontSize(12)
          .text(`Total Jobs: ${summary.totalJobs}`)
          .text(`Average Processing Time: ${this.formatDuration(summary.avgProcessingTime)}`)
          .moveDown();

        // Status Distribution
        doc.text('Status Distribution:')
          .moveDown(0.5);
        Object.entries(summary.statusDistribution).forEach(([status, count]) => {
          doc.text(`${status}: ${count}`);
        });
        doc.moveDown();
      }

      // Footer
      doc.fontSize(10)
        .text(`Generated on ${new Date().toLocaleString()}`, {
          align: 'center',
          color: 'grey'
        });

      doc.end();

      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  async generateCSVReport(reportPath, data) {
    const records = [];

    // Flatten metrics into CSV records
    if (data.contentMetrics) {
      const { summary, timeSeries } = data.contentMetrics;
      records.push({
        section: 'Content Summary',
        metric: 'Total Content',
        value: summary.totalContent
      });
      records.push({
        section: 'Content Summary',
        metric: 'Total Size',
        value: this.formatBytes(summary.totalSize)
      });
      
      timeSeries.forEach(entry => {
        records.push({
          section: 'Content Timeline',
          metric: 'Daily Content',
          date: entry._id,
          value: entry.count
        });
      });
    }

    if (data.processingMetrics) {
      const { summary, timeSeries } = data.processingMetrics;
      records.push({
        section: 'Processing Summary',
        metric: 'Total Processed',
        value: summary.totalProcessed
      });
      records.push({
        section: 'Processing Summary',
        metric: 'Success Rate',
        value: `${(summary.successRate * 100).toFixed(1)}%`
      });
      
      timeSeries.forEach(entry => {
        records.push({
          section: 'Processing Timeline',
          metric: 'Daily Processing',
          date: entry._id,
          value: entry.count
        });
      });
    }

    const csvWriter = createObjectCsvWriter({
      path: reportPath,
      header: [
        { id: 'section', title: 'Section' },
        { id: 'metric', title: 'Metric' },
        { id: 'date', title: 'Date' },
        { id: 'value', title: 'Value' }
      ]
    });

    await csvWriter.writeRecords(records);
  }

  async generateJSONReport(reportPath, data) {
    const report = {
      metadata: {
        generatedAt: new Date(),
        version: '1.0'
      },
      data
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  formatBytes(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  formatDuration(ms) {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  }
}

module.exports = new ReportingService();
