const natural = require('natural');
const stopwords = require('stopwords').english;
const cache = require('./CacheService');
const logger = require('./LoggerService');

class MLService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    this.stemmer = natural.PorterStemmer;
    this.CACHE_TTL = 3600; // 1 hour
  }

  /**
   * Extract features from content
   */
  extractFeatures(content) {
    const cacheKey = `features:${content._id}`;
    
    try {
      // Check cache
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const features = {
        textFeatures: this.extractTextFeatures(content),
        tagFeatures: this.extractTagFeatures(content.tags),
        complexityFeatures: this.extractComplexityFeatures(content),
        semanticFeatures: this.extractSemanticFeatures(content),
        structuralFeatures: this.extractStructuralFeatures(content)
      };

      // Cache results
      cache.set(cacheKey, features, this.CACHE_TTL);
      return features;
    } catch (error) {
      logger.error('Error extracting features:', error);
      return {};
    }
  }

  /**
   * Extract features from text content
   */
  extractTextFeatures(content) {
    const text = `${content.title} ${content.description}`;
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    const filteredTokens = tokens.filter(token => 
      !stopwords.includes(token) && token.length > 2
    );
    
    // Calculate term frequencies
    const termFreq = {};
    filteredTokens.forEach(token => {
      const stem = this.stemmer.stem(token);
      termFreq[stem] = (termFreq[stem] || 0) + 1;
    });

    // Normalize frequencies
    const totalTerms = Object.values(termFreq).reduce((a, b) => a + b, 0);
    Object.keys(termFreq).forEach(term => {
      termFreq[term] /= totalTerms;
    });

    return termFreq;
  }

  /**
   * Extract features from tags
   */
  extractTagFeatures(tags) {
    if (!tags || !Array.isArray(tags)) return {};

    const features = {};
    tags.forEach(tag => {
      features[`tag_${tag.toLowerCase()}`] = 1;
    });

    return features;
  }

  /**
   * Extract complexity features
   */
  extractComplexityFeatures(content) {
    const { processingMetrics } = content;
    if (!processingMetrics) return {};

    return {
      readingLevel: this.normalizeValue(processingMetrics.readingLevel, 0, 12),
      conceptDensity: this.normalizeValue(processingMetrics.conceptDensity, 0, 1),
      technicalTerms: this.normalizeValue(processingMetrics.technicalTermCount, 0, 100)
    };
  }

  /**
   * Extract semantic features using NLP
   */
  extractSemanticFeatures(content) {
    const text = `${content.title} ${content.description}`;
    
    try {
      // Extract entities
      const entities = natural.BayesClassifier.extractEntities(text);
      
      // Extract key phrases
      const phrases = this.extractKeyPhrases(text);
      
      // Calculate sentiment
      const sentiment = new natural.SentimentAnalyzer(
        'English', 
        this.stemmer,
        'afinn'
      ).getSentiment(this.tokenizer.tokenize(text));

      return {
        entities: this.normalizeEntities(entities),
        phrases: this.normalizeKeyPhrases(phrases),
        sentiment: this.normalizeValue(sentiment, -1, 1)
      };
    } catch (error) {
      logger.error('Error extracting semantic features:', error);
      return {};
    }
  }

  /**
   * Extract structural features
   */
  extractStructuralFeatures(content) {
    return {
      hasImages: content.hasImages ? 1 : 0,
      hasVideos: content.hasVideos ? 1 : 0,
      hasCode: content.hasCode ? 1 : 0,
      hasAttachments: content.hasAttachments ? 1 : 0,
      sectionCount: this.normalizeValue(content.sections?.length || 0, 0, 20)
    };
  }

  /**
   * Extract key phrases from text
   */
  extractKeyPhrases(text) {
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    const ngrams = natural.NGrams;
    
    // Generate bigrams and trigrams
    const bigrams = ngrams.bigrams(tokens);
    const trigrams = ngrams.trigrams(tokens);
    
    // Score phrases based on frequency and position
    const phrases = [...bigrams, ...trigrams].map(gram => ({
      phrase: gram.join(' '),
      score: this.calculatePhraseScore(gram, tokens)
    }));

    return phrases
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => p.phrase);
  }

  /**
   * Calculate score for a phrase
   */
  calculatePhraseScore(gram, tokens) {
    const phrase = gram.join(' ');
    const firstOccurrence = tokens.indexOf(gram[0]);
    
    return (
      (1 / (firstOccurrence + 1)) * // Position weight
      (gram.length / tokens.length) * // Length weight
      this.calculatePhraseCohesion(gram, tokens) // Cohesion weight
    );
  }

  /**
   * Calculate phrase cohesion
   */
  calculatePhraseCohesion(gram, tokens) {
    const phrase = gram.join(' ');
    let count = 0;
    
    for (let i = 0; i <= tokens.length - gram.length; i++) {
      const window = tokens.slice(i, i + gram.length).join(' ');
      if (window === phrase) count++;
    }
    
    return count / (tokens.length - gram.length + 1);
  }

  /**
   * Normalize entities extracted from text
   */
  normalizeEntities(entities) {
    const normalized = {};
    
    entities.forEach(entity => {
      const type = entity.type.toLowerCase();
      normalized[`entity_${type}`] = (normalized[`entity_${type}`] || 0) + 1;
    });

    // Normalize counts
    const total = Object.values(normalized).reduce((a, b) => a + b, 0);
    if (total > 0) {
      Object.keys(normalized).forEach(key => {
        normalized[key] /= total;
      });
    }

    return normalized;
  }

  /**
   * Normalize key phrases
   */
  normalizeKeyPhrases(phrases) {
    return phrases.reduce((features, phrase, index) => {
      features[`phrase_${index}`] = 1;
      return features;
    }, {});
  }

  /**
   * Normalize a value to range [0,1]
   */
  normalizeValue(value, min, max) {
    if (typeof value !== 'number') return 0;
    return (value - min) / (max - min);
  }

  /**
   * Compute cosine similarity between feature vectors
   */
  computeCosineSimilarity(features1, features2) {
    const keys = new Set([
      ...Object.keys(features1),
      ...Object.keys(features2)
    ]);

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    keys.forEach(key => {
      const val1 = features1[key] || 0;
      const val2 = features2[key] || 0;
      
      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    });

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (norm1 * norm2);
  }

  /**
   * Update ML models with new content
   */
  async updateModels(content) {
    try {
      // Update TF-IDF model
      this.tfidf.addDocument(
        `${content.title} ${content.description}`
      );

      // Clear feature cache
      await cache.delete(`features:${content._id}`);

      logger.info('ML models updated with new content', { contentId: content._id });
    } catch (error) {
      logger.error('Error updating ML models:', error);
    }
  }
}

module.exports = new MLService();
