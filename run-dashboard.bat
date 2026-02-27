@echo off
echo Starting Dashboard Server...
echo.
:loop
node start-dashboard.js
echo.
echo Server stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
