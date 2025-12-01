/**
 * NLPService - Pure JavaScript rule-based content atomization
 * Replaces Python/spaCy dependency for Micro-MVP
 */
const natural = require('natural');
const stopwords = require('stopwords').english;

const tokenizer = new natural.SentenceTokenizer();
const wordTokenizer = new natural.WordTokenizer();

class NLPService {
  /**
   * Process content and return atomized result
   * @param {string} content - Raw text content to atomize
   * @returns {Promise<Object>} - Atomized content with title, summary, keywords, duration, metrics
   */
  static async processContent(content) {
    const startTime = process.hrtime.bigint();
    const memBefore = process.memoryUsage().heapUsed;

    // Normalize whitespace
    const normalizedContent = content.replace(/\s+/g, ' ').trim();

    // Sentence segmentation
    const sentences = tokenizer.tokenize(normalizedContent);

    // Title: first sentence (truncated if too long)
    const title = sentences.length > 0
      ? sentences[0].substring(0, 120)
      : 'Untitled';

    // Summary: first 3 sentences
    const summary = sentences.slice(0, 3).join(' ');

    // Keywords: frequency-based extraction (excluding stopwords)
    const keywords = NLPService.extractKeywords(normalizedContent, 10);

    // Duration: words / 200 wpm, capped at 180 seconds (3 min per model constraint)
    const wordCount = normalizedContent.split(/\s+/).length;
    const durationSeconds = Math.min((wordCount / 200) * 60, 180);

    // Metrics
    const endTime = process.hrtime.bigint();
    const processingTimeMs = Number(endTime - startTime) / 1e6;
    const memAfter = process.memoryUsage().heapUsed;
    const memoryUsageMB = (memAfter - memBefore) / (1024 * 1024);

    return {
      title,
      summary,
      keywords,
      duration: Math.round(durationSeconds),
      metrics: {
        accuracy_score: 0.85, // Placeholder for rule-based
        memory_usage: parseFloat(memoryUsageMB.toFixed(2)),
        processing_time_ms: parseFloat(processingTimeMs.toFixed(2)),
        word_count: wordCount,
        sentence_count: sentences.length
      }
    };
  }

  /**
   * Extract top N keywords by frequency, excluding stopwords
   * @param {string} text
   * @param {number} topN
   * @returns {string[]}
   */
  static extractKeywords(text, topN = 10) {
    const words = wordTokenizer.tokenize(text.toLowerCase());
    const stopwordSet = new Set(stopwords.map(w => w.toLowerCase()));

    // Count frequencies
    const freq = {};
    for (const word of words) {
      if (word.length < 3 || stopwordSet.has(word) || /^\d+$/.test(word)) continue;
      freq[word] = (freq[word] || 0) + 1;
    }

    // Sort by frequency descending
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word]) => word);

    return sorted;
  }
}

module.exports = NLPService;
