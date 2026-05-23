@echo off
title Camera Monitor - Packaging Wizard
echo ==========================================
echo       CAMERA MONITOR PACKAGING TOOL      
echo ==========================================
echo.
echo [1/3] Closing active application processes that might be locked...
taskkill /f /im electron.exe >nul 2>&1
taskkill /f /im "HA PC Cam Monitor.exe" >nul 2>&1
taskkill /f /im "ha-pc-cam-monitor.exe" >nul 2>&1
taskkill /f /im "Kamera Gözcüsü.exe" >nul 2>&1
taskkill /f /im "Kamera Gozcusu.exe" >nul 2>&1
taskkill /f /im "Camera Monitor.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo [2/3] Cleaning up old temporary build files...
if exist "dist-build\win-unpacked" (
    echo Cleaning temporary win-unpacked folder...
    rd /s /q "dist-build\win-unpacked" >nul 2>&1
)
if exist "dist-build\builder-effective-config.yaml" (
    del /f /q "dist-build\builder-effective-config.yaml" >nul 2>&1
)

echo.
echo [3/3] Launching application packaging process...
echo.
cd /d "%~dp0"
call npm run build
echo.
echo ==========================================
echo Packaging process completed!
echo Setup file has been created inside the 'dist-build' folder.
echo.
echo Press any key to exit...
pause > nul
