require('dotenv').config();
const mongoose = require('mongoose');
const searchService = require('../services/SearchService');
const logger = require('../services/LoggerService');

async function initializeSearch() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info('Connected to MongoDB');

    // Initialize search service
    await searchService.initialize();
    logger.info('Search service initialized');

    // Exit successfully
    process.exit(0);
  } catch (error) {
    logger.error('Error initializing search:', error);
    process.exit(1);
  }
}

// Run initialization
initializeSearch();
