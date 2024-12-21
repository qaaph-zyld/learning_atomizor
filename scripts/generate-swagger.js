const fs = require('fs');
const path = require('path');
const swagger = require('swagger-jsdoc');
const yaml = require('js-yaml');

// Swagger configuration
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Learning Atomizer API',
      version: '1.0.0',
      description: 'API documentation for Learning Atomizer platform'
    },
    servers: [
      {
        url: 'https://api.learning-atomizer.com',
        description: 'Production server'
      },
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ]
  },
  apis: ['./src/server/routes/*.js']
};

// Generate Swagger documentation
const swaggerSpec = swagger(options);
const outputPath = path.join(__dirname, '../docs/generated/api/swagger.yaml');

// Create output directory if it doesn't exist
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write Swagger documentation
fs.writeFileSync(outputPath, yaml.dump(swaggerSpec));
