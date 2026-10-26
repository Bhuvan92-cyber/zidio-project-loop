$ErrorActionPreference = "Continue"

$pgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
$createDb = "C:\Program Files\PostgreSQL\18\bin\createdb.exe"
$dataDir = ".\.test-pgdata"
$port = 5433

Write-Host "Starting test PostgreSQL on port $port..."
& $pgCtl -D $dataDir -l "$dataDir\server.log" -o "-p $port" start
Start-Sleep -Seconds 2

$testUrl = "postgresql://postgres@localhost:$port/zidio_loop_test"
$env:DATABASE_URL = $testUrl
$env:TEST_DATABASE_URL = $testUrl

Write-Host "Syncing Prisma schema to test DB..."
& node -e "const { execSync } = require('child_process'); execSync('npx prisma db push --skip-generate --accept-data-loss', { env: { ...process.env, DATABASE_URL: '$testUrl', DIRECT_URL: '$testUrl' }, stdio: 'inherit' });"

Write-Host "`n=== 1. Unit Tests ==="
& node --experimental-test-module-mocks --import tsx --test tests/**/*.unit.test.ts
$unitCode = $LASTEXITCODE

Write-Host "`n=== 2. Existing Unit & Integration Tests ==="
& node --experimental-test-module-mocks --import tsx --test tests/route-auth.test.ts tests/feedback-query.test.ts tests/dashboard.test.ts tests/csv-import.test.ts tests/ask-loop.test.ts tests/ai-resilience.test.ts tests/auth.test.ts
$existingCode = $LASTEXITCODE

Write-Host "`n=== 3. Real PostgreSQL Tenant & RBAC Persistence Integration Tests ==="
& node --experimental-test-module-mocks --import tsx --test tests/prisma-tenant.integration.test.ts tests/rbac-persistence.integration.test.ts tests/rbac-api-matrix.integration.test.ts
$integrationCode = $LASTEXITCODE

Write-Host "`n=== 4. Playwright Headless Browser E2E Test ==="
& node --import tsx --test tests/rbac-e2e.test.ts
$e2eCode = $LASTEXITCODE

Write-Host "Stopping test PostgreSQL..."
& $pgCtl -D $dataDir stop

Write-Host "`n=== Summary ==="
Write-Host "Unit Tests Exit Code: $unitCode"
Write-Host "Existing Tests Exit Code: $existingCode"
Write-Host "Integration Tests Exit Code: $integrationCode"
Write-Host "E2E Test Exit Code: $e2eCode"

if ($unitCode -ne 0 -or $existingCode -ne 0 -or $integrationCode -ne 0 -or $e2eCode -ne 0) {
  exit 1
} else {
  exit 0
}
