@echo off
setlocal
cd /d "%~dp0"

set "ERROR_FILE=test-errors.txt"
set "TEMP_LOG=test-output.tmp"

if exist "%ERROR_FILE%" del /q "%ERROR_FILE%"
if exist "%TEMP_LOG%" del /q "%TEMP_LOG%"

echo ==========================================
echo Running full project verification...
echo ==========================================
echo.

call :run_step "build" "npm.cmd run build"
if errorlevel 1 goto :verification_failed

call :run_step "build:client" "npm.cmd run build:client"
if errorlevel 1 goto :verification_failed

call :run_step "typecheck:client" "npm.cmd run typecheck:client"
if errorlevel 1 goto :verification_failed

call :run_step "lint" "npm.cmd run lint"
if errorlevel 1 goto :verification_failed

call :run_tests
if errorlevel 1 goto :tests_failed

if exist "%TEMP_LOG%" del /q "%TEMP_LOG%" >nul 2>&1
echo.
echo ==========================================
echo ALL VERIFICATION PASSED
echo ==========================================
echo build: PASS
echo build:client: PASS
echo typecheck:client: PASS
echo lint: PASS
echo test: PASS
echo.
pause
exit /b 0

:run_step
set "STEP_NAME=%~1"
set "STEP_COMMAND=%~2"
echo ------------------------------------------
echo Running %STEP_NAME%...
echo ------------------------------------------
call %STEP_COMMAND% > "%TEMP_LOG%" 2>&1
if errorlevel 1 (
  > "%ERROR_FILE%" echo Verification step failed: %STEP_NAME%
  >> "%ERROR_FILE%" echo Command: %STEP_COMMAND%
  >> "%ERROR_FILE%" echo.
  type "%TEMP_LOG%" >> "%ERROR_FILE%"
  exit /b 1
)
echo %STEP_NAME%: PASS
echo.
exit /b 0

:run_tests
echo ------------------------------------------
echo Running tests...
echo ------------------------------------------
call npm.cmd test > "%TEMP_LOG%" 2>&1
if errorlevel 1 exit /b 1
echo test: PASS
echo.
exit /b 0

:verification_failed
echo.
echo ==========================================
echo VERIFICATION FAILED
echo ==========================================
echo Failure details were written to:
echo %CD%\%ERROR_FILE%
echo.
type "%ERROR_FILE%"
echo.
pause
exit /b 1

:tests_failed
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$lines = Get-Content -LiteralPath '%TEMP_LOG%';" ^
  "$out = [System.Collections.Generic.List[string]]::new();" ^
  "for ($i = 0; $i -lt $lines.Count; $i++) {" ^
  "  if ($lines[$i] -match '^\s*not ok\s+\d+\s+-\s+') {" ^
  "    if ($out.Count -gt 0) { $out.Add('') };" ^
  "    $out.Add($lines[$i]);" ^
  "    $j = $i + 1;" ^
  "    while ($j -lt $lines.Count) {" ^
  "      $out.Add($lines[$j]);" ^
  "      if ($lines[$j] -match '^\s*\.\.\.\s*$') { break };" ^
  "      $j++;" ^
  "    }" ^
  "  }" ^
  "};" ^
  "if ($out.Count -eq 0) {" ^
  "  $out.Add('Tests failed, but no TAP \"not ok\" block could be extracted.');" ^
  "  $out.Add('See temporary output: %TEMP_LOG%');" ^
  "};" ^
  "Set-Content -LiteralPath '%ERROR_FILE%' -Value $out -Encoding UTF8"

echo.
echo ==========================================
echo TESTS FAILED
echo ==========================================
echo Only failing tests were written to:
echo %CD%\%ERROR_FILE%
echo.
type "%ERROR_FILE%"
echo.
pause
exit /b 1
