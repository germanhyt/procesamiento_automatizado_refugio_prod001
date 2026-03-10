@echo off
title Refugio Gastronómico - Sistema de Datos
echo =======================================================
echo    INICIANDO SISTEMA DE PROCESAMIENTO REFUGIO
echo =======================================================
echo.

:: 1. Iniciar el Backend FastAPI
echo [1/3] Lanzando Backend API...
start "Refugio BACKEND" cmd /k "cd backend && python main.py"

:: 2. Iniciar el Frontend React
echo [2/3] Lanzando Frontend Dashboard...
start "Refugio FRONTEND" cmd /k "cd frontend && npm run dev"

:: 3. Abrir el Navegador
echo [3/3] Abriendo Dashboard en el navegador...
timeout /t 5
start http://localhost:5173

echo.
echo =======================================================
echo    SISTEMA EN EJECUCIÓN - NO CIERRE LAS VENTANAS
echo =======================================================
pause
