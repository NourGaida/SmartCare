param(
    [string]$DeviceId = "sc-test",
    [string]$BootId = [guid]::NewGuid().ToString(),
    [long]$Sequence = 1,
    [string]$BrokerContainer = "smartcare-mosquitto",
    [string]$TopicPrefix = "smartcare/v1/validated",
    [string]$AcquiredAtUtc = [DateTimeOffset]::UtcNow.ToString("o"),
    [ValidateSet("good", "invalid")]
    [string]$Quality = "good",
    [int]$HeartRate = 75,
    [int]$Spo2 = 98,
    [string]$Reason = $null,
    [string]$ClockStatus = "synced",
    [string]$Source = "manual-test"
)

if ($Quality -eq "invalid" -and [string]::IsNullOrWhiteSpace($Reason)) {
    throw "Reason is required when Quality is invalid."
}

$heartRateValue = if ($Quality -eq "good") { $HeartRate } else { $null }
$spo2Value = if ($Quality -eq "good") { $Spo2 } else { $null }

$payload = [ordered]@{
    schemaVersion = 1
    deviceId = $DeviceId
    bootId = $BootId
    sequence = $Sequence
    acquiredAtUtc = $AcquiredAtUtc
    heartRate = $heartRateValue
    spo2 = $spo2Value
    quality = $Quality
    reason = $Reason
    clockStatus = $ClockStatus
    source = $Source
}

$json = $payload | ConvertTo-Json -Compress -Depth 3
$topic = "$TopicPrefix/$DeviceId"
$json | docker exec -i $BrokerContainer mosquitto_pub -t $topic -q 1 -s
if ($LASTEXITCODE -ne 0) {
    throw "mosquitto_pub failed with exit code $LASTEXITCODE."
}

Write-Output "Published sequence $Sequence for $DeviceId to $topic"
