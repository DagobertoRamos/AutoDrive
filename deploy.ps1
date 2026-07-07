param(
  [string]$ProjectPath = $PSScriptRoot,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ProjectPath)) {
  throw "Caminho do projeto não encontrado: $ProjectPath"
}

Set-Location $ProjectPath

if (-not (Test-Path "node_modules")) {
  Write-Host "[deploy] Instalando dependências..."
  npm ci
} else {
  Write-Host "[deploy] Dependências já instaladas; pulando npm ci."
}

Write-Host "[deploy] Gerando cliente Prisma..."
try {
  npx prisma generate
} catch {
  Write-Warning "[deploy] prisma generate falhou; continuando com o restante do script."
}

Write-Host "[deploy] Aplicando migrações..."
try {
  npx prisma migrate deploy
} catch {
  Write-Warning "[deploy] prisma migrate deploy falhou; continuando com o restante do script."
}

if (-not $SkipBuild) {
  Write-Host "[deploy] Fazendo build da aplicação..."
  npm run build
}

Write-Host "[deploy] Preparando logs..."
New-Item -ItemType Directory -Path .\logs -Force | Out-Null

$nextOut = Join-Path (Get-Location) "logs\next.out.log"
$nextErr = Join-Path (Get-Location) "logs\next.err.log"
$workerOut = Join-Path (Get-Location) "logs\queue-worker.out.log"
$workerErr = Join-Path (Get-Location) "logs\queue-worker.err.log"

Write-Host "[deploy] Iniciando Next.js..."
$nextCommand = "Set-Location '$ProjectPath'; npm run start"
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $nextCommand -WorkingDirectory $ProjectPath -RedirectStandardOutput $nextOut -RedirectStandardError $nextErr

Write-Host "[deploy] Iniciando worker da fila..."
$workerCommand = "Set-Location '$ProjectPath'; node scripts/seller-queue-worker.cjs"
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $workerCommand -WorkingDirectory $ProjectPath -RedirectStandardOutput $workerOut -RedirectStandardError $workerErr

Write-Host "[deploy] Deploy iniciado com sucesso."
Write-Host "[deploy] Logs:"
Write-Host "  - $nextOut"
Write-Host "  - $nextErr"
Write-Host "  - $workerOut"
Write-Host "  - $workerErr"
