# Load Balancer API Documentation

## Overview
The Load Balancer API provides endpoints for monitoring and managing the distributed worker system.

## Endpoints

### Get Load Balancer Metrics
```http
GET /api/v1/metrics
```

#### Response
```json
{
  "activeWorkers": number,
  "maxWorkers": number,
  "totalRequests": number,
  "avgResponseTime": number,
  "errorRate": number,
  "workers": [
    {
      "id": string,
      "status": string,
      "requestCount": number,
      "errorCount": number,
      "avgResponseTime": number
    }
  ],
  "requestRate": number
}
```

### Health Check
```http
GET /api/v1/health
```

#### Response
```json
{
  "status": string,
  "timestamp": string,
  "version": string,
  "details": {
    "redis": {
      "status": string,
      "latency": number
    },
    "workers": {
      "active": number,
      "total": number
    }
  }
}
```

### Run Load Test
```http
POST /api/v1/load-test
```

#### Request Body
```json
{
  "duration": number,  // Test duration in milliseconds
  "concurrency": number  // Optional: Number of concurrent requests
}
```

#### Response
```json
{
  "testId": string,
  "startTime": string,
  "endTime": string,
  "metrics": {
    "totalRequests": number,
    "successRate": number,
    "avgResponseTime": number,
    "p95ResponseTime": number,
    "errorCount": number
  }
}
```

## Error Responses
All endpoints follow the standard error response format:

```json
{
  "error": {
    "code": string,
    "message": string,
    "details": object
  }
}
```

## Rate Limiting
- Default rate limit: 1000 requests per minute
- Health check endpoint: 60 requests per minute
- Load test endpoint: 10 requests per hour

## Authentication
All endpoints require a valid JWT token in the Authorization header:
```http
Authorization: Bearer <token>
```

## Versioning
The API follows semantic versioning. The current version is v1.
Breaking changes will be introduced in new major versions.
