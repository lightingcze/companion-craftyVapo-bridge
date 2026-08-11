@echo off
setlocal
title Crafty Bridge Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-CraftyBridge.ps1"
if errorlevel 1 (
  echo.
  echo Crafty Bridge installation failed. See the error above.
  pause
  exit /b 1
)
echo.
pause
