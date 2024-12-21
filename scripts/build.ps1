# Build Script for Windows 11 (No Admin Access)

# Environment Variables
$env:NODE_ENV = "production"

# Function to handle errors
function Handle-Error {
    param($ErrorMessage)
    Write-Host "Error: $ErrorMessage" -ForegroundColor Red
    exit 1
}

# Clean build directories
Write-Host "Cleaning build directories..."
Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "build" -Recurse -Force -ErrorAction SilentlyContinue

# Create build directories
Write-Host "Creating build directories..."
New-Item -ItemType Directory -Path "dist" -Force
New-Item -ItemType Directory -Path "build" -Force

# Install production dependencies
Write-Host "Installing production dependencies..."
try {
    npm ci --production --no-optional
}
catch {
    Handle-Error "Failed to install production dependencies: $_"
}

# Build server
Write-Host "Building server..."
try {
    npm run build:server
}
catch {
    Handle-Error "Failed to build server: $_"
}

# Build client
Write-Host "Building client..."
try {
    npm run build:client
}
catch {
    Handle-Error "Failed to build client: $_"
}

# Copy configuration files
Write-Host "Copying configuration files..."
Copy-Item "config/*" -Destination "dist/config" -Recurse -Force
Copy-Item "package.json" -Destination "dist" -Force
Copy-Item "package-lock.json" -Destination "dist" -Force

# Create production archive
Write-Host "Creating production archive..."
Compress-Archive -Path "dist/*" -DestinationPath "build/learning-atomizer.zip" -Force

Write-Host "Build completed successfully!"
Write-Host "Production build available at: build/learning-atomizer.zip"
