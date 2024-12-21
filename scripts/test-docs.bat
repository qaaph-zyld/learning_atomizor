@echo off
setlocal enabledelayedexpansion

echo Testing Learning Atomizer Documentation...

:: Run documentation tests
node scripts/test-docs.js

:: Check for test results
if exist "docs\generated\test-results\test-report.md" (
    echo Documentation test results are available in docs/generated/test-results/test-report.md
) else (
    echo Error: Documentation test results not found
    exit /b 1
)

endlocal
