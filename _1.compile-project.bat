@echo off
setlocal
cd /d "%~dp0"

set "ERROR_FILE=compile-errors.txt"
set "TEMP_LOG=compile-output.tmp"

if exist "%ERROR_FILE%" del /q "%ERROR_FILE%"
if exist "%TEMP_LOG%" del /q "%TEMP_LOG%"

echo ==========================================
echo Compiling project...
echo ==========================================
echo.

call npm.cmd run build > "%TEMP_LOG%" 2>&1
if errorlevel 1 goto :failed

call npm.cmd run build:client >> "%TEMP_LOG%" 2>&1
if errorlevel 1 goto :failed

del /q "%TEMP_LOG%" >nul 2>&1

echo.
echo ==========================================
echo COMPILE PASSED
echo ==========================================
echo.
pause
exit /b 0

:failed
move /y "%TEMP_LOG%" "%ERROR_FILE%" >nul

echo.
echo ==========================================
echo COMPILE FAILED
echo ==========================================
echo Error details were written to:
echo %CD%\%ERROR_FILE%
echo.
echo ----- Compiler output -----
type "%ERROR_FILE%"
echo ---------------------------
echo.
pause
exit /b 1
