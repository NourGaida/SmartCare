param(
    [Parameter(Mandatory=$true)][string]$WildFlyHome,
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$Maven = 'mvn',
    [string]$Database = 'smartcare',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
$WildFlyHome = (Resolve-Path -LiteralPath $WildFlyHome).Path
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\java.exe'))) { throw 'Supply a JDK 25 directory with -JavaHome.' }
$python = (Resolve-Path -LiteralPath .\.venv-simulator\Scripts\python.exe -ErrorAction Stop).Path
$env:JAVA_HOME = $JavaHome
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017'
$env:MONGODB_DATABASE = $Database
$env:MQTT_BROKER_URL = 'tcp://127.0.0.1:1885'
$env:MQTT_CLIENT_ID = 'smartcare-connected-care'
$env:MQTT_TOPIC = 'smartcare/v1/validated/#'
$env:MQTT_ENABLED = 'true'
$env:SMARTCARE_SIMULATOR_PYTHON = $python
$env:SMARTCARE_SIMULATOR_SCRIPT = (Resolve-Path .\iot\simulator\simulator.py).Path
$env:SMARTCARE_SIMULATOR_PORT = '1885'
$env:MQTT_HOST = '127.0.0.1'
$env:MQTT_PORT = '1885'
$env:SMARTCARE_DETECTION_INPUT = 'smartcare/v1/persisted'
$env:NOPAUSE = 'true'

function Test-LocalPort([int]$port) {
    $client = [Net.Sockets.TcpClient]::new()
    try { $client.Connect('127.0.0.1', $port); return $true }
    catch [Net.Sockets.SocketException] { return $false }
    finally { $client.Dispose() }
}

function Wait-Status([string]$url, [scriptblock]$condition) {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            $reply = Invoke-RestMethod -Uri $url -TimeoutSec 3
            if (& $condition $reply) { return }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw "Service did not become ready: $url"
}

if ((Test-LocalPort 8085) -or (Test-LocalPort 9995)) {
    throw 'Port 8085 or 9995 is already in use. If SmartCare is running, open http://localhost:8085/smartcare/frontends/frontoffice/.'
}
docker exec smartcare-mongodb mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' | Out-Null
if ($LASTEXITCODE) { throw 'Initialize the local database first with scripts\init-local-care.ps1.' }
docker compose -f iot/broker/compose.connected.yml up -d
if ($LASTEXITCODE) { throw 'Could not start the local MQTT gateway.' }
Wait-Status 'http://127.0.0.1:1886/' { param($reply) [bool]$reply }
if (-not $SkipBuild) {
    & $Maven --batch-mode --no-transfer-progress -f middleware/pom.xml -DskipTests package
    if ($LASTEXITCODE) { throw 'WAR build failed.' }
}
$war = (Resolve-Path .\middleware\api\target\smartcare.war).Path.Replace('\','/')
$base = (New-Item -ItemType Directory -Force .\target\wildfly-connected).FullName
$conf = (New-Item -ItemType Directory -Force (Join-Path $base 'configuration')).FullName
foreach ($file in 'standalone.xml','logging.properties','mgmt-users.properties','mgmt-groups.properties','application-users.properties','application-roles.properties') {
    $source = Join-Path $WildFlyHome "standalone\configuration\$file"
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $conf -Force }
}
$configPath = Join-Path $conf 'standalone.xml'
[xml]$config = Get-Content -LiteralPath $configPath -Raw
$previousDeployments = $config.DocumentElement.SelectSingleNode("*[local-name()='deployments']")
if ($previousDeployments) { [void]$config.DocumentElement.RemoveChild($previousDeployments) }
$config.Save($configPath)

$standalone = Join-Path $WildFlyHome 'bin\standalone.bat'
$launch = "& '${standalone}' '-Djboss.server.base.dir=${base}' '-Djboss.socket.binding.port-offset=5' -b 127.0.0.1"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launch))
$server = Start-Process powershell -ArgumentList @('-NoProfile','-EncodedCommand',$encoded) -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $base 'stdout.log') -RedirectStandardError (Join-Path $base 'stderr.log')
for ($attempt = 1; $attempt -le 30 -and -not (Test-LocalPort 9995); $attempt++) {
    Start-Sleep -Seconds 1
    if ($server.HasExited) { throw 'WildFly stopped. Read target\wildfly-connected\stdout.log.' }
}
if (-not (Test-LocalPort 9995)) { throw 'WildFly did not start on port 9995. Read target\wildfly-connected\stdout.log.' }
$cliFile = Join-Path $base 'deploy.cli'
Set-Content -LiteralPath $cliFile -Encoding ASCII -Value ('deploy "' + $war + '" --force')
& (Join-Path $WildFlyHome 'bin\jboss-cli.bat') --connect --controller=127.0.0.1:9995 --file=$cliFile
if ($LASTEXITCODE) { throw 'WildFly could not deploy smartcare.war.' }
$api = 'http://127.0.0.1:8085/smartcare/api'
Wait-Status "$api/health/database" { param($reply) $reply.status -eq 'ok' }
Wait-Status "$api/health/ingestion" { param($reply) $reply.connected -eq $true }

$detector = (Resolve-Path .\iot\detection\mqtt_detector.py).Path
$detectorLog = Join-Path $base 'detector.log'
$worker = Start-Process $python -ArgumentList @('-u', ('"' + $detector + '"')) -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $base 'detector-stdout.log') -RedirectStandardError $detectorLog
$subscribed = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
    if (Select-String -LiteralPath $detectorLog -Pattern 'Subscribed to smartcare/v1/persisted/' -Quiet -ErrorAction SilentlyContinue) {
        $subscribed = $true
        break
    }
    if ($worker.HasExited) { break }
    Start-Sleep -Seconds 1
}
if (-not $subscribed) { throw 'The detector did not subscribe. Read target\wildfly-connected\detector.log.' }

Write-Host 'Patient:    http://localhost:8085/smartcare/frontends/frontoffice/'
Write-Host 'Staff:      http://localhost:8085/smartcare/frontends/backoffice/'
Write-Host 'Simulation: http://localhost:8085/smartcare/frontends/backoffice/#simulation'
