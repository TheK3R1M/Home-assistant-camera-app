@echo off
title Camera Monitor - GitHub Upload Wizard
echo ==========================================
echo       GITHUB CODE UPLOAD TOOL (GIT PUSH)  
echo ==========================================
echo.
echo This tool automatically uploads the latest updated code to our GitHub repository.
echo Please wait...
echo.

cd /d "%~dp0"

:: Check if git is installed
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git could not be found on your computer!
    echo Please install Git from https://git-scm.com/ and try again.
    echo.
    pause
    exit /b
)

:: Git repository check and init
if not exist ".git" (
    echo Initializing Git repository...
    git init
)

:: Configure remote origin with the correct repo name
git remote remove origin >nul 2>&1
git remote add origin https://github.com/TheK3R1M/Home-assistant-camera-app
echo Remote GitHub address linked: https://github.com/TheK3R1M/Home-assistant-camera-app

:: Add and commit
echo.
echo Adding files...
git add .
echo.
echo Creating commit...
git commit -m "feat: complete translation to English, rename product to Camera Monitor, and add interactive NSIS setup"

:: Push to main branch
echo.
echo Pushing to GitHub (Branch: main)...
git branch -M main
git push -f -u origin main

echo.
echo ==========================================
echo Code successfully pushed to GitHub!
echo You can now refresh your GitHub page and download the .exe installer from the Releases section.
echo.
echo Press any key to close...
pause > nul
