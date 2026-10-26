$ErrorActionPreference = "Continue"

$pgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
$createDb = "C:\Program Files\PostgreSQL\18\bin\createdb.exe"
$dataDir = ".\.test-pgdata"
$port = 5433

Write-Host "Starting test PostgreSQL on port $port..."
& $pgCtl -D $dataDir -l "$dataDir\server.log" -o "-p $port" start
Start-Sleep -Seconds 2

Write-Host "Creating test database if not exists..."
& $createDb -p $port -U postgres zidio_loop_test 2>$null

$testUrl = "postgresql://postgres@localhost:$port/zidio_loop_test"
$env:DATABASE_URL = $testUrl
$env:TEST_DATABASE_URL = $testUrl

Write-Host "Pushing schema to test database on port $port..."
& node -e "const { execSync } = require('child_process'); execSync('npx prisma db push --skip-generate --accept-data-loss', { env: { ...process.env, DATABASE_URL: '$testUrl', DIRECT_URL: '$testUrl' }, stdio: 'inherit' });"

Write-Host "Running integration and persistence tests..."
& node --experimental-test-module-mocks --import tsx --test tests/prisma-tenant.integration.test.ts tests/rbac-persistence.integration.test.ts tests/rbac-api-matrix.integration.test.ts

$testExitCode = $LASTEXITCODE

Write-Host "Stopping test PostgreSQL..."
& $pgCtl -D $dataDir stop

exit $testExitCode
