# Test Script for Windows 11 (No Admin Access)

# Environment Variables
$env:NODE_ENV = "test"
$env:PORT = "3001"
$env:MONGODB_URI = "mongodb://localhost:27017/learning-atomizer-test"
$env:REDIS_HOST = "localhost"
$env:REDIS_PORT = "6380"

# Function to run tests with retries
function Invoke-TestWithRetry {
    param(
        [string]$TestCommand,
        [int]$MaxRetries = 3,
        [int]$RetryDelay = 5
    )

    $retryCount = 0
    $success = $false

    while (-not $success -and $retryCount -lt $MaxRetries) {
        try {
            Invoke-Expression $TestCommand
            $success = $true
        }
        catch {
            $retryCount++
            Write-Host "Test failed. Attempt $retryCount of $MaxRetries"
            if ($retryCount -lt $MaxRetries) {
                Start-Sleep -Seconds $RetryDelay
            }
        }
    }

    return $success
}

# Clean test environment
Write-Host "Cleaning test environment..."
Remove-Item -Path "coverage" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".nyc_output" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "test-results" -Recurse -Force -ErrorAction SilentlyContinue

# Create test directories
Write-Host "Creating test directories..."
New-Item -ItemType Directory -Path "coverage" -Force
New-Item -ItemType Directory -Path "test-results" -Force

# Run ESLint
Write-Host "Running ESLint..."
if (-not (Invoke-TestWithRetry "npm run lint")) {
    Write-Host "ESLint checks failed"
    exit 1
}

# Run Prettier
Write-Host "Running Prettier check..."
if (-not (Invoke-TestWithRetry "npm run format:check")) {
    Write-Host "Prettier checks failed"
    exit 1
}

# Run TypeScript type checking
Write-Host "Running TypeScript checks..."
if (-not (Invoke-TestWithRetry "npm run type:check")) {
    Write-Host "TypeScript checks failed"
    exit 1
}

# Run Jest unit tests
Write-Host "Running Jest unit tests..."
if (-not (Invoke-TestWithRetry "npm run test:unit -- --coverage")) {
    Write-Host "Unit tests failed"
    exit 1
}

# Run Python tests
Write-Host "Running Python tests..."
Push-Location src/server/services
if (-not (Invoke-TestWithRetry "python -m pytest --cov=. --cov-report=xml")) {
    Write-Host "Python tests failed"
    Pop-Location
    exit 1
}
Pop-Location

# Run integration tests
Write-Host "Running integration tests..."
if (-not (Invoke-TestWithRetry "npm run test:integration")) {
    Write-Host "Integration tests failed"
    exit 1
}

# Run E2E tests
Write-Host "Running E2E tests..."
if (-not (Invoke-TestWithRetry "npm run test:e2e")) {
    Write-Host "E2E tests failed"
    exit 1
}

# Generate coverage report
Write-Host "Generating coverage report..."
if (Test-Path "coverage/lcov-report") {
    Start-Process "coverage/lcov-report/index.html"
}

Write-Host "All tests completed successfully!"
