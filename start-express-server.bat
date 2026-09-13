@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo WEB07-AiAgent - Express Server
echo ========================================
echo.

if not exist "package.json" (
    echo ERROR: package.json was not found.
    echo Place this file in the repository root.
    pause
    exit /b 1
)

echo Building TypeScript...
call npm run build
call npm run build:client

if errorlevel 1 (
    echo.
    echo ERROR: Build failed. Server was not started.
    pause
    exit /b 1
)

echo.
echo Starting Express server with Node.js...
echo Press Ctrl+C to stop.
echo.

node --env-file=.env dist/server.js

if errorlevel 1 (
    echo.
    echo Server stopped with an error.
    pause
)

endlocal
