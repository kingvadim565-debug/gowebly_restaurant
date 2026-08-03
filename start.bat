@echo off
chcp 65001 >nul
title Miasto 88 - serwer strony
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Nie znaleziono Node.js.
  echo  Pobierz i zainstaluj wersje LTS ze strony https://nodejs.org
  echo  Potem uruchom ten plik ponownie.
  echo.
  pause
  exit /b 1
)

echo Uruchamiam serwer (npm run dev)...
start "" http://localhost:3000/
call npm run dev
pause
