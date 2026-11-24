param([string]$Database = 'smartcare')

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Start Docker Desktop before initializing SmartCare.' }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE) { throw 'Docker Desktop is not running.' }
$container = docker ps -a --filter 'name=^/smartcare-mongodb$' --format '{{.Names}}'
if ($LASTEXITCODE) { throw 'Could not list local MongoDB containers.' }
if (-not $container) {
    docker run --detach --name smartcare-mongodb --restart unless-stopped -p 127.0.0.1:27017:27017 -v smartcare-care-mongodb:/data/db mongo:8 | Out-Null
} else {
    docker start smartcare-mongodb | Out-Null
}
if ($LASTEXITCODE) { throw 'Could not start the local MongoDB container.' }
$ready = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
    try {
        docker exec smartcare-mongodb mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'MongoDB did not respond.' }

$directory = New-Item -ItemType Directory -Force target
$credentialPath = Join-Path $directory.FullName 'local-care-credential.clixml'
$previousPassword = $env:SMARTCARE_SEED_PASSWORD
$previousDatabase = $env:SMARTCARE_CARE_DATABASE
try {
    if (-not (Test-Path -LiteralPath $credentialPath)) {
        $password = if ($previousPassword) { $previousPassword } else { 'Sc-' + [Guid]::NewGuid().ToString('N') }
        $credential = [pscredential]::new('SmartCare local test accounts', (ConvertTo-SecureString $password -AsPlainText -Force))
        $credential | Export-Clixml -LiteralPath $credentialPath
    } else {
        $credential = Import-Clixml -LiteralPath $credentialPath
    }
    $env:SMARTCARE_SEED_PASSWORD = $credential.GetNetworkCredential().Password
    $env:SMARTCARE_CARE_DATABASE = $Database
    node .\scripts\seed-local-care.mjs
    if ($LASTEXITCODE) { throw 'Local SmartCare initialization failed.' }
    Write-Host "Database: $Database. Local credential: target\local-care-credential.clixml"
} finally {
    $env:SMARTCARE_SEED_PASSWORD = $previousPassword
    $env:SMARTCARE_CARE_DATABASE = $previousDatabase
}
