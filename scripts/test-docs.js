const fs = require('fs');
const path = require('path');
const markdownLint = require('markdownlint');
const linkCheck = require('markdown-link-check');
const spellcheck = require('markdown-spellcheck');
const { promisify } = require('util');

// Configuration
const config = {
  docsDir: path.join(__dirname, '../docs'),
  testsDir: path.join(__dirname, '../tests/docs'),
  outputDir: path.join(__dirname, '../docs/generated/test-results'),
  rules: {
    markdown: {
      'MD001': true, // Header levels should only increment by one level
      'MD002': true, // First header should be a top level header
      'MD003': { style: 'atx' }, // Header style
      'MD004': { style: 'asterisk' }, // Unordered list style
      'MD005': true, // Consistent indentation for lists
      'MD006': true, // Consider starting bulleted lists at the beginning of the line
      'MD007': { indent: 2 }, // Unordered list indentation
      'MD009': true, // No trailing spaces
      'MD010': true, // No hard tabs
      'MD011': true, // Reversed link syntax
      'MD012': true, // Multiple consecutive blank lines
      'MD013': { line_length: 120 }, // Line length
      'MD014': true, // Dollar signs used before commands without showing output
      'MD018': true, // No space after hash on atx style header
      'MD019': true, // Multiple spaces after hash on atx style header
      'MD020': true, // No space inside hashes on closed atx style header
      'MD021': true, // Multiple spaces inside hashes on closed atx style header
      'MD022': true, // Headers should be surrounded by blank lines
      'MD023': true, // Headers must start at the beginning of the line
      'MD024': true, // Multiple headers with the same content
      'MD025': true, // Multiple top level headers in the same document
      'MD026': true, // Trailing punctuation in header
      'MD027': true, // Multiple spaces after blockquote symbol
      'MD028': true, // Blank line inside blockquote
      'MD029': { style: 'ordered' }, // Ordered list item prefix
      'MD030': true, // Spaces after list markers
      'MD031': true, // Fenced code blocks should be surrounded by blank lines
      'MD032': true, // Lists should be surrounded by blank lines
      'MD033': true, // Inline HTML
      'MD034': true, // Bare URL used
      'MD035': { style: '---' }, // Horizontal rule style
      'MD036': true, // Emphasis used instead of a header
      'MD037': true, // Spaces inside emphasis markers
      'MD038': true, // Spaces inside code span elements
      'MD039': true, // Spaces inside link text
      'MD040': true, // Fenced code blocks should have a language specified
      'MD041': true, // First line in file should be a top level header
      'MD042': true, // No empty links
      'MD043': true, // Required header structure
      'MD044': true, // Proper names should have the correct capitalization
      'MD045': true, // Images should have alternate text
      'MD046': { style: 'fenced' }, // Code block style
      'MD047': true, // Files should end with a single newline character
      'MD048': { style: 'backtick' } // Code fence style
    },
    spellcheck: {
      ignoreAcronyms: true,
      ignoreNumbers: true,
      suggestions: true,
      customDictionary: [
        'Learning',
        'Atomizer',
        'API',
        'Vue',
        'TypeScript',
        'JavaScript',
        'MongoDB',
        'Redis',
        'npm',
        'Node.js'
      ]
    }
  }
};

// Test documentation
async function testDocs() {
  console.log('Testing documentation...');

  const results = {
    markdown: await testMarkdown(),
    links: await testLinks(),
    spelling: await testSpelling(),
    coverage: await testCoverage()
  };

  await generateReport(results);
  console.log('Documentation testing complete!');
}

// Test markdown formatting
async function testMarkdown() {
  console.log('Testing markdown formatting...');
  const results = [];

  const files = getAllMarkdownFiles(config.docsDir);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const options = {
      files: [file],
      config: config.rules.markdown
    };

    const lintResult = await markdownLint(options);
    if (lintResult[file].length > 0) {
      results.push({
        file: path.relative(config.docsDir, file),
        errors: lintResult[file]
      });
    }
  }

  return results;
}

// Test links
async function testLinks() {
  console.log('Testing links...');
  const results = [];

  const files = getAllMarkdownFiles(config.docsDir);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const options = {
      baseUrl: 'file://' + config.docsDir,
      ignorePatterns: [
        {
          pattern: '^#'
        }
      ]
    };

    try {
      const links = await promisify(linkCheck)(content, options);
      const brokenLinks = links.filter(link => !link.status);
      if (brokenLinks.length > 0) {
        results.push({
          file: path.relative(config.docsDir, file),
          links: brokenLinks
        });
      }
    } catch (error) {
      console.error(`Error checking links in ${file}:`, error);
    }
  }

  return results;
}

// Test spelling
async function testSpelling() {
  console.log('Testing spelling...');
  const results = [];

  const files = getAllMarkdownFiles(config.docsDir);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const options = {
      ...config.rules.spellcheck,
      files: [file]
    };

    const spellingErrors = spellcheck.spell(content, options);
    if (spellingErrors.length > 0) {
      results.push({
        file: path.relative(config.docsDir, file),
        errors: spellingErrors
      });
    }
  }

  return results;
}

// Test documentation coverage
async function testCoverage() {
  console.log('Testing documentation coverage...');
  
  const coverage = {
    total: 0,
    documented: 0,
    percentage: 0,
    missing: []
  };

  // Check API documentation coverage
  const apiFiles = getAllFiles(path.join(config.docsDir, 'api'), '.md');
  const routeFiles = getAllFiles(path.join(__dirname, '../src/server/routes'), '.js');

  coverage.total += routeFiles.length;
  coverage.documented += apiFiles.length;

  // Check missing API documentation
  routeFiles.forEach(routeFile => {
    const routeName = path.basename(routeFile, '.js');
    if (!apiFiles.some(apiFile => apiFile.includes(routeName))) {
      coverage.missing.push(`API: ${routeName}`);
    }
  });

  // Check component documentation coverage
  const componentDocs = getAllFiles(path.join(config.docsDir, 'components'), '.md');
  const components = getAllFiles(path.join(__dirname, '../src/client/src/components'), '.vue');

  coverage.total += components.length;
  coverage.documented += componentDocs.length;

  // Check missing component documentation
  components.forEach(component => {
    const componentName = path.basename(component, '.vue');
    if (!componentDocs.some(doc => doc.includes(componentName))) {
      coverage.missing.push(`Component: ${componentName}`);
    }
  });

  coverage.percentage = (coverage.documented / coverage.total) * 100;

  return coverage;
}

// Generate test report
async function generateReport(results) {
  console.log('Generating test report...');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  let report = '# Documentation Test Report\n\n';
  const timestamp = new Date().toISOString();
  report += `Generated: ${timestamp}\n\n`;

  // Markdown formatting results
  report += '## Markdown Formatting\n\n';
  if (results.markdown.length === 0) {
    report += '✅ No markdown formatting issues found.\n\n';
  } else {
    report += '❌ Markdown formatting issues found:\n\n';
    results.markdown.forEach(result => {
      report += `### ${result.file}\n`;
      result.errors.forEach(error => {
        report += `- Line ${error.lineNumber}: ${error.ruleDescription}\n`;
      });
      report += '\n';
    });
  }

  // Link check results
  report += '## Link Check\n\n';
  if (results.links.length === 0) {
    report += '✅ No broken links found.\n\n';
  } else {
    report += '❌ Broken links found:\n\n';
    results.links.forEach(result => {
      report += `### ${result.file}\n`;
      result.links.forEach(link => {
        report += `- ${link.link}: ${link.statusCode} ${link.status}\n`;
      });
      report += '\n';
    });
  }

  // Spelling check results
  report += '## Spelling Check\n\n';
  if (results.spelling.length === 0) {
    report += '✅ No spelling errors found.\n\n';
  } else {
    report += '❌ Spelling errors found:\n\n';
    results.spelling.forEach(result => {
      report += `### ${result.file}\n`;
      result.errors.forEach(error => {
        report += `- Line ${error.line}: ${error.word} (suggestions: ${error.suggestions.join(', ')})\n`;
      });
      report += '\n';
    });
  }

  // Coverage results
  report += '## Documentation Coverage\n\n';
  report += `- Total files requiring documentation: ${results.coverage.total}\n`;
  report += `- Files with documentation: ${results.coverage.documented}\n`;
  report += `- Coverage percentage: ${results.coverage.percentage.toFixed(2)}%\n\n`;

  if (results.coverage.missing.length > 0) {
    report += '### Missing Documentation\n\n';
    results.coverage.missing.forEach(item => {
      report += `- ${item}\n`;
    });
    report += '\n';
  }

  // Write report
  const reportPath = path.join(config.outputDir, 'test-report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`Report generated: ${reportPath}`);
}

// Helper function to get all markdown files recursively
function getAllMarkdownFiles(dir) {
  return getAllFiles(dir, '.md');
}

// Helper function to get all files recursively
function getAllFiles(dir, extension) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

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

// Run tests if called directly
if (require.main === module) {
  testDocs().catch(console.error);
}

module.exports = {
  testDocs,
  testMarkdown,
  testLinks,
  testSpelling,
  testCoverage
};
