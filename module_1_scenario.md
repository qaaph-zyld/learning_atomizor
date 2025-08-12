# Phase 1 Module Development Scenario - Prompt-Answer Chain

*Following dev_framework methodology with shift-left testing and zero-investment approach*

## Overview
This document provides a step-by-step prompt-answer chain for implementing Phase 1 (Foundation & Core Infrastructure) of the Learning Atomizor project. Each prompt represents a development task, and each answer provides the expected implementation approach.

---

## Module 1.1: Development Environment Setup

### Prompt 1.1.1: Initial Project Structure Setup
**Prompt**: "Set up the basic project structure for Learning Atomizor following modular architecture principles with separate client and server directories, and initialize version control."

**Expected Answer**:
```bash
# Initialize Git repository
git init
git remote add origin https://github.com/yourusername/learning-atomizor.git

# Create modular directory structure
mkdir -p src/{client,server,shared}
mkdir -p docs/{api,architecture,guides}
mkdir -p tests/{unit,integration,e2e}
mkdir -p scripts/{deployment,development,migration}
mkdir -p config/{development,staging,production}

# Initialize package.json files
cd src/server && npm init -y
cd ../client && npm init -y
cd ../shared && npm init -y
```

### Prompt 1.1.2: Docker Development Environment
**Prompt**: "Create a Docker Compose setup for local development that includes MongoDB, Redis, and the Node.js application with hot reload capabilities."

**Expected Answer**:
```yaml
# docker-compose.yml
version: '3.8'
services:
  mongodb:
    image: mongo:6.0
    container_name: learning-atomizor-mongo
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongodb_data:/data/db

  redis:
    image: redis:7-alpine
    container_name: learning-atomizor-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  server:
    build: 
      context: ./src/server
      dockerfile: Dockerfile.dev
    container_name: learning-atomizor-server
    ports:
      - "3000:3000"
    volumes:
      - ./src/server:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - MONGODB_URI=mongodb://admin:password@mongodb:27017/learning_atomizor?authSource=admin
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - redis

volumes:
  mongodb_data:
  redis_data:
```

### Prompt 1.1.3: Environment Configuration
**Prompt**: "Create comprehensive .env.example files for different environments with all necessary environment variables."

**Expected Answer**:
```bash
# .env.example
NODE_ENV=development
PORT=3000
APP_NAME=Learning Atomizor

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/learning_atomizor
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# External APIs
OPENAI_API_KEY=your-openai-api-key
HUGGINGFACE_API_KEY=your-huggingface-api-key

# File Storage
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=100MB
ALLOWED_FILE_TYPES=pdf,docx,txt,md

# Security
CORS_ORIGIN=http://localhost:8080
RATE_LIMIT_MAX_REQUESTS=100
```

### Prompt 1.1.4: Pre-commit Hooks Setup
**Prompt**: "Set up pre-commit hooks using Husky to enforce code quality standards including linting, formatting, and basic tests."

**Expected Answer**:
```bash
# Install development dependencies
npm install --save-dev husky lint-staged prettier eslint

# Initialize Husky
npx husky init

# Create pre-commit hook
echo "npx lint-staged" > .husky/pre-commit

# Package.json additions
{
  "scripts": {
    "prepare": "husky install",
    "lint": "eslint src --ext .js,.ts",
    "format": "prettier --write src/**/*.{js,ts,json,md}",
    "test": "jest"
  },
  "lint-staged": {
    "src/**/*.{js,ts}": ["eslint --fix", "prettier --write"],
    "src/**/*.{json,md}": ["prettier --write"]
  }
}
```

---

## Module 1.2: Core Utilities & Shared Libraries

### Prompt 1.2.1: Shared Utility Library Structure
**Prompt**: "Create a shared utility library structure with common functions for logging, validation, error handling, and configuration management."

**Expected Answer**:
```javascript
// src/shared/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'learning-atomizor' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

module.exports = logger;
```

### Prompt 1.2.2: Configuration Management System
**Prompt**: "Implement a configuration management system that loads environment variables, validates required settings, and provides type-safe configuration access."

**Expected Answer**:
```javascript
// src/shared/config/index.js
const dotenv = require('dotenv');
const Joi = require('joi');

dotenv.config();

const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3000),
  MONGODB_URI: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  OPENAI_API_KEY: Joi.string().optional()
}).unknown();

const { error, value: config } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Configuration validation error: ${error.details[0].message}`);
}

module.exports = {
  app: { env: config.NODE_ENV, port: config.PORT },
  database: { mongodb: config.MONGODB_URI, redis: config.REDIS_URL },
  auth: { jwtSecret: config.JWT_SECRET },
  external: { openaiApiKey: config.OPENAI_API_KEY }
};
```

---

## Module 1.3: Database & Caching Layer

### Prompt 1.3.1: MongoDB Connection and Models
**Prompt**: "Set up MongoDB connection with connection pooling, create base models for User, Content, and LearningAtom entities."

**Expected Answer**:
```javascript
// src/server/database/connection.js
const mongoose = require('mongoose');
const logger = require('../../shared/utils/logger');
const config = require('../../shared/config');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.database.mongodb, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

module.exports = connectDB;

// src/server/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  },
  profile: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    preferences: {
      language: { type: String, default: 'en' },
      notifications: { type: Boolean, default: true }
    }
  },
  roles: [{ type: String, enum: ['user', 'admin'], default: 'user' }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
```

### Prompt 1.3.2: Redis Caching Implementation
**Prompt**: "Implement Redis caching layer with connection pooling and wrapper functions for common caching patterns."

**Expected Answer**:
```javascript
// src/server/database/redis.js
const Redis = require('ioredis');
const logger = require('../../shared/utils/logger');
const config = require('../../shared/config');

class RedisClient {
  constructor() {
    this.client = new Redis(config.database.redis, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: null,
      lazyConnect: true
    });

    this.client.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.client.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  }

  async cacheWithFallback(key, fallbackFn, ttl = 3600) {
    try {
      let value = await this.get(key);
      
      if (value === null) {
        value = await fallbackFn();
        if (value !== null) {
          await this.set(key, value, ttl);
        }
      }
      
      return value;
    } catch (error) {
      logger.error(`Cache fallback error for key ${key}:`, error);
      return await fallbackFn();
    }
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
```

---

## Next Steps After Phase 1 Completion

### Prompt 1.4: Phase 1 Validation and Testing
**Prompt**: "Create comprehensive tests for all Phase 1 modules and validate that the foundation is solid before proceeding to Phase 2 (Authentication & Security)."

**Expected Answer**:
```javascript
// tests/integration/phase1.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/server/app');
const redisClient = require('../../src/server/database/redis');

describe('Phase 1 Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database connections
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    await redisClient.connect();
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await redisClient.disconnect();
  });

  describe('Database Connectivity', () => {
    test('MongoDB connection should be established', () => {
      expect(mongoose.connection.readyState).toBe(1);
    });

    test('Redis connection should be established', async () => {
      const result = await redisClient.set('test', 'value');
      expect(result).toBe(true);
      await redisClient.del('test');
    });
  });

  describe('Configuration Management', () => {
    test('Should load configuration without errors', () => {
      const config = require('../../src/shared/config');
      expect(config.app.env).toBeDefined();
      expect(config.database.mongodb).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('Should handle validation errors gracefully', async () => {
      const response = await request(app)
        .post('/api/test-validation')
        .send({ invalid: 'data' });
      
      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
    });
  });
});
```

This completes the Phase 1 module scenario with comprehensive prompt-answer chains that follow the dev_framework methodology and zero-investment approach. Each prompt builds upon the previous one, creating a solid foundation for the Learning Atomizor platform.
