$ErrorActionPreference = "Stop"

$schemaPath = ".\prisma\schema.prisma"
$migrationPath = ".\prisma\migrations\20260512000000_add_tenant_deals_person\migration.sql"

if (!(Test-Path $schemaPath)) {
  throw "Não encontrei $schemaPath. Rode este script na raiz do projeto."
}

if (!(Test-Path $migrationPath)) {
  throw "Não encontrei $migrationPath. Confirme o nome da pasta da migration."
}

$schema = Get-Content $schemaPath -Raw

$enumMatch = [regex]::Match($schema, 'enum\s+CommissionStatus\s*\{(?<body>[\s\S]*?)\}')

if (-not $enumMatch.Success) {
  throw "Não encontrei 'enum CommissionStatus' no schema.prisma."
}

$body = $enumMatch.Groups["body"].Value
$values = @()

foreach ($line in ($body -split "`r?`n")) {
  $clean = ($line -replace '//.*$', '').Trim()

  if (!$clean) {
    continue
  }

  if ($clean -match '^@@') {
    continue
  }

  $parts = $clean -split '\s+'
  $enumName = $parts[0]

  if ($enumName -match '^[A-Za-z_][A-Za-z0-9_]*$') {
    $values += $enumName
  }
}

if ($values.Count -eq 0) {
  throw "Encontrei enum CommissionStatus, mas não consegui extrair os valores."
}

$sql = Get-Content $migrationPath -Raw

if ($sql -match 'CREATE\s+TYPE\s+"CommissionStatus"') {
  Write-Host "A migration já possui CREATE TYPE CommissionStatus. Nenhuma alteração feita." -ForegroundColor Yellow
  exit 0
}

$valuesSql = ($values | ForEach-Object { "'" + $_ + "'" }) -join ", "

$createType = @"
DO `$$ BEGIN
    CREATE TYPE "CommissionStatus" AS ENUM ($valuesSql);
EXCEPTION
    WHEN duplicate_object THEN null;
END `$$;

"@

$backupPath = "$migrationPath.bak"
Copy-Item $migrationPath $backupPath -Force

Set-Content -Path $migrationPath -Value ($createType + $sql) -Encoding UTF8

Write-Host "Corrigido com sucesso." -ForegroundColor Green
Write-Host "Backup criado em: $backupPath"
Write-Host "Enum criado com valores: $valuesSql"
Write-Host ""
Write-Host "Agora rode:"
Write-Host "npx prisma migrate dev --name add_stock_module"
Write-Host "npx prisma generate"
