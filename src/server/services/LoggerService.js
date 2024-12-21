const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

class LoggerService {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      debug: 4
    };

    this.logger = winston.createLogger({
      levels: this.logLevels,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      transports: [
        // Error logs
        new DailyRotateFile({
          filename: path.join(this.logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '14d',
          zippedArchive: true
        }),

        // Combined logs
        new DailyRotateFile({
          filename: path.join(this.logDir, 'combined-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          zippedArchive: true
        }),

        // Console output
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Add Morgan stream for HTTP logging
    this.stream = {
      write: (message) => {
        this.logger.http(message.trim());
      }
    };
  }

  /**
   * Log error message
   */
  error(message, meta = {}) {
    this.logger.error(message, { meta });
  }

  /**
   * Log warning message
   */
  warn(message, meta = {}) {
    this.logger.warn(message, { meta });
  }

  /**
   * Log info message
   */
  info(message, meta = {}) {
    this.logger.info(message, { meta });
  }

  /**
   * Log HTTP request
   */
  http(message, meta = {}) {
    this.logger.http(message, { meta });
  }

  /**
   * Log debug message
   */
  debug(message, meta = {}) {
    this.logger.debug(message, { meta });
  }

  /**
   * Create child logger with additional context
   */
  child(options) {
    return this.logger.child(options);
  }

  /**
   * Log error with stack trace
   */
  logError(error, additionalInfo = {}) {
    this.error(error.message, {
      ...additionalInfo,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
  }

  /**
   * Log performance metric
   */
  logPerformance(operation, duration, meta = {}) {
    this.info(`Performance: ${operation}`, {
      ...meta,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log security event
   */
  logSecurity(event, meta = {}) {
    this.warn(`Security: ${event}`, {
      ...meta,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log database operation
   */
  logDatabase(operation, collection, duration, meta = {}) {
    this.debug(`Database: ${operation} - ${collection}`, {
      ...meta,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log API request
   */
  logAPIRequest(method, endpoint, duration, meta = {}) {
    this.http(`API Request: ${method} ${endpoint}`, {
      ...meta,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log cache operation
   */
  logCache(operation, key, hit, duration, meta = {}) {
    this.debug(`Cache: ${operation} - ${key}`, {
      ...meta,
      hit,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log job processing
   */
  logJob(jobId, status, duration, meta = {}) {
    this.info(`Job: ${jobId} - ${status}`, {
      ...meta,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log user activity
   */
  logUserActivity(userId, action, meta = {}) {
    this.info(`User Activity: ${action}`, {
      ...meta,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get log stream for Morgan middleware
   */
  getStream() {
    return this.stream;
  }
}

module.exports = new LoggerService();
