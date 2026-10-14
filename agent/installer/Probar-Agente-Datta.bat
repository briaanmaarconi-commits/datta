@echo off
setlocal
title Probar Agente de impresion Datta
echo.
echo  Estado del agente:
powershell -NoProfile -Command "try { $r=Invoke-RestMethod http://127.0.0.1:9101/status -TimeoutSec 3; Write-Host ' Funcionando - version' $r.version -ForegroundColor Green } catch { Write-Host ' NO responde. Ejecuta Instalar-Agente-Datta.bat' -ForegroundColor Red; exit 1 }"
if errorlevel 1 goto fin
echo.
echo  Impresoras que ve Windows (usa estos nombres en Datta):
powershell -NoProfile -Command "try { (Invoke-RestMethod http://127.0.0.1:9101/printers -TimeoutSec 15).printers | ForEach-Object { '   - ' + $_ } } catch { Write-Host ' No se pudo leer la lista de impresoras.' -ForegroundColor Red }"
:fin
echo.
pause
