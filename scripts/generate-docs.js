const fs = require('fs');
const path = require('path');
const jsdoc2md = require('jsdoc-to-markdown');
const swagger = require('swagger-jsdoc');
const yaml = require('js-yaml');
const typedoc = require('typedoc');
const marked = require('marked');
const prettier = require('prettier');

// Configuration
const config = {
  source: {
    server: path.join(__dirname, '../src/server'),
    client: path.join(__dirname, '../src/client/src'),
    docs: path.join(__dirname, '../docs')
  },
  output: {
    api: path.join(__dirname, '../docs/generated/api'),
    components: path.join(__dirname, '../docs/generated/components'),
    typescript: path.join(__dirname, '../docs/generated/types'),
    coverage: path.join(__dirname, '../docs/generated/coverage')
  },
  templates: path.join(__dirname, '../docs/templates')
};

// Swagger configuration
const swaggerOptions = {
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

// TypeDoc configuration
const typeDocOptions = {
  entryPoints: ['./src/client/src/types'],
  out: config.output.typescript,
  excludePrivate: true,
  excludeProtected: true,
  excludeExternals: true
};

// Generate API documentation
async function generateApiDocs() {
  console.log('Generating API documentation...');

  // Generate Swagger documentation
  const swaggerSpec = swagger(swaggerOptions);
  const apiPath = path.join(config.output.api, 'swagger.yaml');
  fs.writeFileSync(apiPath, yaml.dump(swaggerSpec));

  // Generate JSDoc documentation
  const jsdocFiles = [
    path.join(config.source.server, '**/*.js'),
    '!node_modules/**'
  ];
  const jsdocOutput = await jsdoc2md.render({ files: jsdocFiles });
  const jsdocPath = path.join(config.output.api, 'reference.md');
  fs.writeFileSync(jsdocPath, jsdocOutput);

  console.log('API documentation generated successfully');
}

// Generate component documentation
async function generateComponentDocs() {
  console.log('Generating component documentation...');

  // Read Vue components
  const componentFiles = getAllFiles(path.join(config.source.client, 'components'));
  
  for (const file of componentFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const componentName = path.basename(file, '.vue');
    
    // Extract component documentation
    const docs = extractComponentDocs(content);
    
    // Generate markdown
    const markdown = generateComponentMarkdown(componentName, docs);
    
    // Save documentation
    const outputPath = path.join(config.output.components, `${componentName}.md`);
    fs.writeFileSync(outputPath, markdown);
  }

  console.log('Component documentation generated successfully');
}

// Generate TypeScript documentation
async function generateTypeScriptDocs() {
  console.log('Generating TypeScript documentation...');

  const app = new typedoc.Application();
  app.options.addReader(new typedoc.TSConfigReader());
  app.bootstrap(typeDocOptions);

  const project = app.convert();
  if (project) {
    await app.generateDocs(project, config.output.typescript);
  }

  console.log('TypeScript documentation generated successfully');
}

// Generate documentation coverage report
async function generateCoverageReport() {
  console.log('Generating documentation coverage report...');

  const coverage = {
    api: calculateApiCoverage(),
    components: calculateComponentCoverage(),
    types: calculateTypeCoverage()
  };

  const report = generateCoverageMarkdown(coverage);
  const reportPath = path.join(config.output.coverage, 'report.md');
  fs.writeFileSync(reportPath, report);

  console.log('Coverage report generated successfully');
}

// Helper functions
function getAllFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else if (item.endsWith('.vue')) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractComponentDocs(content) {
  // Extract documentation from Vue component
  const docs = {
    description: '',
    props: [],
    events: [],
    methods: []
  };

  // Parse component content
  const lines = content.split('\n');
  let currentSection = null;

  for (const line of lines) {
    if (line.includes('@description')) {
      docs.description = line.split('@description')[1].trim();
    } else if (line.includes('@prop')) {
      docs.props.push(parsePropDoc(line));
    } else if (line.includes('@event')) {
      docs.events.push(parseEventDoc(line));
    } else if (line.includes('@method')) {
      docs.methods.push(parseMethodDoc(line));
    }
  }

  return docs;
}

function generateComponentMarkdown(name, docs) {
  let markdown = `# ${name}\n\n`;

  if (docs.description) {
    markdown += `## Description\n${docs.description}\n\n`;
  }

  if (docs.props.length > 0) {
    markdown += '## Props\n\n';
    markdown += generatePropsTable(docs.props);
  }

  if (docs.events.length > 0) {
    markdown += '## Events\n\n';
    markdown += generateEventsTable(docs.events);
  }

  if (docs.methods.length > 0) {
    markdown += '## Methods\n\n';
    markdown += generateMethodsTable(docs.methods);
  }

  return prettier.format(markdown, { parser: 'markdown' });
}

function calculateApiCoverage() {
  // Calculate API documentation coverage
  const coverage = {
    total: 0,
    documented: 0,
    percentage: 0
  };

  // Implementation...

  return coverage;
}

function calculateComponentCoverage() {
  // Calculate component documentation coverage
  const coverage = {
    total: 0,
    documented: 0,
    percentage: 0
  };

  // Implementation...

  return coverage;
}

function calculateTypeCoverage() {
  // Calculate type documentation coverage
  const coverage = {
    total: 0,
    documented: 0,
    percentage: 0
  };

  // Implementation...

  return coverage;
}

function generateCoverageMarkdown(coverage) {
  let markdown = '# Documentation Coverage Report\n\n';

  markdown += '## Summary\n\n';
  markdown += generateCoverageTable(coverage);

  markdown += '\n## Details\n\n';
  markdown += generateCoverageDetails(coverage);

  return prettier.format(markdown, { parser: 'markdown' });
}

// Main execution
async function main() {
  try {
    // Create output directories
    Object.values(config.output).forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Generate documentation
    await generateApiDocs();
    await generateComponentDocs();
    await generateTypeScriptDocs();
    await generateCoverageReport();

    console.log('Documentation generation completed successfully');
  } catch (error) {
    console.error('Error generating documentation:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  generateApiDocs,
  generateComponentDocs,
  generateTypeScriptDocs,
  generateCoverageReport
};
