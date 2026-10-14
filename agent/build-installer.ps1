# Arma el paquete instalable del agente: agent\dist\DattaAgente-Instalador.zip
# Incluye node.exe portatil para que la PC de cocina no necesite instalar nada.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stage = Join-Path $root 'dist\DattaAgente-Instalador'
$zip = Join-Path $root 'dist\DattaAgente-Instalador.zip'

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
if (Test-Path $zip) { Remove-Item -Force $zip }
New-Item -ItemType Directory -Force (Join-Path $stage 'app') | Out-Null

$node = (Get-Command node).Source
Copy-Item $node (Join-Path $stage 'app\node.exe')
Copy-Item (Join-Path $root 'datta-print-agent.mjs') (Join-Path $stage 'app')
Copy-Item (Join-Path $root 'escpos.mjs') (Join-Path $stage 'app')
Copy-Item (Join-Path $root 'installer\run-hidden.vbs') (Join-Path $stage 'app')
foreach ($f in 'Instalar-Agente-Datta.bat', 'Probar-Agente-Datta.bat', 'Desinstalar-Agente-Datta.bat', 'LEEME.txt') {
  Copy-Item (Join-Path $root "installer\$f") $stage
}

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Write-Host ("Listo: {0} ({1:N1} MB, Node {2})" -f $zip, ((Get-Item $zip).Length / 1MB), (& $node --version))
