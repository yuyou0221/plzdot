param(
  [ValidateSet("init", "start", "stop", "status")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LocalRoot = Join-Path $ProjectRoot ".local"
$DownloadDir = Join-Path $LocalRoot "downloads"
$ArchivePath = Join-Path $DownloadDir "postgresql-17.10-windows-x64-binaries.zip"
$ExtractDir = Join-Path $LocalRoot "postgresql-17.10"
$DataDir = Join-Path $LocalRoot "pgdata"
$LogPath = Join-Path $LocalRoot "postgres.log"
$BinDir = Join-Path $ExtractDir "pgsql\bin"
$PostgresUrl = "https://sbp.enterprisedb.com/getfile.jsp?fileid=1260201"
$DatabaseName = "project_management_platform"

function Assert-InProjectLocalPath([string]$Path) {
  $projectRootText = [string]$ProjectRoot
  $fullPath = [System.IO.Path]::GetFullPath($Path)

  if (-not $fullPath.StartsWith($projectRootText, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside project directory: $fullPath"
  }
}

function Ensure-Archive {
  New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null

  if (-not (Test-Path $ArchivePath)) {
    Write-Host "Downloading local PostgreSQL binaries..."
    Invoke-WebRequest -Uri $PostgresUrl -OutFile $ArchivePath
  }
}

function Ensure-Binaries {
  Ensure-Archive

  if (Test-Path (Join-Path $BinDir "postgres.exe")) {
    return
  }

  Assert-InProjectLocalPath $ExtractDir

  if (Test-Path $ExtractDir) {
    Remove-Item -LiteralPath $ExtractDir -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
  tar.exe -xf $ArchivePath -C $ExtractDir
}

function Ensure-DataDir {
  Ensure-Binaries

  if (Test-Path (Join-Path $DataDir "PG_VERSION")) {
    return
  }

  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  & (Join-Path $BinDir "initdb.exe") -D $DataDir -U postgres --encoding=UTF8 --locale=C -A trust
}

function Start-LocalPostgres {
  Ensure-DataDir

  & (Join-Path $BinDir "pg_ctl.exe") -D $DataDir status *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Local PostgreSQL is already running."
  } else {
    & (Join-Path $BinDir "pg_ctl.exe") -D $DataDir -l $LogPath -o "-h 127.0.0.1 -p 5432" start
  }

  & (Join-Path $BinDir "pg_isready.exe") -h 127.0.0.1 -p 5432 -U postgres | Write-Host
}

function Ensure-Database {
  Start-LocalPostgres

  $exists = & (Join-Path $BinDir "psql.exe") -h 127.0.0.1 -p 5432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DatabaseName'"

  if (($exists | Out-String).Trim() -ne "1") {
    & (Join-Path $BinDir "createdb.exe") -h 127.0.0.1 -p 5432 -U postgres $DatabaseName
  }

  Write-Host "Database is ready: $DatabaseName"
}

function Stop-LocalPostgres {
  Ensure-Binaries
  & (Join-Path $BinDir "pg_ctl.exe") -D $DataDir stop
}

function Show-Status {
  Ensure-Binaries
  & (Join-Path $BinDir "pg_ctl.exe") -D $DataDir status
}

switch ($Action) {
  "init" { Ensure-Database }
  "start" { Start-LocalPostgres }
  "stop" { Stop-LocalPostgres }
  "status" { Show-Status }
}
