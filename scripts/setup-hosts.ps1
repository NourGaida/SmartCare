param(
  [string]$IpAddress = '192.168.1.4',
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this from an elevated PowerShell. Paste the exact command from docs/https-pwa/02-hostnames.md.'
}

$hostsPath = Join-Path $env:WINDIR 'System32\drivers\etc\hosts'
$names = @('app.smartcare.local', 'staff.smartcare.local', 'api.smartcare.local')
$startMarker = '# >>> SmartCare HTTPS (managed by scripts/setup-hosts.ps1)'
$endMarker = '# <<< SmartCare HTTPS'
$encoding = New-Object System.Text.UTF8Encoding($false)
$lines = @(Get-Content -LiteralPath $hostsPath)

$lines = @($lines | Where-Object {
  $line = $_
  $managed = $false
  foreach ($name in $names) {
    if ($line -match "(?:^|\s)$([regex]::Escape($name))(?:\s|$)") { $managed = $true; break }
  }
  -not $managed -and $line -ne $startMarker -and $line -ne $endMarker
})

if (-not $Remove) {
  $backup = "$hostsPath.bak"
  if (-not (Test-Path -LiteralPath $backup)) {
    Copy-Item -LiteralPath $hostsPath -Destination $backup -Force
    Write-Host "Backup created: $backup"
  }
  $lines += $startMarker
  foreach ($name in $names) { $lines += "$IpAddress`t$name" }
  $lines += $endMarker
}

[System.IO.File]::WriteAllLines($hostsPath, $lines, $encoding)
ipconfig /flushdns | Out-Null

if ($Remove) {
  Write-Host 'SmartCare host entries removed; DNS cache flushed.'
} else {
  Write-Host "SmartCare host entries set to $IpAddress ; DNS cache flushed."
  foreach ($name in $names) { Write-Host "  $name" }
}
