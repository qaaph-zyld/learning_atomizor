@echo off
setlocal enabledelayedexpansion

echo Generating Learning Atomizer Documentation...

:: Create necessary directories
if not exist "docs\generated\api" mkdir "docs\generated\api"
if not exist "docs\generated\components" mkdir "docs\generated\components"
if not exist "docs\generated\types" mkdir "docs\generated\types"
if not exist "docs\generated\coverage" mkdir "docs\generated\coverage"

:: Generate API documentation
echo Generating API documentation...
node scripts/generate-docs.js

:: Copy static documentation
echo Copying static documentation...
xcopy /s /y "docs\templates\*" "docs\generated\"

:: Generate swagger documentation
echo Generating Swagger documentation...
if exist "src\server\routes\*.js" (
    node scripts/generate-swagger.js
)

:: Generate TypeScript documentation
echo Generating TypeScript documentation...
if exist "src\client\src\types\*.ts" (
    node scripts/generate-typedoc.js
)

:: Generate component documentation
echo Generating component documentation...
if exist "src\client\src\components\*.vue" (
    node scripts/generate-component-docs.js
)

:: Generate coverage report
echo Generating documentation coverage report...
node scripts/generate-coverage.js

echo Documentation generation complete!
echo Documentation is available in the docs/generated directory

endlocal
