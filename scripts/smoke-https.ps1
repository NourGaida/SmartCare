param([string]$Repo = (Get-Location).Path, [switch]$WithLogin)

$ErrorActionPreference = 'Stop'
$hosts = @(
  @{ Host = 'app.smartcare.local'; App = 'frontoffice' },
  @{ Host = 'staff.smartcare.local'; App = 'backoffice' }
)
$fonts = @('dm-sans-latin-v17.woff2','dm-sans-latin-ext-v17.woff2','manrope-latin-v23.woff2','manrope-latin-ext-v23.woff2')
$passed = 0
$failed = 0
$gaps = 0

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

function Invoke-Api([string]$Method, [string]$Url, [string]$BodyFile, [string]$Jar, [hashtable]$Headers = @{}, [string]$Body) {
  $curlArgs = @('--ssl-no-revoke','-sS','-D','-','-o',$BodyFile,'-w',"`nHTTP_STATUS:%{http_code}",'-X',$Method,'-H','Accept: application/json')
  if ($Jar) { $curlArgs += @('-b',$Jar,'-c',$Jar) }
  foreach ($name in $Headers.Keys) { $curlArgs += @('-H',"$($name): $($Headers[$name])") }
  if ($PSBoundParameters.ContainsKey('Body')) { $curlArgs += @('-H','Content-Type: application/json','--data-raw',$Body) }
  $curlArgs += $Url
  $raw = @(curl.exe @curlArgs 2>&1)
  $code = ($raw | Where-Object { $_ -like 'HTTP_STATUS:*' } | Select-Object -Last 1)
  if (-not $code) { throw "curl returned no status for $Url" }
  $parsed = @{}
  foreach ($line in $raw) {
    if ($line -match '^([^:]+):\s*(.*)$') { $parsed[$matches[1].ToLower()] = $matches[2].Trim() }
  }
  $cookies = @($raw | Where-Object { $_ -match '^Set-Cookie:\s*(.*)$' } | ForEach-Object { $matches[1] })
  $bodyText = Get-Content -LiteralPath $BodyFile -Raw
  [pscustomobject]@{ Status = [int]$code.Substring(12); Headers = $parsed; SetCookies = $cookies; Body = $bodyText }
}

function Read-Json([string]$Text) {
  try { return ($Text | ConvertFrom-Json -ErrorAction Stop) } catch { return $null }
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

function Report-Gap([string]$Label, [string]$Detail) {
  $script:gaps++
  "GAP $Label :: $Detail"
}

function Get-References([string]$Html, [string]$Base) {
  $paths = [System.Collections.Generic.List[string]]::new()
  foreach ($match in [regex]::Matches($Html, '(?:href|src)="(\.[^"#]+)"')) {
    $uri = [uri]::new([uri]$Base, $match.Groups[1].Value)
    if (-not $paths.Contains($uri.AbsolutePath)) { $paths.Add($uri.AbsolutePath) }
  }
  return ,$paths
}

function Expected-Role([string]$Email) {
  switch ($Email.Trim().ToLowerInvariant()) {
    'patient@smartcare.local' { return 'PATIENT' }
    'professional@smartcare.local' { return 'PROFESSIONAL' }
    'admin@smartcare.local' { return 'ADMIN' }
    default { return '' }
  }
}

function Test-ExpiredCookie($Response) {
  $text = $Response.SetCookies -join '; '
  return ($text -match 'Max-Age=0' -or $text -match 'Expires=Thu, 01 Jan 1970')
}

function Invoke-Login([string]$HostName, [string]$Email, [string]$Password, [string]$Jar, [string]$BodyFile, [string]$Label) {
  $payload = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
  $response = Invoke-Api -Method POST -Url "https://$HostName/api/auth/login" -BodyFile $BodyFile -Jar $Jar -Body $payload
  $data = Read-Json $response.Body
  $csrf = if ($data) { $data.csrfToken } else { '' }
  $cookie = $response.SetCookies -join '; '
  Assert-Check "$Label login" ($response.Status -eq 200 -and [bool]$csrf) "status=$($response.Status) csrf_present=$([bool]$csrf)"
  Assert-Check "$Label cookie flags" ($cookie -match 'SMARTCARE_SESSION=' -and $cookie -match 'Secure' -and $cookie -match 'HttpOnly' -and $cookie -match 'SameSite=Strict' -and $cookie -match 'Path=/' -and $cookie -notmatch 'Domain=') "secure=$([bool]($cookie -match 'Secure')) httponly=$([bool]($cookie -match 'HttpOnly')) samesite_strict=$([bool]($cookie -match 'SameSite=Strict')) path_root=$([bool]($cookie -match 'Path=/')) domain_absent=$($cookie -notmatch 'Domain=')"
  return $data
}

function Test-NegativeLogin([string]$HostName, [string]$Email, [string]$Jar, [string]$BodyFile, [string]$Label) {
  $wrongPassword = '__definitely_wrong__'
  $known = @{ email = $Email; password = $wrongPassword } | ConvertTo-Json -Compress
  $unknown = @{ email = 'no-such-user@smartcare.invalid'; password = $wrongPassword } | ConvertTo-Json -Compress
  $a = Invoke-Api -Method POST -Url "https://$HostName/api/auth/login" -BodyFile $BodyFile -Jar $Jar -Body $known
  $b = Invoke-Api -Method POST -Url "https://$HostName/api/auth/login" -BodyFile $BodyFile -Jar $Jar -Body $unknown
  $da = Read-Json $a.Body
  $db = Read-Json $b.Body
  $neutral = $a.Status -eq 401 -and $b.Status -eq 401 -and $da.error -eq 'invalid_credentials' -and $db.error -eq 'invalid_credentials' -and $da.message -eq $db.message
  Assert-Check "$Label wrong password" $neutral "wrong_status=$($a.Status) unknown_status=$($b.Status) same_error=$($da.error -eq $db.error) same_message=$($da.message -eq $db.message)"
  "NOTE $Label lockout threshold=5 failures in 15 minutes (6th returns 429); this check uses 2 failures and a following successful login resets the counters"
}

function Test-CsrfLogout([string]$HostName, [string]$Csrf, [string]$Jar, [string]$BodyFile, [string]$Label) {
  $negative = Invoke-Api -Method POST -Url "https://$HostName/api/auth/logout" -BodyFile $BodyFile -Jar $Jar
  $negativeBody = Read-Json $negative.Body
  Assert-Check "$Label CSRF without header" ($negative.Status -eq 403 -and $negativeBody.error -eq 'csrf_invalid') "status=$($negative.Status) error=$($negativeBody.error)"
  $stillAlive = Invoke-Api -Method GET -Url "https://$HostName/api/session" -BodyFile $BodyFile -Jar $Jar
  Assert-Check "$Label session survives missing CSRF" ($stillAlive.Status -eq 200) "status=$($stillAlive.Status)"
  $positive = Invoke-Api -Method POST -Url "https://$HostName/api/auth/logout" -BodyFile $BodyFile -Jar $Jar -Headers @{ 'X-CSRF-Token' = $Csrf }
  Assert-Check "$Label CSRF with header" ($positive.Status -eq 204 -and (Test-ExpiredCookie $positive)) "status=$($positive.Status) cookie_expired=$(Test-ExpiredCookie $positive)"
  $after = Invoke-Api -Method GET -Url "https://$HostName/api/session" -BodyFile $BodyFile -Jar $Jar
  Assert-Check "$Label session invalid after CSRF logout" ($after.Status -eq 401) "status=$($after.Status)"
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

if ($WithLogin) {
  $email = $env:SMARTCARE_DEV_EMAIL
  $password = $env:SMARTCARE_DEV_PASSWORD
  if (-not $email -or -not $password) { throw 'WithLogin requires SMARTCARE_DEV_EMAIL and SMARTCARE_DEV_PASSWORD in the process environment.' }
  $expectedRole = Expected-Role $email
  if (-not $expectedRole) { throw 'SMARTCARE_DEV_EMAIL must be one of the documented dev seed accounts (patient/professional/admin@smartcare.local).' }

  $wrongJar = [IO.Path]::GetTempFileName()
  $mainJar = [IO.Path]::GetTempFileName()
  $csrfJar = [IO.Path]::GetTempFileName()
  $bodyFile = [IO.Path]::GetTempFileName()
  try {
    foreach ($entry in $hosts) {
      $hostName = $entry.Host
      "=== $hostName backend ($expectedRole) ==="

      $health = Invoke-Api -Method GET -Url "https://$HostName/api/health" -BodyFile $bodyFile
      $healthBody = Read-Json $health.Body
      Assert-Check "$hostName api health rewrite" ($health.Status -eq 200 -and $healthBody.status -eq 'ok') "status=$($health.Status) backend_body=$(if ($healthBody) { $healthBody.status } else { '<invalid-json>' }) rewrite=/api/ -> /smartcare/api/"

      Test-NegativeLogin $hostName $email $wrongJar $bodyFile "$hostName negative login"

      $login = Invoke-Login $hostName $email $password $mainJar $bodyFile "$hostName main"
      Assert-Check "$hostName login role" ($login.role -eq $expectedRole) "role=$($login.role) expected=$expectedRole"
      $session = Invoke-Api -Method GET -Url "https://$HostName/api/session" -BodyFile $bodyFile -Jar $mainJar
      $sessionBody = Read-Json $session.Body
      Assert-Check "$hostName who am i" ($session.Status -eq 200 -and $sessionBody.role -eq $expectedRole) "status=$($session.Status) role=$($sessionBody.role) expected=$expectedRole"

      $patientRoute = Invoke-Api -Method GET -Url "https://$HostName/api/me/measurements" -BodyFile $bodyFile -Jar $mainJar
      $patientBody = Read-Json $patientRoute.Body
      if ($expectedRole -eq 'PATIENT') {
        Assert-Check "$hostName patient route" ($patientRoute.Status -eq 200 -or $patientRoute.Status -eq 503) "status=$($patientRoute.Status) role_check=PATIENT_accepted"
      } else {
        Assert-Check "$hostName patient route" ($patientRoute.Status -eq 403 -and $patientBody.error -eq 'forbidden') "status=$($patientRoute.Status) error=$($patientBody.error) role_check=non_patient_rejected"
      }
      Report-Gap "$hostName cross-app role" "no backend staff-only route exists; /api/session returns any authenticated role and portal segregation is client-side only (login-completion task)"

      $csrfLogin = Invoke-Login $hostName $email $password $csrfJar $bodyFile "$hostName csrf"
      Test-CsrfLogout $hostName $csrfLogin.csrfToken $csrfJar $bodyFile "$hostName csrf"

      $logout = Invoke-Api -Method POST -Url "https://$HostName/api/auth/logout" -BodyFile $bodyFile -Jar $mainJar -Headers @{ 'X-CSRF-Token' = $login.csrfToken }
      Assert-Check "$hostName logout" ($logout.Status -eq 204 -and (Test-ExpiredCookie $logout)) "status=$($logout.Status) cookie_expired=$(Test-ExpiredCookie $logout)"
      $afterLogout = Invoke-Api -Method GET -Url "https://$HostName/api/session" -BodyFile $bodyFile -Jar $mainJar
      Assert-Check "$hostName who am i after logout" ($afterLogout.Status -eq 401) "status=$($afterLogout.Status)"
    }
  } finally {
    foreach ($file in @($wrongJar, $mainJar, $csrfJar, $bodyFile)) {
      if ($file -and (Test-Path -LiteralPath $file)) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
    }
  }
}

if ($WithLogin) {
  "SUMMARY pass=$passed fail=$failed gap=$gaps"
} else {
  "SUMMARY pass=$passed fail=$failed"
}
if ($failed -gt 0) { exit 1 }
