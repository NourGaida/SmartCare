param(
  [string]$IpAddress = '192.168.1.4',
  [switch]$Remove,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if (-not $DryRun) {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell. Paste the exact command from docs/https-pwa/02-hostnames.md.'
  }
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
  if (-not $DryRun -and -not (Test-Path -LiteralPath $backup)) {
    Copy-Item -LiteralPath $hostsPath -Destination $backup -Force
    Write-Host "Backup created: $backup"
  }
  $lines += $startMarker
  foreach ($name in $names) { $lines += "$IpAddress`t$name" }
  $lines += $endMarker
}

if ($DryRun) {
  Write-Host "DRY RUN: would write $($lines.Count) lines to $hostsPath"
  if ($Remove) {
    Write-Host 'DRY RUN: managed SmartCare host entries would be removed.'
  } else {
    Write-Host 'DRY RUN: managed block would be:'
    Write-Host "  $startMarker"
    foreach ($name in $names) { Write-Host "  $IpAddress`t$name" }
    Write-Host "  $endMarker"
  }
  Write-Host 'DRY RUN: no hosts file or DNS cache was modified.'
  return
}

[System.IO.File]::WriteAllLines($hostsPath, $lines, $encoding)
ipconfig /flushdns | Out-Null

if ($Remove) {
  Write-Host 'SmartCare host entries removed; DNS cache flushed.'
} else {
  Write-Host "SmartCare host entries set to $IpAddress ; DNS cache flushed."
  foreach ($name in $names) { Write-Host "  $name" }
}
