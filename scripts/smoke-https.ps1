param([string]$Repo = (Get-Location).Path)

$ErrorActionPreference = 'Stop'
$hosts = @(
  @{ Host = 'app.smartcare.local'; App = 'frontoffice' },
  @{ Host = 'staff.smartcare.local'; App = 'backoffice' }
)
$fonts = @('dm-sans-latin-v17.woff2','dm-sans-latin-ext-v17.woff2','manrope-latin-v23.woff2','manrope-latin-ext-v23.woff2')
$passed = 0
$failed = 0

function Invoke-CurlGet([string]$Url) {
  $raw = @(curl.exe --ssl-no-revoke -sS -o NUL -D - -w "`nHTTP_STATUS:%{http_code}" $Url 2>&1)
  $code = ($raw | Where-Object { $_ -like 'HTTP_STATUS:*' } | Select-Object -Last 1)
  if (-not $code) { throw "curl returned no status for $Url" }
  $headers = @{}
  foreach ($line in $raw) {
    if ($line -match '^([^:]+):\s*(.*)$') { $headers[$matches[1].ToLower()] = $matches[2].Trim() }
  }
  [pscustomobject]@{ Status = [int]$code.Substring(12); Headers = $headers }
}

function Expected-Type([string]$Path) {
  switch -Regex ($Path) {
    '\.mjs$' { return 'text/javascript' }
    '\.js$' { return 'application/javascript' }
    '\.css$' { return 'text/css' }
    '\.svg$' { return 'image/svg+xml' }
    '\.png$' { return 'image/png' }
    '\.woff2$' { return 'font/woff2' }
    '\.json$' { return 'application/json' }
    '\.webmanifest$' { return 'application/manifest+json' }
    default { return $null }
  }
}

function Assert-Check([string]$Label, [bool]$Condition, [string]$Detail) {
  if ($Condition) {
    $script:passed++
    "PASS $Label :: $Detail"
  } else {
    $script:failed++
    "FAIL $Label :: $Detail"
  }
}

function Get-References([string]$Html, [string]$Base) {
  $paths = [System.Collections.Generic.List[string]]::new()
  foreach ($match in [regex]::Matches($Html, '(?:href|src)="(\.[^"#]+)"')) {
    $uri = [uri]::new([uri]$Base, $match.Groups[1].Value)
    if (-not $paths.Contains($uri.AbsolutePath)) { $paths.Add($uri.AbsolutePath) }
  }
  return ,$paths
}

foreach ($entry in $hosts) {
  $hostName = $entry.Host
  $base = "https://$hostName/"
  $html = Get-Content -LiteralPath (Join-Path $Repo "frontends\$($entry.App)\index.html") -Raw
  $paths = Get-References $html $base
  foreach ($extra in @('sw.js','icon-512.png','shared/server-mode.mjs')) {
    if (-not $paths.Contains("/$extra")) { $paths.Add("/$extra") }
  }
  foreach ($font in $fonts) {
    $fontPath = "/fonts/$font"
    if (-not $paths.Contains($fontPath)) { $paths.Add($fontPath) }
  }

  "=== $hostName ($($entry.App)) ==="

  foreach ($path in @('/', '/index.html', '/frontoffice/index.html', '/backoffice/index.html')) {
    $result = Invoke-CurlGet "https://$hostName$path"
    $type = $result.Headers['content-type']
    $bareType = if ($type) { ($type -split ';')[0].Trim() } else { '' }
    $disposition = $result.Headers['content-disposition']
    Assert-Check "$hostName$path html" ($result.Status -eq 200 -and $bareType -like 'text/html*' -and -not $disposition) "status=$($result.Status) content-type=$bareType content-disposition=$(if ($disposition) { $disposition } else { '<none>' })"
  }

  $jsonPath = if ($entry.App -eq 'frontoffice') { '/fixtures/measurement-history.json' } else { '/frontoffice/fixtures/measurement-history.json' }
  $mjsPath = if ($entry.App -eq 'frontoffice') { '/portal.mjs' } else { '/views.mjs' }
  $mimeCases = @(
    @{ Label = 'css'; Path = '/styles.css' },
    @{ Label = 'mjs'; Path = $mjsPath },
    @{ Label = 'svg'; Path = '/icon.svg' },
    @{ Label = 'png'; Path = '/icon-192.png' },
    @{ Label = 'woff2'; Path = '/fonts/dm-sans-latin-v17.woff2' },
    @{ Label = 'json'; Path = $jsonPath },
    @{ Label = 'webmanifest'; Path = '/manifest.webmanifest' }
  )
  foreach ($case in $mimeCases) {
    $result = Invoke-CurlGet "https://$hostName$($case.Path)"
    $type = $result.Headers['content-type']
    $bareType = if ($type) { ($type -split ';')[0].Trim() } else { '' }
    $expected = Expected-Type $case.Path
    Assert-Check "$hostName mime $($case.Label)" ($result.Status -eq 200 -and $bareType -eq $expected) "path=$($case.Path) status=$($result.Status) content-type=$bareType expected=$expected"
  }

  foreach ($path in $paths) {
    $url = "https://$hostName$path"
    $result = Invoke-CurlGet $url
    $type = $result.Headers['content-type']
    $bareType = if ($type) { ($type -split ';')[0].Trim() } else { '' }
    $expected = Expected-Type $path
    $ok = $result.Status -eq 200
    if ($expected) { $ok = $ok -and $bareType -eq $expected }
    Assert-Check "$hostName$path" $ok "status=$($result.Status) content-type=$bareType"
  }

  $sw = Invoke-CurlGet "https://$hostName/sw.js"
  Assert-Check "$hostName sw.js cache" ($sw.Status -eq 200 -and $sw.Headers['cache-control'] -eq 'no-cache' -and $sw.Headers['service-worker-allowed'] -eq '/') "cache-control=$($sw.Headers['cache-control']) service-worker-allowed=$($sw.Headers['service-worker-allowed'])"
  Assert-Check "$hostName sw.js security" ($null -ne $sw.Headers['content-security-policy'] -and $null -ne $sw.Headers['strict-transport-security']) "csp=$([bool]$sw.Headers['content-security-policy']) hsts=$([bool]$sw.Headers['strict-transport-security'])"

  $css = Invoke-CurlGet "https://$hostName/styles.css"
  Assert-Check "$hostName 200 cache" ($css.Status -eq 200 -and $css.Headers['cache-control'] -like 'public, max-age=3600*' -and $css.Headers['cache-control'] -notlike '*no-store*') "cache-control=$($css.Headers['cache-control'])"

  $font = Invoke-CurlGet "https://$hostName/fonts/$($fonts[0])"
  Assert-Check "$hostName font cache" ($font.Status -eq 200 -and $font.Headers['cache-control'] -like '*immutable*') "cache-control=$($font.Headers['cache-control'])"

  $missing = Invoke-CurlGet "https://$hostName/definitely-missing-404.css"
  $missingControl = $missing.Headers['cache-control']
  Assert-Check "$hostName 404 cache" ($missing.Status -eq 404 -and $missingControl -eq 'no-store' -and $missingControl -notlike '*max-age*') "status=$($missing.Status) cache-control=$missingControl"
  Assert-Check "$hostName 404 security" ($null -ne $missing.Headers['content-security-policy']) "csp=$([bool]$missing.Headers['content-security-policy'])"
}

"SUMMARY pass=$passed fail=$failed"
if ($failed -gt 0) { exit 1 }
