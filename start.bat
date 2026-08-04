@echo off
chcp 65001 >nul
title GoWebly Restauracja - serwer
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo. & echo  Nie znaleziono Node.js. Pobierz wersje LTS z https://nodejs.org & echo.
  pause & exit /b 1
)

if not exist ".env" (
  echo.
  echo  Brak pliku .env — skopiuj .env.example do .env
  echo  i wklej adres bazy z MongoDB Atlas.
  echo.
  pause & exit /b 1
)

if not exist "node_modules" (
  echo Instaluje zaleznosci...
  call npm install
)

echo Uruchamiam serwer...
start "" http://localhost:3000/
call npm run dev
pause
