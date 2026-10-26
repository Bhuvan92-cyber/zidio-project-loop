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

Write-Host "Running Playwright E2E test..."
& node --import tsx --test tests/rbac-e2e.test.ts

$testExitCode = $LASTEXITCODE

Write-Host "Stopping test PostgreSQL..."
& $pgCtl -D $dataDir stop

exit $testExitCode
