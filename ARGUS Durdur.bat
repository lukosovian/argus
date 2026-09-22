@echo off
title ARGUS Durdur
cd /d "%~dp0app"

if not exist "argus-pid.txt" (
  echo ARGUS zaten calismiyor gibi gorunuyor.
  pause
  exit /b 0
)

set /p ARGUS_PID=<argus-pid.txt
taskkill /PID %ARGUS_PID% /T /F >nul 2>nul
del /q argus-pid.txt >nul 2>nul

echo ARGUS kapatildi.
pause
