# Local Development Setup Script for Windows 11 (No Admin Access)

# Environment Variables
$env:NODE_ENV = "development"
$env:PORT = "3000"
$env:MONGODB_URI = "mongodb://localhost:27017/learning-atomizer"
$env:REDIS_HOST = "localhost"
$env:REDIS_PORT = "6379"

# Function to check if a port is available
function Test-Port {
    param($Port)
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

# Function to check if a process is running
function Test-Process {
    param($Name)
    return Get-Process $Name -ErrorAction SilentlyContinue
}

# Check Node.js installation
Write-Host "Checking Node.js installation..."
try {
    $nodeVersion = node -v
    Write-Host "Node.js version: $nodeVersion"
}
catch {
    Write-Host "Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
}

# Check Python installation
Write-Host "Checking Python installation..."
try {
    $pythonVersion = python --version
    Write-Host "Python version: $pythonVersion"
}
catch {
    Write-Host "Python is not installed. Please install Python from https://www.python.org/"
    exit 1
}

# Check npm dependencies
Write-Host "Checking npm dependencies..."
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies..."
    npm install --no-optional
}

# Check Python dependencies
Write-Host "Checking Python dependencies..."
if (Test-Path "src/server/services/requirements.txt") {
    Write-Host "Installing Python dependencies..."
    pip install -r src/server/services/requirements.txt --user
}

# Check ports
Write-Host "Checking port availability..."
$requiredPorts = @(3000, 27017, 6379, 8080)
foreach ($port in $requiredPorts) {
    if (-not (Test-Port $port)) {
        Write-Host "Port $port is already in use. Please free up this port."
        exit 1
    }
}

# Create necessary directories
Write-Host "Creating necessary directories..."
$directories = @(
    "data/mongodb",
    "data/redis",
    "logs",
    "temp"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force
    }
}

# Start development servers
Write-Host "Starting development servers..."

# Start MongoDB (if installed locally)
if (Test-Path "$env:USERPROFILE\mongodb\bin\mongod.exe") {
    Start-Process -FilePath "$env:USERPROFILE\mongodb\bin\mongod.exe" -ArgumentList "--dbpath", "data/mongodb", "--port", "27017"
    Write-Host "MongoDB started on port 27017"
}
else {
    Write-Host "MongoDB not found locally. Please ensure MongoDB is running on port 27017"
}

# Start Redis (if installed locally)
if (Test-Path "$env:USERPROFILE\redis\redis-server.exe") {
    Start-Process -FilePath "$env:USERPROFILE\redis\redis-server.exe" -ArgumentList "--port", "6379"
    Write-Host "Redis started on port 6379"
}
else {
    Write-Host "Redis not found locally. Please ensure Redis is running on port 6379"
}

# Start development servers
Write-Host "Starting application servers..."

# Start backend server
Start-Process npm -ArgumentList "run dev:server" -NoNewWindow
Write-Host "Backend server started on port 3000"

# Start frontend server
Start-Process npm -ArgumentList "run dev:client" -NoNewWindow
Write-Host "Frontend server started on port 8080"

Write-Host "Local development environment is ready!"
Write-Host "Access the application at http://localhost:8080"
Write-Host "API endpoints available at http://localhost:3000"
