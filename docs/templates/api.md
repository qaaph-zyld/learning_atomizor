# {{ endpoint }}

## Overview
{{ description }}

## Endpoint
```http
{{ method }} {{ path }}
```

## Authentication
{{ authentication }}

## Request

### Headers
```http
{{ headers }}
```

### Parameters
{{#if queryParameters}}
#### Query Parameters
| Name | Type | Required | Description |
|------|------|----------|-------------|
{{#each queryParameters}}
| {{ name }} | {{ type }} | {{ required }} | {{ description }} |
{{/each}}
{{/if}}

{{#if pathParameters}}
#### Path Parameters
| Name | Type | Required | Description |
|------|------|----------|-------------|
{{#each pathParameters}}
| {{ name }} | {{ type }} | {{ required }} | {{ description }} |
{{/each}}
{{/if}}

{{#if requestBody}}
### Request Body
```json
{{ requestBody }}
```

#### Fields
| Name | Type | Required | Description |
|------|------|----------|-------------|
{{#each requestFields}}
| {{ name }} | {{ type }} | {{ required }} | {{ description }} |
{{/each}}
{{/if}}

## Response

### Success Response
```http
HTTP/1.1 {{ successCode }} {{ successStatus }}
```

```json
{{ successResponse }}
```

#### Fields
| Name | Type | Description |
|------|------|-------------|
{{#each responseFields}}
| {{ name }} | {{ type }} | {{ description }} |
{{/each}}

### Error Responses
{{#each errorResponses}}
#### {{ code }} {{ status }}
```http
HTTP/1.1 {{ code }} {{ status }}
```

```json
{{ response }}
```
{{/each}}

## Examples

### Request Example
```http
{{ requestExample }}
```

### Response Example
```http
{{ responseExample }}
```

## Notes
{{ notes }}

## Related Endpoints
{{#each relatedEndpoints}}
- [{{ name }}]({{ link }})
{{/each}}
