const fs = require('fs');
const path = require('path');
const prettier = require('prettier');

// Configuration
const config = {
  source: {
    api: path.join(__dirname, '../src/server/routes'),
    components: path.join(__dirname, '../src/client/src/components'),
    types: path.join(__dirname, '../src/client/src/types')
  },
  output: path.join(__dirname, '../docs/generated/coverage/report.md')
};

// Calculate documentation coverage
async function generateCoverageReport() {
  const coverage = {
    api: calculateApiCoverage(),
    components: calculateComponentCoverage(),
    types: calculateTypeCoverage()
  };

  const report = generateCoverageMarkdown(coverage);

  // Create output directory if it doesn't exist
  const outputDir = path.dirname(config.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write report
  fs.writeFileSync(config.output, report);
}

// Calculate API documentation coverage
function calculateApiCoverage() {
  const coverage = {
    total: 0,
    documented: 0,
    percentage: 0
  };

  if (fs.existsSync(config.source.api)) {
    const files = fs.readdirSync(config.source.api);
    coverage.total = files.length;

    files.forEach(file => {
      if (file.endsWith('.js')) {
        const content = fs.readFileSync(path.join(config.source.api, file), 'utf8');
        if (content.includes('@swagger') || content.includes('@api')) {
          coverage.documented++;
        }
      }
    });

    coverage.percentage = (coverage.documented / coverage.total) * 100;
  }

  return coverage;
}

// Calculate component documentation coverage
function calculateComponentCoverage() {
  const coverage = {
    total: 0,
    documented: 0,
    percentage: 0
  };

  if (fs.existsSync(config.source.components)) {
    const files = getAllFiles(config.source.components, '.vue');
    coverage.total = files.length;

    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('@description') || content.includes('@prop') || content.includes('@event')) {
        coverage.documented++;
      }
    });

    coverage.percentage = (coverage.documented / coverage.total) * 100;
  }

  return coverage;
}

// Calculate type documentation coverage
function calculateTypeCoverage() {
  const coverage = {
    total: 0,
    documented: 0,
    percentage: 0
  };

  if (fs.existsSync(config.source.types)) {
    const files = getAllFiles(config.source.types, '.ts');
    coverage.total = files.length;

    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('/**') || content.includes('@typedef')) {
        coverage.documented++;
      }
    });

    coverage.percentage = (coverage.documented / coverage.total) * 100;
  }

  return coverage;
}

// Generate markdown report
function generateCoverageMarkdown(coverage) {
  let markdown = '# Documentation Coverage Report\n\n';

  markdown += '## Summary\n\n';
  markdown += '| Category | Total Files | Documented Files | Coverage |\n';
  markdown += '|----------|-------------|-----------------|----------|\n';
  markdown += `| API | ${coverage.api.total} | ${coverage.api.documented} | ${coverage.api.percentage.toFixed(2)}% |\n`;
  markdown += `| Components | ${coverage.components.total} | ${coverage.components.documented} | ${coverage.components.percentage.toFixed(2)}% |\n`;
  markdown += `| Types | ${coverage.types.total} | ${coverage.types.documented} | ${coverage.types.percentage.toFixed(2)}% |\n\n`;

  markdown += '## Details\n\n';

  markdown += '### API Documentation\n';
  markdown += `- Total API files: ${coverage.api.total}\n`;
  markdown += `- Documented API files: ${coverage.api.documented}\n`;
  markdown += `- Coverage: ${coverage.api.percentage.toFixed(2)}%\n\n`;

  markdown += '### Component Documentation\n';
  markdown += `- Total components: ${coverage.components.total}\n`;
  markdown += `- Documented components: ${coverage.components.documented}\n`;
  markdown += `- Coverage: ${coverage.components.percentage.toFixed(2)}%\n\n`;

  markdown += '### Type Documentation\n';
  markdown += `- Total type files: ${coverage.types.total}\n`;
  markdown += `- Documented type files: ${coverage.types.documented}\n`;
  markdown += `- Coverage: ${coverage.types.percentage.toFixed(2)}%\n\n`;

  markdown += '## Recommendations\n\n';

  if (coverage.api.percentage < 100) {
    markdown += '### API Documentation\n';
    markdown += '- Add Swagger annotations to undocumented API endpoints\n';
    markdown += '- Include request/response examples\n';
    markdown += '- Document error responses\n\n';
  }

  if (coverage.components.percentage < 100) {
    markdown += '### Component Documentation\n';
    markdown += '- Add component descriptions\n';
    markdown += '- Document props and events\n';
    markdown += '- Include usage examples\n\n';
  }

  if (coverage.types.percentage < 100) {
    markdown += '### Type Documentation\n';
    markdown += '- Add JSDoc comments to types\n';
    markdown += '- Document type parameters\n';
    markdown += '- Include usage examples\n\n';
  }

  return prettier.format(markdown, { parser: 'markdown' });
}

// Helper function to get all files recursively
function getAllFiles(dir, extension) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      files.push(...getAllFiles(fullPath, extension));
    } else if (item.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

// Run coverage report generation
generateCoverageReport().catch(console.error);
