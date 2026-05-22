@echo off
title Kamera Gozcusu - GitHub Yukleme Sihirbazi
echo ==========================================
echo       GITHUB KOD YUKLEME ARACI (GIT PUSH)  
echo ==========================================
echo.
echo Bu arac, en son guncellenen kodlari otomatik olarak GitHub repomuza yukler.
echo Lutfen bekleyin...
echo.

cd /d "%~dp0"

:: Check if git is installed
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Bilgisayarinizda Git yuklu bulunamadi!
    echo Lutfen Git'i https://git-scm.com/ adresinden yukleyin ve tekrar deneyin.
    echo.
    pause
    exit /b
)

:: Git repository check and init
if not exist ".git" (
    echo Git deposu baslatiliyor...
    git init
)

:: Configure remote origin with the correct repo name
git remote remove origin >nul 2>&1
git remote add origin https://github.com/TheK3R1M/Home-assistant-camera-app
echo Remote GitHub adresi baglandi: https://github.com/TheK3R1M/Home-assistant-camera-app

:: Add and commit
echo.
echo Kodlar ekleniyor...
git add .
echo.
echo Commit olusturuluyor...
git commit -m "feat: low-latency streaming and premium UI layout enhancements"

:: Push to main branch
echo.
echo GitHub'a pushlaniyor (Ana dal: main)...
git branch -M main
git push -u origin main

echo.
echo ==========================================
echo Kodlar basariyla GitHub'a pushlandi!
echo Artik GitHub sayfanizi yenileyip, Releases kismindan .exe dosyasini yukleyebilirsiniz.
echo.
echo Kapatmak icin bir tusa basin...
pause > nul
