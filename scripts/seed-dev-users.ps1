# DEV ONLY - seeds SmartCare users into MongoDB with PBKDF2 password hashes.
# Passwords are read from environment variables and never stored in the repo.
# Running twice does not create duplicates (upsert by email with stable userId on insert).

$ErrorActionPreference = 'Stop'

function Get-RequiredEnv([string]$name) {
    $val = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrEmpty($val)) {
        throw "Missing required environment variable: $name"
    }
    return $val
}

$patientPw = Get-RequiredEnv 'DEV_PATIENT_PASSWORD'
$proPw = Get-RequiredEnv 'DEV_PROFESSIONAL_PASSWORD'
$adminPw = Get-RequiredEnv 'DEV_ADMIN_PASSWORD'

Add-Type -TypeDefinition @"
using System;
using System.Security.Cryptography;
public static class ScHasherV2 {
    public static string Hash(string password) {
        const int iterations = 210000;
        byte[] salt = new byte[16];
        using (var rng = RandomNumberGenerator.Create()) { rng.GetBytes(salt); }
        byte[] derived;
        using (var pbkdf2 = new Rfc2898DeriveBytes(password, salt, iterations, HashAlgorithmName.SHA256)) {
            derived = pbkdf2.GetBytes(32);
        }
        return "pbkdf2`$PBKDF2WithHmacSHA256`$" + iterations + "$" + Convert.ToBase64String(salt) + "$" + Convert.ToBase64String(derived);
    }
}
"@ -ErrorAction SilentlyContinue

function Escape-JsSingle([string]$s) {
    return $s.Replace('\', '\\').Replace("'", "\'")
}

$users = @(
    @{ userId = 'dev-patient-1';      email = 'patient@smartcare.local';      role = 'PATIENT';      hash = [ScHasherV2]::Hash($patientPw) },
    @{ userId = 'dev-professional-1'; email = 'professional@smartcare.local'; role = 'PROFESSIONAL'; hash = [ScHasherV2]::Hash($proPw) },
    @{ userId = 'dev-admin-1';        email = 'admin@smartcare.local';        role = 'ADMIN';        hash = [ScHasherV2]::Hash($adminPw) }
)

$mongoContainer = if ($env:MONGO_CONTAINER) { $env:MONGO_CONTAINER } else { 'smartcare-mongodb' }
$mongoDb = if ($env:MONGO_DB) { $env:MONGO_DB } else { 'smartcare' }

foreach ($u in $users) {
    $email = Escape-JsSingle $u.email
    $userId = Escape-JsSingle $u.userId
    $role = Escape-JsSingle $u.role
    $hash = Escape-JsSingle $u.hash
    $js = @"
db.users.updateOne(
  { email: '$email' },
  {
    `$set: { email: '$email', passwordHash: '$hash', role: '$role', active: true },
    `$setOnInsert: { userId: '$userId', createdAt: new Date() }
  },
  { upsert: true }
);
"@
    docker exec $mongoContainer mongosh $mongoDb --quiet --eval $js | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to seed user $($u.email)" }
    Write-Host "Seeded: $($u.email) [$($u.role)]"
}

Write-Host "Done. DEV users ensured (no duplicates on re-run)."