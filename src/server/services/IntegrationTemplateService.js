const mongoose = require('mongoose');
const logger = require('./LoggerService');
const redis = require('./CacheService');
const APIGatewayService = require('./APIGatewayService');

class IntegrationTemplateService {
  constructor() {
    this.templates = new Map();
    this.config = {
      cacheExpiration: 3600, // 1 hour in seconds
      validationTimeout: 30000, // 30 seconds
      maxTemplateSize: 1024 * 1024 // 1MB
    };
  }

  /**
   * Initialize template service
   */
  async initialize() {
    try {
      // Load templates from database
      await this.loadTemplates();
      
      // Initialize template validation
      await this.initializeValidation();
      
      logger.info('Integration Template Service initialized successfully');
    } catch (error) {
      logger.error('Error initializing Integration Template Service:', error);
      throw error;
    }
  }

  /**
   * Load templates from database
   */
  async loadTemplates() {
    try {
      const templates = await mongoose.model('IntegrationTemplate').find({
        status: 'active'
      });

      templates.forEach(template => {
        this.templates.set(template.id, {
          ...template.toObject(),
          validationStatus: null,
          lastValidated: null
        });
      });

      logger.info(`Loaded ${templates.length} integration templates`);
    } catch (error) {
      logger.error('Error loading templates:', error);
      throw error;
    }
  }

  /**
   * Initialize template validation
   */
  async initializeValidation() {
    // Validate templates periodically
    setInterval(async () => {
      for (const [id, template] of this.templates) {
        try {
          await this.validateTemplate(template);
        } catch (error) {
          logger.error(`Template validation failed for ${id}:`, error);
        }
      }
    }, 3600000); // Every hour
  }

  /**
   * Create new integration template
   */
  async createTemplate(templateData) {
    try {
      // Validate template data
      await this.validateTemplateData(templateData);

      const template = {
        ...templateData,
        version: '1.0.0',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to database
      const TemplateModel = mongoose.model('IntegrationTemplate');
      const savedTemplate = await new TemplateModel(template).save();

      // Add to local cache
      this.templates.set(savedTemplate.id, {
        ...savedTemplate.toObject(),
        validationStatus: null,
        lastValidated: null
      });

      logger.info(`Created new integration template: ${savedTemplate.id}`);
      return savedTemplate;
    } catch (error) {
      logger.error('Error creating template:', error);
      throw error;
    }
  }

  /**
   * Validate template data
   */
  async validateTemplateData(data) {
    // Check required fields
    const requiredFields = ['name', 'type', 'schema', 'endpoints'];
    requiredFields.forEach(field => {
      if (!data[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    });

    // Validate schema
    if (!this.isValidJsonSchema(data.schema)) {
      throw new Error('Invalid JSON schema');
    }

    // Validate endpoints
    if (!Array.isArray(data.endpoints) || data.endpoints.length === 0) {
      throw new Error('Template must define at least one endpoint');
    }

    // Check template size
    const templateSize = Buffer.byteLength(JSON.stringify(data));
    if (templateSize > this.config.maxTemplateSize) {
      throw new Error('Template size exceeds maximum limit');
    }

    // Validate each endpoint
    for (const endpoint of data.endpoints) {
      await this.validateEndpoint(endpoint);
    }
  }

  /**
   * Validate JSON schema
   */
  isValidJsonSchema(schema) {
    try {
      // Basic schema validation
      if (typeof schema !== 'object' || schema === null) {
        return false;
      }

      // Check required schema properties
      const requiredProperties = ['type', 'properties'];
      return requiredProperties.every(prop => prop in schema);
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate endpoint configuration
   */
  async validateEndpoint(endpoint) {
    const requiredFields = ['path', 'method', 'requestSchema', 'responseSchema'];
    requiredFields.forEach(field => {
      if (!endpoint[field]) {
        throw new Error(`Endpoint missing required field: ${field}`);
      }
    });

    // Validate HTTP method
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(endpoint.method)) {
      throw new Error('Invalid HTTP method');
    }

    // Validate schemas
    if (!this.isValidJsonSchema(endpoint.requestSchema)) {
      throw new Error('Invalid request schema');
    }
    if (!this.isValidJsonSchema(endpoint.responseSchema)) {
      throw new Error('Invalid response schema');
    }
  }

  /**
   * Validate template implementation
   */
  async validateTemplate(template) {
    try {
      // Check if template has test configuration
      if (!template.testConfig) {
        template.validationStatus = 'pending';
        template.lastValidated = new Date();
        return;
      }

      // Create test integration
      const testIntegration = await APIGatewayService.registerIntegration({
        name: `${template.name}-test`,
        type: template.type,
        baseUrl: template.testConfig.baseUrl,
        methods: template.endpoints.map(e => e.method),
        temporary: true
      });

      // Test each endpoint
      const results = await Promise.all(
        template.endpoints.map(endpoint => 
          this.testEndpoint(testIntegration, endpoint, template.testConfig)
        )
      );

      // Update validation status
      template.validationStatus = results.every(r => r.success) ? 'valid' : 'invalid';
      template.lastValidated = new Date();
      template.validationResults = results;

      // Clean up test integration
      await APIGatewayService.revokeIntegration(testIntegration.id);

      logger.info(`Validated template ${template.id}: ${template.validationStatus}`);
    } catch (error) {
      template.validationStatus = 'error';
      template.lastValidated = new Date();
      template.validationError = error.message;
      logger.error(`Template validation error for ${template.id}:`, error);
    }
  }

  /**
   * Test endpoint implementation
   */
  async testEndpoint(integration, endpoint, testConfig) {
    try {
      const testCase = testConfig.testCases[endpoint.path] || {};
      
      const response = await APIGatewayService.routeRequest({
        method: endpoint.method,
        path: endpoint.path,
        headers: {
          'x-api-key': integration.apiKey
        },
        body: testCase.requestBody || {},
        query: testCase.queryParams || {}
      });

      // Validate response against schema
      const isValid = this.validateResponse(
        response.data,
        endpoint.responseSchema
      );

      return {
        endpoint: endpoint.path,
        success: isValid,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        endpoint: endpoint.path,
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Validate response against schema
   */
  validateResponse(data, schema) {
    try {
      // Basic type validation
      if (schema.type === 'object') {
        if (typeof data !== 'object' || data === null) {
          return false;
        }

        // Validate required properties
        if (schema.required) {
          if (!schema.required.every(prop => prop in data)) {
            return false;
          }
        }

        // Validate property types
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in data) {
            if (!this.validateType(data[prop], propSchema.type)) {
              return false;
            }
          }
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate data type
   */
  validateType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null;
      default:
        return false;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error('Template not found');
    }
    return template;
  }

  /**
   * Update template
   */
  async updateTemplate(templateId, updates) {
    try {
      const template = await this.getTemplate(templateId);
      
      // Validate updates
      await this.validateTemplateData({
        ...template,
        ...updates
      });

      // Update in database
      const TemplateModel = mongoose.model('IntegrationTemplate');
      const updatedTemplate = await TemplateModel.findByIdAndUpdate(
        templateId,
        {
          ...updates,
          updatedAt: new Date(),
          version: this.incrementVersion(template.version)
        },
        { new: true }
      );

      // Update local cache
      this.templates.set(templateId, {
        ...updatedTemplate.toObject(),
        validationStatus: null,
        lastValidated: null
      });

      logger.info(`Updated template: ${templateId}`);
      return updatedTemplate;
    } catch (error) {
      logger.error('Error updating template:', error);
      throw error;
    }
  }

  /**
   * Increment version number
   */
  incrementVersion(version) {
    const [major, minor, patch] = version.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateId) {
    try {
      const TemplateModel = mongoose.model('IntegrationTemplate');
      await TemplateModel.findByIdAndUpdate(templateId, {
        status: 'deleted',
        updatedAt: new Date()
      });

      // Remove from local cache
      this.templates.delete(templateId);

      logger.info(`Deleted template: ${templateId}`);
    } catch (error) {
      logger.error('Error deleting template:', error);
      throw error;
    }
  }

  /**
   * Get all templates
   */
  async getTemplates(filters = {}) {
    try {
      const query = { status: 'active', ...filters };
      const templates = Array.from(this.templates.values())
        .filter(template => {
          return Object.entries(query).every(([key, value]) => 
            template[key] === value
          );
        });

      return templates;
    } catch (error) {
      logger.error('Error getting templates:', error);
      throw error;
    }
  }

  /**
   * Generate integration from template
   */
  async generateIntegration(templateId, config) {
    try {
      const template = await this.getTemplate(templateId);
      
      // Validate configuration against template schema
      if (!this.validateResponse(config, template.schema)) {
        throw new Error('Invalid configuration');
      }

      // Generate integration configuration
      const integration = {
        name: config.name,
        type: template.type,
        baseUrl: config.baseUrl,
        methods: template.endpoints.map(e => e.method),
        schema: template.schema,
        endpoints: template.endpoints.map(endpoint => ({
          ...endpoint,
          path: this.interpolateEndpoint(endpoint.path, config)
        })),
        config: config
      };

      // Register integration
      return await APIGatewayService.registerIntegration(integration);
    } catch (error) {
      logger.error('Error generating integration:', error);
      throw error;
    }
  }

  /**
   * Interpolate endpoint path with configuration
   */
  interpolateEndpoint(path, config) {
    return path.replace(/\${(\w+)}/g, (match, key) => {
      return config[key] || match;
    });
  }
}

module.exports = new IntegrationTemplateService();
