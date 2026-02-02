#!/bin/bash
# Deployment script for Raspberry Pi

# Configuration
RASPI_HOST="raspberrol.local"
RASPI_USER="olivier"
REMOTE_DIR="/home/olivier/minesweeper-server"

echo "🚀 Deploying Minesweeper Multiplayer Server to Raspberry Pi..."

# Create directory on Raspberry Pi
echo "📁 Creating remote directory..."
ssh ${RASPI_USER}@${RASPI_HOST} "mkdir -p ${REMOTE_DIR}"

# Copy files (excluding node_modules)
echo "📦 Copying files..."
rsync -avz --exclude 'node_modules' --exclude '.env' \
    ./ ${RASPI_USER}@${RASPI_HOST}:${REMOTE_DIR}/

# Install dependencies on Raspberry Pi
echo "📥 Installing dependencies..."
ssh ${RASPI_USER}@${RASPI_HOST} "cd ${REMOTE_DIR} && npm install --production"

# Copy .env if it doesn't exist
echo "⚙️  Setting up configuration..."
ssh ${RASPI_USER}@${RASPI_HOST} "cd ${REMOTE_DIR} && [ ! -f .env ] && cp .env.example .env || echo '.env already exists'"

# Restart the service (if systemd service exists)
echo "🔄 Restarting service..."
ssh ${RASPI_USER}@${RASPI_HOST} "sudo systemctl restart minesweeper 2>/dev/null || echo 'Service not configured yet. Run: npm start'"

echo "✅ Deployment complete!"
echo ""
echo "To start manually:"
echo "  ssh ${RASPI_USER}@${RASPI_HOST}"
echo "  cd ${REMOTE_DIR}"
echo "  npm start"
