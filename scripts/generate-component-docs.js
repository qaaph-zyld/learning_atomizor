const fs = require('fs');
const path = require('path');
const prettier = require('prettier');

// Configuration
const config = {
  source: path.join(__dirname, '../src/client/src/components'),
  output: path.join(__dirname, '../docs/generated/components'),
  template: path.join(__dirname, '../docs/templates/component.md')
};

// Generate documentation for Vue components
async function generateComponentDocs() {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(config.output)) {
    fs.mkdirSync(config.output, { recursive: true });
  }

  // Get all Vue component files
  const componentFiles = getAllFiles(config.source);

  // Process each component
  for (const file of componentFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const componentName = path.basename(file, '.vue');
    const docs = extractComponentDocs(content);
    const markdown = generateComponentMarkdown(componentName, docs);
    const outputPath = path.join(config.output, `${componentName}.md`);
    fs.writeFileSync(outputPath, markdown);
  }
}

// Helper function to get all Vue files recursively
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

// Extract documentation from Vue component
function extractComponentDocs(content) {
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

// Parse prop documentation
function parsePropDoc(line) {
  const match = line.match(/@prop\s+{(\w+)}\s+(\w+)(?:\s+-\s+(.+))?/);
  if (match) {
    return {
      type: match[1],
      name: match[2],
      description: match[3] || ''
    };
  }
  return null;
}

// Parse event documentation
function parseEventDoc(line) {
  const match = line.match(/@event\s+{(.+)}\s+(\w+)(?:\s+-\s+(.+))?/);
  if (match) {
    return {
      parameters: match[1],
      name: match[2],
      description: match[3] || ''
    };
  }
  return null;
}

// Parse method documentation
function parseMethodDoc(line) {
  const match = line.match(/@method\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?(?:\s+-\s+(.+))?/);
  if (match) {
    return {
      name: match[1],
      parameters: match[2],
      returns: match[3] || 'void',
      description: match[4] || ''
    };
  }
  return null;
}

// Generate markdown documentation
function generateComponentMarkdown(componentName, docs) {
  let markdown = `# ${componentName}\n\n`;

  if (docs.description) {
    markdown += `## Description\n${docs.description}\n\n`;
  }

  if (docs.props.length > 0) {
    markdown += '## Props\n\n';
    markdown += '| Name | Type | Description |\n';
    markdown += '|------|------|-------------|\n';
    docs.props.forEach(prop => {
      if (prop) {
        markdown += `| ${prop.name} | ${prop.type} | ${prop.description} |\n`;
      }
    });
    markdown += '\n';
  }

  if (docs.events.length > 0) {
    markdown += '## Events\n\n';
    markdown += '| Name | Parameters | Description |\n';
    markdown += '|------|------------|-------------|\n';
    docs.events.forEach(event => {
      if (event) {
        markdown += `| ${event.name} | ${event.parameters} | ${event.description} |\n`;
      }
    });
    markdown += '\n';
  }

  if (docs.methods.length > 0) {
    markdown += '## Methods\n\n';
    markdown += '| Name | Parameters | Returns | Description |\n';
    markdown += '|------|------------|---------|-------------|\n';
    docs.methods.forEach(method => {
      if (method) {
        markdown += `| ${method.name} | ${method.parameters} | ${method.returns} | ${method.description} |\n`;
      }
    });
    markdown += '\n';
  }

  return prettier.format(markdown, { parser: 'markdown' });
}

// Run documentation generation
generateComponentDocs().catch(console.error);
