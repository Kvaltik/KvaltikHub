@echo off
cd /d "%~dp0"
set /p VERSION=Zadej novou verzi (napr. 15.0.1): 
node tools\set-version.js %VERSION%
pause
