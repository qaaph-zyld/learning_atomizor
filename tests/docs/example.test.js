const path = require('path');
const {
  testDocs,
  testMarkdown,
  testLinks,
  testSpelling,
  testCoverage
} = require('../../scripts/test-docs');

describe('Documentation Tests', () => {
  const docsDir = path.join(__dirname, '../../docs');

  test('should pass markdown formatting rules', async () => {
    const results = await testMarkdown();
    expect(results).toEqual([]);
  });

  test('should have valid links', async () => {
    const results = await testLinks();
    expect(results).toEqual([]);
  });

  test('should pass spell check', async () => {
    const results = await testSpelling();
    expect(results).toEqual([]);
  });

  test('should have sufficient documentation coverage', async () => {
    const coverage = await testCoverage();
    expect(coverage.percentage).toBeGreaterThanOrEqual(80);
  });

  test('should generate valid test report', async () => {
    const results = await testDocs();
    expect(results).toBeDefined();
  });
});
