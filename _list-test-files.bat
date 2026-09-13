@echo off
setlocal
cd /d "%~dp0"

set "OUTPUT_FILE=test-files.txt"

if exist "%OUTPUT_FILE%" del /q "%OUTPUT_FILE%"

if not exist ".test-dist\tests" (
    echo ERROR: .test-dist\tests folder was not found.
    echo Run the test compile step first if needed.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-ChildItem -LiteralPath '.test-dist\tests' -File -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName.Substring((Get-Location).Path.Length + 1) } | Set-Content -LiteralPath '%OUTPUT_FILE%' -Encoding UTF8"

if errorlevel 1 (
    echo.
    echo Failed to create %OUTPUT_FILE%.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo TEST FILE LIST CREATED
echo ==========================================
echo %CD%\%OUTPUT_FILE%
echo.
type "%OUTPUT_FILE%"
echo.
pause
exit /b 0
