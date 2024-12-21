# Learning Atomizer API Documentation

## API Overview
The Learning Atomizer API provides a comprehensive set of endpoints for content management, processing, and delivery. This RESTful API follows OpenAPI 3.0 specifications.

## Base URL
```
Production: https://api.learning-atomizer.com
Development: http://localhost:3000
```

## Authentication
All API requests require authentication using JWT tokens.

```http
Authorization: Bearer <token>
```

## Content Management

### Create Content
```http
POST /api/content
Content-Type: application/json

{
  "title": "string",
  "content": "string",
  "type": "article|video|document",
  "tags": ["string"],
  "metadata": {
    "author": "string",
    "source": "string",
    "language": "string"
  }
}
```

### Get Content
```http
GET /api/content/{id}
```

### Update Content
```http
PUT /api/content/{id}
Content-Type: application/json

{
  "title": "string",
  "content": "string",
  "tags": ["string"]
}
```

### Delete Content
```http
DELETE /api/content/{id}
```

### Search Content
```http
GET /api/content/search
Query Parameters:
- q: search query
- type: content type
- tags: comma-separated tags
- page: page number
- limit: items per page
```

## User Management

### Register User
```http
POST /api/users/register
Content-Type: application/json

{
  "email": "string",
  "password": "string",
  "name": "string",
  "role": "user|admin"
}
```

### Login
```http
POST /api/users/login
Content-Type: application/json

{
  "email": "string",
  "password": "string"
}
```

### Get User Profile
```http
GET /api/users/profile
```

### Update Profile
```http
PUT /api/users/profile
Content-Type: application/json

{
  "name": "string",
  "preferences": object
}
```

## Workspace Management

### Create Workspace
```http
POST /api/workspaces
Content-Type: application/json

{
  "name": "string",
  "description": "string",
  "members": ["userId"]
}
```

### Get Workspace
```http
GET /api/workspaces/{id}
```

### Update Workspace
```http
PUT /api/workspaces/{id}
Content-Type: application/json

{
  "name": "string",
  "description": "string"
}
```

### Delete Workspace
```http
DELETE /api/workspaces/{id}
```

## Content Processing

### Atomize Content
```http
POST /api/process/atomize
Content-Type: application/json

{
  "contentId": "string",
  "options": {
    "granularity": "paragraph|sentence|concept",
    "format": "text|html|markdown"
  }
}
```

### Generate Summary
```http
POST /api/process/summarize
Content-Type: application/json

{
  "contentId": "string",
  "options": {
    "length": "short|medium|long",
    "format": "text|html|markdown"
  }
}
```

### Extract Keywords
```http
POST /api/process/keywords
Content-Type: application/json

{
  "contentId": "string",
  "options": {
    "count": number,
    "type": "single|phrase"
  }
}
```

## Analytics

### Get Content Analytics
```http
GET /api/analytics/content/{id}
Query Parameters:
- period: day|week|month
- metrics: views,shares,completions
```

### Get User Analytics
```http
GET /api/analytics/users
Query Parameters:
- period: day|week|month
- metrics: active,engagement,progress
```

### Get Platform Analytics
```http
GET /api/analytics/platform
Query Parameters:
- period: day|week|month
- metrics: usage,performance,errors
```

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": object
  }
}
```

### Common Error Codes
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 429: Too Many Requests
- 500: Internal Server Error

## Rate Limiting
- Rate limit: 1000 requests per minute
- Rate limit header: X-RateLimit-Limit
- Remaining requests: X-RateLimit-Remaining
- Reset time: X-RateLimit-Reset

## Webhooks

### Register Webhook
```http
POST /api/webhooks
Content-Type: application/json

{
  "url": "string",
  "events": ["content.created", "content.updated"],
  "secret": "string"
}
```

### Webhook Events
- content.created
- content.updated
- content.deleted
- user.registered
- user.updated
- workspace.created
- workspace.updated
- process.completed

### Webhook Payload
```json
{
  "event": "string",
  "timestamp": "string",
  "data": object
}
```

## SDK Support
- JavaScript: @learning-atomizer/sdk
- Python: learning-atomizer-py
- Java: learning-atomizer-java
- C#: LearningAtomizer.SDK

## Best Practices
1. Use appropriate HTTP methods
2. Include error handling
3. Implement rate limiting
4. Cache responses
5. Use pagination
6. Validate input
7. Handle timeouts
8. Monitor API usage

## Security
1. Use HTTPS only
2. Implement authentication
3. Validate JWT tokens
4. Rate limit requests
5. Sanitize input
6. Encrypt sensitive data
7. Monitor for abuse

## Support
- Email: api@learning-atomizer.com
- Documentation: https://docs.learning-atomizer.com
- Status: https://status.learning-atomizer.com
