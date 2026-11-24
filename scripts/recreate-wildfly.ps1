param(
  [string]$ContainerName = 'smartcare-wildfly',
  [string]$Image = 'smartcare-wildfly-proxy:local',
  [string]$RestartPolicy = 'unless-stopped',
  [string]$DeploymentsVolume = 'smartcare-wildfly-deployments',
  [int]$TimeoutSeconds = 180,
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$dockerfile = Join-Path $repo 'docker/Dockerfile.wildfly-proxy'
$deploymentPath = '/opt/jboss/wildfly/standalone/deployments'
$cliAddress = '/subsystem=undertow/server=default-server/http-listener=default'

function Write-Note([string]$Text) { "NOTE $Text" }
function Write-Fail([string]$Text) { "FAIL $Text" }

function Get-ContainerInspection([string]$Name) {
  $json = docker inspect $Name 2>$null | Out-String
  if (-not $json.Trim()) { throw "Container '$Name' does not exist. The exact original docker run flags are not versioned." }
  return ($json | ConvertFrom-Json)[0]
}

function Get-RunSpec($Inspection, [string]$RunImage, [switch]$SecureOverride, [string]$ExtraVolume = '') {
  $argsList = [System.Collections.Generic.List[string]]::new()
  $networks = [System.Collections.Generic.List[string]]::new()
  $healthPort = ''
  $volumeCount = 0

  $argsList.Add('--name'); $argsList.Add([string]$Inspection.Name.TrimStart('/'))
  $argsList.Add('--restart'); $argsList.Add($RestartPolicy)

  if ($Inspection.HostConfig.PortBindings) {
    foreach ($binding in $Inspection.HostConfig.PortBindings.PSObject.Properties) {
      $containerPort = [string]$binding.Name
      foreach ($entry in @($binding.Value)) {
        $hostIp = [string]$entry.HostIp
        $hostPort = [string]$entry.HostPort
        if (-not $hostPort) { continue }
        if ($containerPort -eq '8080/tcp') { $healthPort = $hostPort }
        $portSpec = if ($hostIp -and $hostIp -ne '0.0.0.0') { "$hostIp`:$hostPort`:$($containerPort.TrimEnd('/tcp'))" } else { "$hostPort`:$($containerPort.TrimEnd('/tcp'))" }
        $argsList.Add('-p'); $argsList.Add($portSpec)
      }
    }
  }

  foreach ($mount in @($Inspection.Mounts)) {
    $destination = [string]$mount.Destination
    if ($mount.Type -eq 'bind') {
      $volumeSpec = "$($mount.Source):$destination"
      if (-not $mount.RW) { $volumeSpec += ':ro' }
      $argsList.Add('-v'); $argsList.Add($volumeSpec)
      $volumeCount++
    } elseif ($mount.Type -eq 'volume') {
      $volumeSpec = "$($mount.Name):$destination"
      if (-not $mount.RW) { $volumeSpec += ':ro' }
      $argsList.Add('-v'); $argsList.Add($volumeSpec)
      $volumeCount++
    }
  }

  if ($ExtraVolume) {
    $argsList.Add('-v'); $argsList.Add("$ExtraVolume`:$deploymentPath")
    $volumeCount++
  }

  if ($Inspection.NetworkSettings.Networks) {
    foreach ($network in $Inspection.NetworkSettings.Networks.PSObject.Properties) {
      if ($networks.Count -eq 0) {
        $argsList.Add('--network'); $argsList.Add([string]$network.Name)
      }
      $networks.Add([string]$network.Name)
    }
  }

  foreach ($envVar in @($Inspection.Config.Env)) {
    if ([string]$envVar -match '^SMARTCARE_SESSION_SECURE=') { continue }
    $argsList.Add('-e'); $argsList.Add([string]$envVar)
  }
  if ($SecureOverride) {
    $argsList.Add('-e'); $argsList.Add('SMARTCARE_SESSION_SECURE=true')
  }

  $argsList.Add($RunImage)
  return @{
    Args = $argsList.ToArray()
    Networks = $networks.ToArray()
    HealthPort = $healthPort
    VolumeCount = $volumeCount
  }
}

function Wait-ContainerRunning([string]$Name) {
  for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
    $state = (docker inspect -f '{{.State.Running}}' $Name 2>$null | Out-String).Trim()
    if ($state -eq 'true') { return $true }
    Start-Sleep 1
  }
  return $false
}

function Wait-LogMarker([string]$Name, [string]$Marker) {
  for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
    $logs = docker logs --tail 300 $Name 2>&1 | Out-String
    if ($logs.Contains($Marker)) { return $true }
    Start-Sleep 1
  }
  return $false
}

function Export-Deployments([string]$SourceContainer, [string]$VolumeName) {
  docker volume create $VolumeName | Out-Null
  $helper = "smartcare-wildfly-export-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  docker rm -f $helper 2>$null | Out-Null
  docker create --name $helper --entrypoint /bin/true -v "${VolumeName}:/backup" $Image | Out-Null
  try {
    docker cp "${SourceContainer}:${deploymentPath}/." "${helper}:/backup/" | Out-Null
  } finally {
    docker rm -f $helper 2>$null | Out-Null
  }
}

function Remove-Container([string]$Name) {
  $running = (docker inspect -f '{{.State.Running}}' $Name 2>$null | Out-String).Trim()
  if ($running -eq 'true') { docker stop --time 20 $Name | Out-Null }
  docker rm -f $Name | Out-Null
}

function Invoke-Recreate($Spec) {
  $runArgs = $Spec.Args
  & docker run -d @runArgs | Out-Null
  for ($i = 1; $i -lt $Spec.Networks.Count; $i++) {
    & docker network connect $Spec.Networks[$i] $ContainerName | Out-Null
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI not found.' }
if (-not (Test-Path -LiteralPath $dockerfile)) { throw "Missing $dockerfile" }
$inspection = Get-ContainerInspection $ContainerName
$originalImage = [string]$inspection.Config.Image
$originalRestart = [string]$inspection.HostConfig.RestartPolicy.Name
$deploymentCovered = @($inspection.Mounts | Where-Object { $deploymentPath.StartsWith(([string]$_.Destination).TrimEnd('/'), [System.StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
$exportNeeded = -not $deploymentCovered
$extraVolume = if ($exportNeeded) { $DeploymentsVolume } else { '' }
$newSpec = Get-RunSpec $inspection $Image -SecureOverride -ExtraVolume $extraVolume
$oldSpec = Get-RunSpec $inspection $originalImage -ExtraVolume $extraVolume

$portCount = @($inspection.HostConfig.PortBindings.PSObject.Properties).Count
$networkCount = @($inspection.NetworkSettings.Networks.PSObject.Properties).Count
$envCount = @($inspection.Config.Env).Count

"CONTAINER $ContainerName"
"IMAGE original=$originalImage target=$Image"
"RESTART original=$originalRestart target=$RestartPolicy"
"SUMMARY ports=$portCount volumes=$($newSpec.VolumeCount) networks=$networkCount env_count=$envCount deployments=$(if ($exportNeeded) { "export-to-volume:$DeploymentsVolume" } else { 'preserve-existing-mount' }) secure=true"

if ($DryRun) {
  'DRY RUN: Dockerfile, container inspection and command construction succeeded; no Docker state changed.'
  return
}
if (-not $Force) { throw 'Re-run with -Force to rebuild and replace the container.' }

Write-Note "MongoDB data is in smartcare-mongodb and is not recreated by this script."
"BUILD image=$Image"
& docker build -f $dockerfile -t $Image $repo
if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed.' }

if ($exportNeeded) {
  Write-Note "exporting WildFly deployments from '$ContainerName' to volume '$DeploymentsVolume'; content is not printed"
  Export-Deployments $ContainerName $DeploymentsVolume
}

$rollbackAvailable = $false
try {
  "RECREATE stopping and removing '$ContainerName'"
  Remove-Container $ContainerName
  Invoke-Recreate $newSpec
  $rollbackAvailable = $true

  if (-not (Wait-ContainerRunning $ContainerName)) { throw 'New container did not reach running state.' }
  if (-not (Wait-LogMarker $ContainerName 'SmartCare WildFly proxy forwarding verified.')) { throw 'Startup verification marker was not found in logs.' }

  $cli = docker exec $ContainerName /opt/jboss/wildfly/bin/jboss-cli.sh --connect --command="$($cliAddress):read-attribute(name=proxy-address-forwarding)" 2>&1 | Out-String
  if ($cli -notmatch '"result"\s*=>\s*true') { throw 'proxy-address-forwarding is not true.' }
  $secure = (docker exec $ContainerName printenv SMARTCARE_SESSION_SECURE 2>$null | Out-String).Trim()
  if ($secure -ne 'true') { throw 'SMARTCARE_SESSION_SECURE is not true.' }
  $restart = (docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' $ContainerName 2>$null | Out-String).Trim()
  if ($restart -ne $RestartPolicy) { throw "Restart policy is '$restart', expected '$RestartPolicy'." }

  "PASS logs :: SmartCare WildFly proxy forwarding verified."
  "PASS jboss-cli :: proxy-address-forwarding=true"
  "PASS environment :: SMARTCARE_SESSION_SECURE=true"
  "PASS restart policy :: $restart"

  if ($newSpec.HealthPort) {
    $code = curl.exe --ssl-no-revoke -sS -o NUL -w '%{http_code}' "http://127.0.0.1:$($newSpec.HealthPort)/smartcare/api/health" 2>$null
    if ([string]$code -eq '200') { "PASS health :: http://127.0.0.1:$($newSpec.HealthPort)/smartcare/api/health status=200" } else { "FAIL health :: status=$code" }
  } else {
    Write-Note 'no published 8080/tcp host port found; health HTTP check skipped'
  }

  "SUMMARY recreate=verified rollback=not-needed"
} catch {
  Write-Fail $_.Exception.Message
  if ($rollbackAvailable) {
    Write-Note 'rolling back to the original container configuration'
    docker rm -f $ContainerName 2>$null | Out-Null
    try {
      Invoke-Recreate $oldSpec
      if (Wait-ContainerRunning $ContainerName) {
        "SUMMARY recreate=failed rollback=restored"
      } else {
        "SUMMARY recreate=failed rollback=container-exists-but-not-running"
      }
    } catch {
      Write-Fail "rollback failed: $($_.Exception.Message)"
      "SUMMARY recreate=failed rollback=failed"
    }
  } else {
    "SUMMARY recreate=failed rollback=not-needed"
  }
  exit 1
}
