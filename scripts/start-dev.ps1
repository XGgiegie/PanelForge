param(
  [switch]$SkipInstall,
  [switch]$SkipMinio,
  [switch]$NoStart,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Usage {
  Write-Host @"
PanelForge local bootstrap script

Usage:
  powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1

Options:
  -SkipInstall   Skip pnpm install
  -SkipMinio     Skip Docker MinIO setup
  -NoStart       Prepare only, do not run pnpm dev
  -Help          Show help
"@
}

function Test-CommandExists([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Tool {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed."
  }
}

function Read-DotEnv([string]$Path) {
  $values = @{}

  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  Get-Content -Encoding UTF8 -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()

    if (-not $line -or $line.StartsWith('#')) {
      return
    }

    $equalIndex = $line.IndexOf('=')

    if ($equalIndex -le 0) {
      return
    }

    $key = $line.Substring(0, $equalIndex).Trim()
    $value = $line.Substring($equalIndex + 1).Trim()
    $value = $value.Trim([char]34).Trim([char]39)
    $values[$key] = $value
  }

  return $values
}

function Get-EnvOrDefault {
  param(
    [hashtable]$Values,
    [string]$Key,
    [string]$Default
  )

  if ($Values.ContainsKey($Key) -and $Values[$Key]) {
    return [string]$Values[$Key]
  }

  return $Default
}

function Set-EnvDefault {
  param(
    [string]$Key,
    [string]$Value
  )

  if (-not [System.Environment]::GetEnvironmentVariable($Key)) {
    [System.Environment]::SetEnvironmentVariable($Key, $Value, 'Process')
  }
}

function Wait-MinioHealth([string]$Url) {
  Write-Step "Waiting for MinIO"

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3

      if ($response.StatusCode -eq 200) {
        Write-Ok "MinIO is ready: $Url"
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "MinIO startup timed out. Check logs: docker logs panelforge-minio"
}

function Test-HttpOk([string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-DockerDaemon {
  & $env:ComSpec /c 'docker info --format "{{.ServerVersion}}" >nul 2>nul'
  return $LASTEXITCODE -eq 0
}

function Quote-Sh([string]$Value) {
  return "'$($Value.Replace("'", "'\''"))'"
}

function Ensure-Minio([string]$EnvPath) {
  if (-not (Test-CommandExists 'docker')) {
    throw "docker command not found. Install and start Docker Desktop first."
  }

  Write-Step "Checking Docker"
  if (-not (Test-DockerDaemon)) {
    Write-Host "Docker daemon is not running. Skip MinIO setup and continue without local object storage." -ForegroundColor Yellow
    return
  }
  Write-Ok "Docker is available"

  $envValues = Read-DotEnv $EnvPath
  $containerName = 'panelforge-minio'
  $networkName = 'panelforge-net'
  $volumeName = 'panelforge-minio-data'
  $endpoint = Get-EnvOrDefault $envValues 'PANELFORGE_MINIO_ENDPOINT' 'localhost'
  $port = Get-EnvOrDefault $envValues 'PANELFORGE_MINIO_PORT' '9000'
  $consolePort = '9001'
  $accessKey = Get-EnvOrDefault $envValues 'PANELFORGE_MINIO_ACCESS_KEY' 'minioadmin'
  $secretKey = Get-EnvOrDefault $envValues 'PANELFORGE_MINIO_SECRET_KEY' 'minioadmin'
  $bucket = Get-EnvOrDefault $envValues 'PANELFORGE_MINIO_BUCKET' 'panelforge-images'
  $healthUrl = "http://localhost:$port/minio/health/live"
  $mcEndpoint = "http://${containerName}:9000"

  if ($endpoint -ne 'localhost' -and $endpoint -ne '127.0.0.1') {
    Write-Host "Current MinIO endpoint is $endpoint. This script only prepares local Docker MinIO."
  }

  Write-Step "Preparing Docker network"
  $networkExists = docker network ls --filter "name=^$networkName$" --format "{{.Name}}"

  if (-not $networkExists) {
    Invoke-Tool 'docker' @('network', 'create', $networkName)
  }

  Write-Ok "Docker network ready: $networkName"

  Write-Step "Preparing MinIO container"
  $existingContainer = docker ps -a --filter "name=^/$containerName$" --format "{{.Names}}"

  if ($existingContainer -eq $containerName) {
    $runningContainer = docker ps --filter "name=^/$containerName$" --format "{{.Names}}"

    if ($runningContainer -ne $containerName) {
      Invoke-Tool 'docker' @('start', $containerName)
    }

    docker network connect $networkName $containerName 2>$null | Out-Null
    Write-Ok "MinIO container exists: $containerName"
  } elseif (Test-HttpOk $healthUrl) {
    $mcEndpoint = "http://host.docker.internal:$port"
    Write-Ok "Existing local MinIO detected: $healthUrl"
  } else {
    Invoke-Tool 'docker' @(
      'run',
      '-d',
      '--name',
      $containerName,
      '--network',
      $networkName,
      '-p',
      "${port}:9000",
      '-p',
      "${consolePort}:9001",
      '-e',
      "MINIO_ROOT_USER=$accessKey",
      '-e',
      "MINIO_ROOT_PASSWORD=$secretKey",
      '-v',
      "${volumeName}:/data",
      'minio/minio:latest',
      'server',
      '/data',
      '--console-address',
      ':9001'
    )
    Write-Ok "MinIO container created: $containerName"
  }

  Wait-MinioHealth $healthUrl

  Write-Step "Initializing MinIO bucket"
  $mcScript = @(
    "mc alias set local $(Quote-Sh $mcEndpoint) $(Quote-Sh $accessKey) $(Quote-Sh $secretKey)",
    "mc mb -p --ignore-existing $(Quote-Sh "local/$bucket")"
  ) -join ' && '

  Invoke-Tool 'docker' @(
    'run',
    '--rm',
    '--network',
    $networkName,
    '--entrypoint',
    '/bin/sh',
    'minio/mc:latest',
    '-c',
    $mcScript
  )

  Write-Ok "MinIO bucket ready: $bucket"
  Write-Host "MinIO Console: http://localhost:$consolePort"
}

if ($Help) {
  Write-Usage
  exit 0
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

Write-Step "Entering project directory"
Write-Ok $projectRoot.Path

Write-Step "Checking Node.js"
if (-not (Test-CommandExists 'node')) {
  throw "node command not found. Install Node.js 20+ first."
}
Invoke-Tool 'node' @('--version')

Write-Step "Checking pnpm"
if (-not (Test-CommandExists 'pnpm')) {
  if (-not (Test-CommandExists 'corepack')) {
    throw "pnpm and corepack were not found. Install Node.js 20+ or install pnpm manually."
  }

  Invoke-Tool 'corepack' @('enable')
  Invoke-Tool 'corepack' @('prepare', 'pnpm@11.15.1', '--activate')
}
Invoke-Tool 'pnpm' @('--version')

Write-Step "Preparing .env"
$envPath = Join-Path $projectRoot '.env'
$envExamplePath = Join-Path $projectRoot '.env.example'

if (-not (Test-Path -LiteralPath $envPath)) {
  Copy-Item -LiteralPath $envExamplePath -Destination $envPath
  Write-Ok ".env created from .env.example"
} else {
  Write-Ok ".env already exists; keeping it unchanged"
}

if (-not $SkipMinio) {
  Ensure-Minio $envPath
} else {
  Write-Host "Skipped MinIO setup."
}

if (-not $SkipInstall) {
  Set-EnvDefault 'ELECTRON_MIRROR' 'https://npmmirror.com/mirrors/electron/'
  Set-EnvDefault 'ELECTRON_BUILDER_BINARIES_MIRROR' 'https://npmmirror.com/mirrors/electron-builder-binaries/'

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    Write-Step "Installing dependencies"
    Invoke-Tool 'pnpm' @('install')
  } else {
    Write-Ok "node_modules exists; skipping install"
  }
} else {
  Write-Host "Skipped dependency install."
}

if ($NoStart) {
  Write-Ok "Environment is ready. Run pnpm dev to start later."
  exit 0
}

Write-Step "Starting PanelForge"
Invoke-Tool 'pnpm' @('dev')
