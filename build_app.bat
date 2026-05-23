@echo off
title Kamera Gozcusu - Paketleme Sihirbazi
echo ==========================================
echo       KAMERA GOZCUSU PAKETLEME ARACI      
echo ==========================================
echo.
echo [1/3] Kilitli olabilecek aktif uygulama surecleri kapatiliyor...
taskkill /f /im electron.exe >nul 2>&1
taskkill /f /im "HA PC Cam Monitor.exe" >nul 2>&1
taskkill /f /im "ha-pc-cam-monitor.exe" >nul 2>&1
taskkill /f /im "Kamera Gözcüsü.exe" >nul 2>&1
taskkill /f /im "Kamera Gozcusu.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo [2/3] Eski gecici build dosyalari temizleniyor...
if exist "dist-build\win-unpacked" (
    echo Gecici win-unpacked klasoru temizleniyor...
    rd /s /q "dist-build\win-unpacked" >nul 2>&1
)
if exist "dist-build\builder-effective-config.yaml" (
    del /f /q "dist-build\builder-effective-config.yaml" >nul 2>&1
)

echo.
echo [3/3] Uygulama paketleme islemi baslatiliyor...
echo.
cd /d "%~dp0"
call npm run build
echo.
echo ==========================================
echo Paketleme islemi tamamlandi!
echo Kurulum dosyasi 'dist-build' klasoru icine olusturuldu.
echo.
echo Cikmak icin bir tusa basin...
pause > nul
