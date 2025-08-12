

# AI Coder Development Rules

## Environment Setup Rules
1. **ALWAYS create a virtual environment** before installing any Python dependencies using `python -m venv venv` and `source venv/bin/activate` (Linux/Mac) or `venv\Scripts\activate` (Windows)
2. Install dependencies from requirements.txt files only, never globally
3. Use .env files for environment variables and add .env to .gitignore
4. Verify all services (databases, APIs) are accessible before starting development

## Code Structure Rules
5. Follow the established modular architecture - each service in its own directory
6. Keep functions small and single-purpose (max 50 lines)
7. Use meaningful variable and function names following snake_case for Python, camelCase for JavaScript
8. Implement proper separation of concerns between business logic, data access, and API layers

## Testing Rules
9. Write unit tests for all new functions with minimum 80% code coverage
10. Create integration tests for all API endpoints
11. Run tests before committing code with `pytest` or `npm test`
12. Fix all failing tests before pushing to repository

## Documentation Rules
13. Add docstrings to all Python functions and classes
14. Update README.md for any significant changes
15. Document all API endpoints with OpenAPI/Swagger specifications
16. Keep comments concise and explain WHY, not WHAT

## Security Rules
17. Never commit API keys, passwords, or sensitive data to repository
18. Validate all user inputs on both client and server sides
19. Use parameterized queries to prevent SQL injection
20. Implement proper authentication and authorization for all protected endpoints

## Performance Rules
21. Implement database indexing for frequently queried fields
22. Use caching (Redis) for expensive operations
23. Optimize database queries and avoid N+1 query problems
24. Implement pagination for large datasets

## Git Workflow Rules
25. Create descriptive branch names: `feature/feature-name` or `fix/issue-description`
26. Write clear commit messages: `type(scope): description`
27. Pull latest changes before starting new work
28. Create pull requests for all changes with proper description

## Code Quality Rules
29. Follow PEP 8 for Python code and ESLint rules for JavaScript
30. Use type hints in Python for better code clarity
31. Implement proper error handling with try-catch blocks
32. Remove unused imports and variables

## API Design Rules
33. Use RESTful API conventions with proper HTTP methods
34. Return consistent JSON response structures
35. Implement proper HTTP status codes
36. Add rate limiting to all public endpoints

## Error Handling Rules
37. Use structured error responses with error codes and messages
38. Log all errors with sufficient context for debugging
39. Implement graceful degradation for external service failures
40. Never expose stack traces or sensitive information in API responses