@echo off
setlocal
title Instalar Agente de impresion Datta
set "SRC=%~dp0app"
set "DEST=%LOCALAPPDATA%\DattaAgente"

echo.
echo  Instalando el Agente de impresion de Datta...
echo.

if not exist "%SRC%\node.exe" (
  echo  ERROR: no se encuentra la carpeta "app" junto a este archivo. Descomprimi el ZIP completo y volve a ejecutar.
  pause
  exit /b 1
)

rem Si ya habia una version corriendo, se detiene antes de copiar.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*datta-print-agent*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

if not exist "%DEST%" mkdir "%DEST%"
xcopy /y /e /q "%SRC%\*" "%DEST%\" >nul
if errorlevel 1 (
  echo  ERROR: no se pudieron copiar los archivos a %DEST%
  pause
  exit /b 1
)

rem Arranque automatico al iniciar sesion en Windows (sin ventana).
schtasks /Create /TN "DattaPrintAgent" /TR "wscript.exe \"%DEST%\run-hidden.vbs\"" /SC ONLOGON /RL LIMITED /F >nul
if errorlevel 1 (
  echo  ERROR: no se pudo crear la tarea de arranque automatico.
  pause
  exit /b 1
)
schtasks /Run /TN "DattaPrintAgent" >nul

echo  Esperando que el agente arranque...
powershell -NoProfile -Command "$ok=$false; 1..10 | ForEach-Object { try { $r=Invoke-RestMethod http://127.0.0.1:9101/status -TimeoutSec 2; if($r.ok){$ok=$true; break} } catch { Start-Sleep 1 } }; if($ok){ Write-Host ' LISTO: el agente esta funcionando (version' $r.version ').' -ForegroundColor Green; exit 0 } else { Write-Host ' ERROR: el agente no responde. Revisa el archivo agent.log en' $env:LOCALAPPDATA'\DattaAgente' -ForegroundColor Red; exit 1 }"
echo.
echo  Proximo paso: en Datta (con el usuario de caja o admin) entra a Impresoras
echo  y elegi la impresora de cada sector.
echo.
pause
