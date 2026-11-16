# Dev-only seed script (placeholder/instructions). Requires app/Maven environment.
# Creates/updates dev users with password "ChangeMe123!" using PasswordHasher logic is non-trivial in PS;
# prefer running a Java seeder or insert pre-hashed docs. This file documents intended dev users:
# - patient1 (PATIENT, active) email patient1@smartcare.local
# - pro1 (PROFESSIONAL, active) email pro1@smartcare.local
# - admin1 (ADMIN, active) email admin1@smartcare.local
# TODO: implement Java-based seeder class or mongosh snippet with precomputed PBKDF2 hash.
Write-Host "Seed dev users: implement via Java seeder (recommended) with PBKDF2 hash for 'ChangeMe123!'."
