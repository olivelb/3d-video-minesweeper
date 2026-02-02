# Deployment script for Raspberry Pi (PowerShell)
# Uses the deployment workflow from .github/skills/raspberry-pi-manager/SKILL.md

$RASPI_HOST = "raspberrol"
$RASPI_USER = "olivier"
$REMOTE_DIR = "/home/olivier/minesweeper"
$LOCAL_DIR = $PSScriptRoot
$SSH_KEY = "$env:USERPROFILE\.ssh\id_minesweeper"
$PROJECT_ROOT = Split-Path -Parent $LOCAL_DIR

Write-Host "🚀 Deploying Minesweeper Multiplayer Server to Raspberry Pi..." -ForegroundColor Cyan

# Step 1: Compress using WSL tar (excluding node_modules)
Write-Host "📦 Compressing server-multiplayer folder..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
wsl tar --exclude="node_modules" -czf deploy-multiplayer.tar.gz server-multiplayer/

# Step 2: Transfer to Pi
Write-Host "📤 Transferring to Raspberry Pi..." -ForegroundColor Yellow
scp -i "$SSH_KEY" deploy-multiplayer.tar.gz "${RASPI_USER}@${RASPI_HOST}:${REMOTE_DIR}/"

# Step 3: Extract on Pi and install dependencies
Write-Host "📥 Extracting and setting up on Pi..." -ForegroundColor Yellow
ssh -i "$SSH_KEY" "${RASPI_USER}@${RASPI_HOST}" "cd ${REMOTE_DIR} && tar -xzf deploy-multiplayer.tar.gz && cd server-multiplayer && npm install --production"

# Step 4: Start or restart with PM2
Write-Host "🔄 Starting server with PM2..." -ForegroundColor Yellow
ssh -i "$SSH_KEY" "${RASPI_USER}@${RASPI_HOST}" "cd ${REMOTE_DIR}/server-multiplayer && pm2 delete minesweeper-multiplayer 2>/dev/null; pm2 start server.js --name minesweeper-multiplayer"

# Cleanup local tar
Remove-Item deploy-multiplayer.tar.gz -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  Check status:  ssh -i ~/.ssh/id_minesweeper olivier@raspberrol 'pm2 status'"
Write-Host "  View logs:     ssh -i ~/.ssh/id_minesweeper olivier@raspberrol 'pm2 logs minesweeper-multiplayer --lines 50'"
Write-Host "  Restart:       ssh -i ~/.ssh/id_minesweeper olivier@raspberrol 'pm2 restart minesweeper-multiplayer'"
