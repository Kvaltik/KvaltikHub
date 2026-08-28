@echo off
cd /d "%~dp0"
echo.
echo ==============================================
echo   KVALTIK HUB - PRIPRAVA NOVE VERZE
echo ==============================================
echo.
set /p VERSION=Zadej novou verzi (napr. 17.0.1): 
if "%VERSION%"=="" goto :end

node tools\set-version.js %VERSION%
if errorlevel 1 goto :end

echo.
echo Verze byla nastavena na %VERSION%.
echo.
echo Dalsi prikazy:
echo   git add .
echo   git commit -m "Kvaltik Hub %VERSION%"
echo   git push
echo   git tag v%VERSION%
echo   git push origin v%VERSION%
echo.
echo Po pushnuti tagu GitHub Actions automaticky vytvori Release.
echo.
:end
pause
