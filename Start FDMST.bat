@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install Node.js 20.19 or newer, then try again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm included, then try again.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 20 || (major === 20 && minor < 19)) process.exit(1)"
if errorlevel 1 (
  echo Node.js 20.19 or newer is required.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Missing .env. Create it from .env.example and configure the required settings.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing project dependencies...
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting FDMST. Your browser will open at http://localhost:5173 when ready.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$deadline = (Get-Date).AddSeconds(60); do { try { $response = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 2 -UseBasicParsing; if ($response.StatusCode -ge 200) { Start-Process 'http://localhost:5173'; exit 0 } } catch { }; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('FDMST did not become available at http://localhost:5173 within 60 seconds.') | Out-Null"
call npm run dev
if errorlevel 1 (
  echo FDMST stopped with an error.
  pause
)
