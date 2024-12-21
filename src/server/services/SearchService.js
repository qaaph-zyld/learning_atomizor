const { Client } = require('@elastic/elasticsearch');
const natural = require('natural');
const Content = require('../models/Content');
const cache = require('./CacheService');
const logger = require('./LoggerService');
const mlService = require('./MLService');

class SearchService {
  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD
      }
    });
    
    this.tokenizer = new natural.WordTokenizer();
    this.CACHE_TTL = 1800; // 30 minutes
    this.INDEX_NAME = 'learning_content';
    this.SEARCH_FIELDS = [
      'title^3',
      'description^2',
      'content',
      'tags^2',
      'metadata'
    ];
  }

  /**
   * Initialize Elasticsearch indices and mappings
   */
  async initialize() {
    try {
      const indexExists = await this.client.indices.exists({
        index: this.INDEX_NAME
      });

      if (!indexExists) {
        await this.createIndex();
        await this.indexExistingContent();
      }

      logger.info('Search service initialized successfully');
    } catch (error) {
      logger.error('Error initializing search service:', error);
      throw error;
    }
  }

  /**
   * Create Elasticsearch index with mappings
   */
  async createIndex() {
    await this.client.indices.create({
      index: this.INDEX_NAME,
      body: {
        settings: {
          analysis: {
            analyzer: {
              custom_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: [
                  'lowercase',
                  'stop',
                  'snowball',
                  'synonym'
                ]
              }
            },
            filter: {
              synonym: {
                type: 'synonym',
                synonyms_path: 'synonyms.txt'
              }
            }
          }
        },
        mappings: {
          properties: {
            title: {
              type: 'text',
              analyzer: 'custom_analyzer',
              fields: {
                keyword: {
                  type: 'keyword'
                }
              }
            },
            description: {
              type: 'text',
              analyzer: 'custom_analyzer'
            },
            content: {
              type: 'text',
              analyzer: 'custom_analyzer'
            },
            tags: {
              type: 'keyword'
            },
            metadata: {
              type: 'object'
            },
            workspace: {
              type: 'keyword'
            },
            author: {
              type: 'keyword'
            },
            createdAt: {
              type: 'date'
            },
            updatedAt: {
              type: 'date'
            },
            status: {
              type: 'keyword'
            },
            complexity: {
              type: 'float'
            },
            readingTime: {
              type: 'integer'
            },
            vector: {
              type: 'dense_vector',
              dims: 128
            }
          }
        }
      }
    });
  }

  /**
   * Index existing content from MongoDB
   */
  async indexExistingContent() {
    const content = await Content.find({ status: 'published' });
    
    for (const item of content) {
      await this.indexContent(item);
    }
  }

  /**
   * Index a single content item
   */
  async indexContent(content) {
    const vector = await mlService.extractFeatures(content);
    
    await this.client.index({
      index: this.INDEX_NAME,
      id: content._id.toString(),
      body: {
        title: content.title,
        description: content.description,
        content: content.content,
        tags: content.tags,
        metadata: content.metadata,
        workspace: content.workspace.toString(),
        author: content.author.toString(),
        createdAt: content.createdAt,
        updatedAt: content.updatedAt,
        status: content.status,
        complexity: content.processingMetrics?.complexity || 0,
        readingTime: content.processingMetrics?.readingTime || 0,
        vector
      }
    });
  }

  /**
   * Perform advanced search
   */
  async search(params) {
    const {
      query,
      workspace,
      filters = {},
      sort = {},
      page = 1,
      limit = 10,
      useML = true
    } = params;

    const cacheKey = `search:${workspace}:${JSON.stringify({
      query, filters, sort, page, limit, useML
    })}`;

    try {
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Cache hit for search', { query, workspace });
        return cached;
      }

      // Build search query
      const searchQuery = this.buildSearchQuery(query, workspace, filters, sort, useML);

      // Execute search
      const response = await this.client.search({
        index: this.INDEX_NAME,
        body: searchQuery,
        from: (page - 1) * limit,
        size: limit
      });

      // Process results
      const results = this.processSearchResults(response);

      // Cache results
      await cache.set(cacheKey, results, this.CACHE_TTL);

      return results;
    } catch (error) {
      logger.error('Search error:', error);
      throw error;
    }
  }

  /**
   * Build Elasticsearch query
   */
  buildSearchQuery(query, workspace, filters, sort, useML) {
    const searchQuery = {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: this.SEARCH_FIELDS,
                type: 'best_fields',
                fuzziness: 'AUTO'
              }
            },
            {
              term: {
                workspace
              }
            },
            {
              term: {
                status: 'published'
              }
            }
          ]
        }
      }
    };

    // Add filters
    if (Object.keys(filters).length > 0) {
      searchQuery.query.bool.filter = this.buildFilters(filters);
    }

    // Add sort
    if (Object.keys(sort).length > 0) {
      searchQuery.sort = this.buildSort(sort);
    }

    // Add ML-based scoring if enabled
    if (useML) {
      searchQuery.query.bool.should = [
        {
          script_score: {
            query: { match_all: {} },
            script: {
              source: "cosineSimilarity(params.query_vector, 'vector') + 1.0",
              params: {
                query_vector: mlService.extractFeatures({ title: query })
              }
            }
          }
        }
      ];
    }

    return searchQuery;
  }

  /**
   * Build Elasticsearch filters
   */
  buildFilters(filters) {
    const elasticFilters = [];

    Object.entries(filters).forEach(([field, value]) => {
      if (Array.isArray(value)) {
        elasticFilters.push({
          terms: {
            [field]: value
          }
        });
      } else if (typeof value === 'object') {
        if (value.gte || value.lte) {
          elasticFilters.push({
            range: {
              [field]: {
                ...(value.gte && { gte: value.gte }),
                ...(value.lte && { lte: value.lte })
              }
            }
          });
        }
      } else {
        elasticFilters.push({
          term: {
            [field]: value
          }
        });
      }
    });

    return elasticFilters;
  }

  /**
   * Build Elasticsearch sort
   */
  buildSort(sort) {
    return Object.entries(sort).map(([field, order]) => ({
      [field]: {
        order: order.toLowerCase()
      }
    }));
  }

  /**
   * Process search results
   */
  processSearchResults(response) {
    const hits = response.hits.hits;
    
    return {
      total: response.hits.total.value,
      hits: hits.map(hit => ({
        id: hit._id,
        score: hit._score,
        ...hit._source
      })),
      aggregations: response.aggregations
    };
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(query, workspace) {
    const cacheKey = `suggestions:${workspace}:${query}`;

    try {
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) return cached;

      const response = await this.client.search({
        index: this.INDEX_NAME,
        body: {
          suggest: {
            title_suggest: {
              prefix: query,
              completion: {
                field: 'title.keyword',
                size: 5
              }
            },
            tag_suggest: {
              prefix: query,
              completion: {
                field: 'tags',
                size: 3
              }
            }
          }
        }
      });

      const suggestions = {
        titles: response.suggest.title_suggest[0].options.map(option => option.text),
        tags: response.suggest.tag_suggest[0].options.map(option => option.text)
      };

      // Cache suggestions
      await cache.set(cacheKey, suggestions, this.CACHE_TTL);

      return suggestions;
    } catch (error) {
      logger.error('Error getting suggestions:', error);
      throw error;
    }
  }

  /**
   * Handle content updates
   */
  async handleContentUpdate(content) {
    try {
      await this.indexContent(content);
      await this.invalidateContentCache(content);
    } catch (error) {
      logger.error('Error handling content update:', error);
      throw error;
    }
  }

  /**
   * Handle content deletion
   */
  async handleContentDeletion(contentId) {
    try {
      await this.client.delete({
        index: this.INDEX_NAME,
        id: contentId.toString()
      });
      await this.invalidateContentCache({ _id: contentId });
    } catch (error) {
      logger.error('Error handling content deletion:', error);
      throw error;
    }
  }

  /**
   * Invalidate content cache
   */
  async invalidateContentCache(content) {
    const patterns = [
      `search:${content.workspace}:*`,
      `suggestions:${content.workspace}:*`
    ];

    await Promise.all(
      patterns.map(pattern => cache.deletePattern(pattern))
    );
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(workspace, timeframe = '7d') {
    try {
      const response = await this.client.search({
        index: 'search_logs',
        body: {
          query: {
            bool: {
              must: [
                { term: { workspace } },
                {
                  range: {
                    timestamp: {
                      gte: `now-${timeframe}`
                    }
                  }
                }
              ]
            }
          },
          aggs: {
            popular_queries: {
              terms: {
                field: 'query.keyword',
                size: 10
              }
            },
            query_count_over_time: {
              date_histogram: {
                field: 'timestamp',
                calendar_interval: '1d'
              }
            }
          }
        }
      });

      return {
        popularQueries: response.aggregations.popular_queries.buckets,
        queryTrends: response.aggregations.query_count_over_time.buckets
      };
    } catch (error) {
      logger.error('Error getting search analytics:', error);
      throw error;
    }
  }
}

module.exports = new SearchService();
