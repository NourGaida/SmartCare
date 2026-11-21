param([switch]$Force)

$ErrorActionPreference = 'Stop'
$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) {
  throw 'mkcert not found. Install with: choco install mkcert -y  (or see https://github.com/FiloSottile/mkcert)'
}

$repo = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $repo 'certs'
$caDir = Join-Path $certDir 'ca'
New-Item -ItemType Directory -Force -Path $caDir | Out-Null
$env:CAROOT = $caDir

$caCert = Join-Path $caDir 'rootCA.pem'
if (-not (Test-Path -LiteralPath $caCert)) {
  throw 'Local CA not trusted yet. In an elevated PowerShell run: $env:CAROOT = (Resolve-Path .\certs\ca).Path ; mkcert -install ; then re-run this script.'
}

$cert = Join-Path $certDir 'smartcare.local.pem'
$key = Join-Path $certDir 'smartcare.local-key.pem'
if ((Test-Path -LiteralPath $cert -or Test-Path -LiteralPath $key) -and -not $Force) {
  throw 'Certificate files already exist. Re-run with -Force to replace them.'
}

& $mkcert.Source -cert-file $cert -key-file $key 'smartcare.local' '*.smartcare.local' 'localhost' '127.0.0.1' '::1'
if ($LASTEXITCODE -ne 0) { throw "mkcert failed with exit code $LASTEXITCODE" }

Push-Location $repo
try {
  foreach ($relative in @('certs/smartcare.local.pem', 'certs/smartcare.local-key.pem', 'certs/ca/rootCA-key.pem', 'certs/ca/rootCA.pem')) {
    & git check-ignore -q -- $relative
    if ($LASTEXITCODE -ne 0) { throw "$relative is NOT ignored by git. Stop and fix .gitignore before sharing anything." }
  }
} finally {
  Pop-Location
}

icacls $key /inheritance:r /grant "$($env:USERNAME):R" | Out-Null
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $cert
Write-Host "Certificate: $cert"
Write-Host "Private key: $key (ignored by git; never commit or share)"
Write-Host "Certificate SHA256 file hash: $($hash.Hash)"
Write-Host 'SANs: smartcare.local, *.smartcare.local, localhost, 127.0.0.1, ::1'
