#requires -Version 5.1
<#
.SYNOPSIS
  Demonstrates that /smartcare/api/health/database fails fast when MongoDB is down
  and recovers without redeploying the WAR.
.DESCRIPTION
  Requires: SmartCare deployed on WildFly, Docker running, and a MongoDB container
  named smartcare-mongodb. Override the defaults with environment variables:
    SMARTCARE_HEALTH_URL            full health URL
    SMARTCARE_MONGO_CONTAINER       Docker container name
    SMARTCARE_RECOVERY_WAIT_SECONDS seconds to wait after docker start
#>
$ErrorActionPreference = 'Stop'

$healthUrl = if ($env:SMARTCARE_HEALTH_URL) {
    $env:SMARTCARE_HEALTH_URL
} else {
    'http://localhost:8080/smartcare/api/health/database'
}
$container = if ($env:SMARTCARE_MONGO_CONTAINER) {
    $env:SMARTCARE_MONGO_CONTAINER
} else {
    'smartcare-mongodb'
}
$recoveryWait = if ($env:SMARTCARE_RECOVERY_WAIT_SECONDS) {
    [int]$env:SMARTCARE_RECOVERY_WAIT_SECONDS
} else {
    5
}

function Get-Health {
    param([string]$Url)

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $code = -1
    $body = ''
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
        $code = [int]$response.StatusCode
        $body = [string]$response.Content
    } catch [System.Net.WebException] {
        # PowerShell 5.1 throws for 4xx/5xx, so read the status from the exception.
        if ($null -ne $_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.GetResponseStream()
            if ($null -ne $stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
                $reader.Dispose()
            }
        } else {
            $body = $_.Exception.Message
        }
    } catch {
        $body = $_.Exception.Message
    } finally {
        $watch.Stop()
    }

    [pscustomobject]@{
        StatusCode = $code
        ElapsedMs  = [int]$watch.ElapsedMilliseconds
        Body       = $body.Trim()
    }
}

function Write-Health {
    param([string]$Label, [object]$Result)
    Write-Host ('{0}: HTTP {1} in {2} ms -> {3}' -f $Label, $Result.StatusCode, $Result.ElapsedMs, $Result.Body)
}

Write-Host "Health endpoint : $healthUrl"
Write-Host "Mongo container : $container"
Write-Host ''

$before = Get-Health -Url $healthUrl
Write-Health -Label 'before stop' -Result $before

Write-Host "Stopping $container ..."
& docker stop $container | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "docker stop $container failed"
}

$down = Get-Health -Url $healthUrl
Write-Health -Label 'while stopped' -Result $down

Write-Host "Starting $container ..."
& docker start $container | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "docker start $container failed"
}
Write-Host "Waiting $recoveryWait s for MongoDB ..."
Start-Sleep -Seconds $recoveryWait

$after = Get-Health -Url $healthUrl
Write-Health -Label 'after start (no redeploy)' -Result $after

$failed = $false
if ($down.StatusCode -ne 503) {
    Write-Host "FAIL: expected HTTP 503 while MongoDB is stopped, got $($down.StatusCode)"
    $failed = $true
}
if ($down.ElapsedMs -gt 5000) {
    Write-Host "FAIL: expected the health check to fail in about 2 s, took $($down.ElapsedMs) ms"
    $failed = $true
}
if ($after.StatusCode -ne 200) {
    Write-Host "FAIL: expected HTTP 200 after MongoDB restart, got $($after.StatusCode)"
    $failed = $true
}
if ($failed) {
    exit 1
}

Write-Host ''
Write-Host 'PASS: 503 while stopped, 200 after restart, no redeploy.'
