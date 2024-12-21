# Local Development Setup Guide

## Prerequisites

### Required Software
1. **Node.js**
   - Download from: https://nodejs.org/
   - Install in user directory (no admin required)
   - Add to user PATH

2. **Python**
   - Download from: https://www.python.org/
   - Install in user directory (no admin required)
   - Add to user PATH

3. **MongoDB**
   - Download MongoDB Community Server ZIP
   - Extract to: %USERPROFILE%\mongodb
   - Create data directory: %USERPROFILE%\mongodb\data

4. **Redis**
   - Download Redis for Windows ZIP
   - Extract to: %USERPROFILE%\redis
   - No installation required

## Setup Instructions

### 1. Environment Setup
1. Clone the repository
2. Open PowerShell (non-admin)
3. Navigate to project directory

### 2. Install Dependencies
```powershell
# Install npm dependencies
npm install --no-optional

# Install Python dependencies
pip install -r src/server/services/requirements.txt --user
```

### 3. Configure Environment
1. Create `.env` file in project root:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/learning-atomizer
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 4. Start Development Environment
```powershell
# Run setup script
.\scripts\local-setup.ps1
```

### 5. Run Tests
```powershell
# Run test script
.\scripts\test.ps1
```

### 6. Build for Production
```powershell
# Run build script
.\scripts\build.ps1
```

## Development Workflow

### Starting the Application
1. Open PowerShell
2. Navigate to project directory
3. Run: `.\scripts\local-setup.ps1`
4. Access:
   - Frontend: http://localhost:8080
   - API: http://localhost:3000

### Running Tests
1. Open PowerShell
2. Navigate to project directory
3. Run: `.\scripts\test.ps1`
4. View test results in `coverage` directory

### Building for Production
1. Open PowerShell
2. Navigate to project directory
3. Run: `.\scripts\build.ps1`
4. Find build at: `build/learning-atomizer.zip`

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```powershell
   # Check which process is using the port
   netstat -ano | findstr :PORT_NUMBER
   ```

2. **MongoDB Connection Failed**
   - Ensure MongoDB is running
   - Check data directory permissions
   - Verify connection string

3. **Redis Connection Failed**
   - Ensure Redis is running
   - Check port availability
   - Verify connection settings

4. **Node.js/Python Path Issues**
   - Check user PATH environment variable
   - Restart PowerShell after PATH changes
   - Use `where` command to verify locations

### Getting Help
- Check the logs in `logs` directory
- Review error messages in PowerShell
- Consult project documentation
- Open an issue on GitHub

## Best Practices

1. **Version Control**
   - Always work in a feature branch
   - Commit frequently
   - Pull latest changes before starting work

2. **Testing**
   - Write tests for new features
   - Run full test suite before commits
   - Maintain test coverage

3. **Code Quality**
   - Follow ESLint rules
   - Use Prettier for formatting
   - Document new functions/components

4. **Security**
   - Never commit sensitive data
   - Use environment variables
   - Keep dependencies updated

## Updating Dependencies

### Node.js Dependencies
```powershell
# Update npm packages
npm update

# Check for outdated packages
npm outdated
```

### Python Dependencies
```powershell
# Update pip packages
pip install --upgrade -r requirements.txt --user

# Check for outdated packages
pip list --outdated
```

## Maintenance

### Cleaning Up
```powershell
# Clean node_modules
Remove-Item -Recurse -Force node_modules
npm install

# Clean Python cache
Remove-Item -Recurse -Force **/__pycache__
```

### Logs
- Development logs: `logs/development.log`
- Test logs: `logs/test.log`
- Error logs: `logs/error.log`

### Temporary Files
- Located in `temp` directory
- Cleaned automatically on startup
- Manual cleanup: `Remove-Item -Recurse -Force temp/*`
