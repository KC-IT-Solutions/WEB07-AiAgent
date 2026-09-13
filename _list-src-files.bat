@echo off
setlocal
cd /d "%~dp0"

set "OUTPUT_FILE=src-files.txt"

if exist "%OUTPUT_FILE%" del /q "%OUTPUT_FILE%"

if not exist "src" (
    echo ERROR: src folder was not found.
    echo Expected project root: %CD%
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-ChildItem -LiteralPath 'src' -File -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName.Substring((Get-Location).Path.Length + 1) } | Set-Content -LiteralPath '%OUTPUT_FILE%' -Encoding UTF8"

if errorlevel 1 (
    echo.
    echo Failed to create %OUTPUT_FILE%.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo SRC FILE LIST CREATED
echo ==========================================
echo %CD%\%OUTPUT_FILE%
echo.
type "%OUTPUT_FILE%"
echo.
pause
exit /b 0
