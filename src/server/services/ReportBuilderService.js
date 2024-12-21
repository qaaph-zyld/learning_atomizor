const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { createObjectCsvWriter } = require('csv-writer');
const logger = require('./LoggerService');
const AnalyticsService = require('./AnalyticsService');
const MLAnalyticsService = require('./MLAnalyticsService');
const PredictiveAnalyticsService = require('./PredictiveAnalyticsService');
const redis = require('./CacheService');

class ReportBuilderService {
  constructor() {
    this.config = {
      cacheExpiration: 3600, // 1 hour
      maxConcurrentReports: 5,
      reportTimeout: 300000, // 5 minutes
      maxDataPoints: 100000,
      supportedFormats: ['pdf', 'excel', 'csv', 'json']
    };

    this.activeReports = new Map();
    this.reportTemplates = new Map();
  }

  /**
   * Initialize report builder service
   */
  async initialize() {
    try {
      // Load report templates
      await this.loadReportTemplates();
      
      // Initialize cleanup job
      this.startCleanupJob();
      
      logger.info('Report Builder Service initialized successfully');
    } catch (error) {
      logger.error('Error initializing Report Builder Service:', error);
      throw error;
    }
  }

  /**
   * Load report templates from database
   */
  async loadReportTemplates() {
    try {
      const templates = await mongoose.model('ReportTemplate').find({
        status: 'active'
      });

      templates.forEach(template => {
        this.reportTemplates.set(template.id, template);
      });

      logger.info(`Loaded ${templates.length} report templates`);
    } catch (error) {
      logger.error('Error loading report templates:', error);
      throw error;
    }
  }

  /**
   * Start cleanup job for old reports
   */
  startCleanupJob() {
    setInterval(() => {
      const now = Date.now();
      for (const [reportId, report] of this.activeReports) {
        if (now - report.startTime > this.config.reportTimeout) {
          this.activeReports.delete(reportId);
          logger.warn(`Cleaned up stale report: ${reportId}`);
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Generate report
   */
  async generateReport(options) {
    try {
      // Validate options
      this.validateReportOptions(options);

      // Check concurrent report limit
      if (this.activeReports.size >= this.config.maxConcurrentReports) {
        throw new Error('Maximum concurrent report limit reached');
      }

      // Create report context
      const reportId = mongoose.Types.ObjectId();
      const report = {
        id: reportId,
        status: 'processing',
        startTime: Date.now(),
        options,
        progress: 0
      };

      this.activeReports.set(reportId.toString(), report);

      // Generate report data
      const data = await this.generateReportData(options);

      // Format report
      const formattedReport = await this.formatReport(data, options.format);

      // Update report status
      report.status = 'completed';
      report.progress = 100;
      report.completedAt = new Date();

      return {
        reportId: reportId.toString(),
        format: options.format,
        data: formattedReport
      };
    } catch (error) {
      logger.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Validate report options
   */
  validateReportOptions(options) {
    const requiredFields = ['type', 'format', 'dateRange'];
    requiredFields.forEach(field => {
      if (!options[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    });

    if (!this.config.supportedFormats.includes(options.format)) {
      throw new Error('Unsupported report format');
    }

    if (options.template && !this.reportTemplates.has(options.template)) {
      throw new Error('Invalid report template');
    }
  }

  /**
   * Generate report data
   */
  async generateReportData(options) {
    const cacheKey = this.generateCacheKey(options);
    
    // Check cache
    const cachedData = await redis.get(`report:${cacheKey}`);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Generate data based on report type
    let data;
    switch (options.type) {
      case 'analytics':
        data = await this.generateAnalyticsReport(options);
        break;
      case 'content':
        data = await this.generateContentReport(options);
        break;
      case 'user':
        data = await this.generateUserReport(options);
        break;
      case 'performance':
        data = await this.generatePerformanceReport(options);
        break;
      case 'prediction':
        data = await this.generatePredictionReport(options);
        break;
      default:
        throw new Error('Unsupported report type');
    }

    // Cache data
    await redis.set(
      `report:${cacheKey}`,
      JSON.stringify(data),
      'EX',
      this.config.cacheExpiration
    );

    return data;
  }

  /**
   * Generate analytics report
   */
  async generateAnalyticsReport(options) {
    const analytics = await AnalyticsService.getWorkspaceAnalytics(
      options.workspaceId,
      {
        startDate: options.dateRange.start,
        endDate: options.dateRange.end
      }
    );

    const mlAnalytics = await MLAnalyticsService.getContentRecommendations(
      options.workspaceId
    );

    return {
      type: 'analytics',
      timestamp: new Date(),
      period: options.dateRange,
      metrics: analytics,
      recommendations: mlAnalytics
    };
  }

  /**
   * Generate content report
   */
  async generateContentReport(options) {
    const contentStats = await mongoose.model('Content').aggregate([
      {
        $match: {
          workspace: mongoose.Types.ObjectId(options.workspaceId),
          createdAt: {
            $gte: new Date(options.dateRange.start),
            $lte: new Date(options.dateRange.end)
          }
        }
      },
      {
        $group: {
          _id: null,
          totalContent: { $sum: 1 },
          byStatus: {
            $push: {
              k: '$status',
              v: 1
            }
          },
          byType: {
            $push: {
              k: '$contentType',
              v: 1
            }
          },
          avgProcessingTime: { $avg: '$processingMetrics.processingTime' },
          avgAccuracyScore: { $avg: '$processingMetrics.accuracyScore' }
        }
      }
    ]);

    return {
      type: 'content',
      timestamp: new Date(),
      period: options.dateRange,
      statistics: contentStats[0] || {
        totalContent: 0,
        byStatus: {},
        byType: {},
        avgProcessingTime: 0,
        avgAccuracyScore: 0
      }
    };
  }

  /**
   * Generate user report
   */
  async generateUserReport(options) {
    const userStats = await mongoose.model('User').aggregate([
      {
        $match: {
          workspace: mongoose.Types.ObjectId(options.workspaceId)
        }
      },
      {
        $lookup: {
          from: 'auditlogs',
          localField: '_id',
          foreignField: 'actor.user',
          as: 'activities'
        }
      },
      {
        $project: {
          _id: 1,
          email: 1,
          role: 1,
          activityCount: { $size: '$activities' },
          lastActive: { $max: '$activities.timestamp' }
        }
      }
    ]);

    return {
      type: 'user',
      timestamp: new Date(),
      period: options.dateRange,
      users: userStats
    };
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(options) {
    const performanceData = await Promise.all([
      this.getSystemPerformance(options),
      this.getContentPerformance(options),
      this.getUserPerformance(options)
    ]);

    return {
      type: 'performance',
      timestamp: new Date(),
      period: options.dateRange,
      system: performanceData[0],
      content: performanceData[1],
      user: performanceData[2]
    };
  }

  /**
   * Get system performance metrics
   */
  async getSystemPerformance(options) {
    const metrics = await mongoose.model('SystemMetric').aggregate([
      {
        $match: {
          timestamp: {
            $gte: new Date(options.dateRange.start),
            $lte: new Date(options.dateRange.end)
          }
        }
      },
      {
        $group: {
          _id: null,
          avgCpuUsage: { $avg: '$cpuUsage' },
          avgMemoryUsage: { $avg: '$memoryUsage' },
          avgResponseTime: { $avg: '$responseTime' },
          totalRequests: { $sum: '$requestCount' },
          errorRate: {
            $avg: {
              $divide: ['$errorCount', '$requestCount']
            }
          }
        }
      }
    ]);

    return metrics[0] || {
      avgCpuUsage: 0,
      avgMemoryUsage: 0,
      avgResponseTime: 0,
      totalRequests: 0,
      errorRate: 0
    };
  }

  /**
   * Get content performance metrics
   */
  async getContentPerformance(options) {
    return await PredictiveAnalyticsService.predictContentPerformance(
      options.workspaceId
    );
  }

  /**
   * Get user performance metrics
   */
  async getUserPerformance(options) {
    return await MLAnalyticsService.getUserSegment(options.workspaceId);
  }

  /**
   * Generate prediction report
   */
  async generatePredictionReport(options) {
    const predictions = await Promise.all([
      PredictiveAnalyticsService.predictSystemLoad(24),
      PredictiveAnalyticsService.predictUserChurn(options.workspaceId),
      PredictiveAnalyticsService.predictContentPerformance(options.workspaceId)
    ]);

    return {
      type: 'prediction',
      timestamp: new Date(),
      period: options.dateRange,
      systemLoad: predictions[0],
      userChurn: predictions[1],
      contentPerformance: predictions[2]
    };
  }

  /**
   * Format report based on requested format
   */
  async formatReport(data, format) {
    switch (format) {
      case 'pdf':
        return await this.generatePDF(data);
      case 'excel':
        return await this.generateExcel(data);
      case 'csv':
        return await this.generateCSV(data);
      case 'json':
        return data;
      default:
        throw new Error('Unsupported format');
    }
  }

  /**
   * Generate PDF report
   */
  async generatePDF(data) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Add report header
        doc
          .fontSize(20)
          .text(`${data.type.toUpperCase()} Report`, { align: 'center' })
          .moveDown();

        // Add timestamp
        doc
          .fontSize(12)
          .text(`Generated: ${data.timestamp.toLocaleString()}`)
          .moveDown();

        // Add report content based on type
        switch (data.type) {
          case 'analytics':
            this.addAnalyticsToPDF(doc, data);
            break;
          case 'content':
            this.addContentToPDF(doc, data);
            break;
          case 'user':
            this.addUsersToPDF(doc, data);
            break;
          case 'performance':
            this.addPerformanceToPDF(doc, data);
            break;
          case 'prediction':
            this.addPredictionsToPDF(doc, data);
            break;
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add analytics data to PDF
   */
  addAnalyticsToPDF(doc, data) {
    doc
      .fontSize(16)
      .text('Analytics Overview')
      .moveDown();

    // Add metrics
    Object.entries(data.metrics).forEach(([key, value]) => {
      doc
        .fontSize(12)
        .text(`${key}: ${JSON.stringify(value)}`)
        .moveDown(0.5);
    });

    // Add recommendations
    doc
      .fontSize(16)
      .text('Recommendations')
      .moveDown();

    data.recommendations.forEach(rec => {
      doc
        .fontSize(12)
        .text(rec.title)
        .fontSize(10)
        .text(rec.description)
        .moveDown();
    });
  }

  /**
   * Generate Excel report
   */
  async generateExcel(data) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add header
    worksheet.addRow([
      `${data.type.toUpperCase()} Report - Generated: ${data.timestamp.toLocaleString()}`
    ]);

    // Add data based on type
    switch (data.type) {
      case 'analytics':
        this.addAnalyticsToExcel(worksheet, data);
        break;
      case 'content':
        this.addContentToExcel(worksheet, data);
        break;
      case 'user':
        this.addUsersToExcel(worksheet, data);
        break;
      case 'performance':
        this.addPerformanceToExcel(worksheet, data);
        break;
      case 'prediction':
        this.addPredictionsToExcel(worksheet, data);
        break;
    }

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Generate CSV report
   */
  async generateCSV(data) {
    const csvWriter = createObjectCsvWriter({
      path: 'report.csv',
      header: this.getCSVHeaders(data)
    });

    await csvWriter.writeRecords(this.getCSVRecords(data));

    return await fs.promises.readFile('report.csv');
  }

  /**
   * Generate cache key for report
   */
  generateCacheKey(options) {
    const components = [
      options.type,
      options.workspaceId,
      options.dateRange.start,
      options.dateRange.end,
      options.template
    ];

    return crypto
      .createHash('md5')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Get report status
   */
  getReportStatus(reportId) {
    const report = this.activeReports.get(reportId);
    if (!report) {
      throw new Error('Report not found');
    }
    return {
      id: report.id,
      status: report.status,
      progress: report.progress,
      startTime: report.startTime,
      completedAt: report.completedAt
    };
  }

  /**
   * Cancel report generation
   */
  cancelReport(reportId) {
    const report = this.activeReports.get(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    report.status = 'cancelled';
    this.activeReports.delete(reportId);
    
    logger.info(`Cancelled report: ${reportId}`);
  }
}

module.exports = new ReportBuilderService();
