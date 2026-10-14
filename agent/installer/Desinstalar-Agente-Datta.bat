@echo off
setlocal
title Desinstalar Agente de impresion Datta
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*datta-print-agent*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
schtasks /Delete /TN "DattaPrintAgent" /F >nul 2>&1
rmdir /s /q "%LOCALAPPDATA%\DattaAgente" >nul 2>&1
echo.
echo  Agente de impresion de Datta desinstalado.
echo.
pause
