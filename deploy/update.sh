#!/bin/bash
# ============================================================
# ATTENDX Quick Update Script
# Run this on the server after pushing new code to GitHub:
#   sudo /home/attendx/attendx/deploy/update.sh
# ============================================================

set -e

echo "🔄 Updating ATTENDX..."

cd /home/attendx/attendx

# Pull latest code
echo "[1/4] Pulling latest code..."
sudo -u attendx git pull origin main

# Install any new Python dependencies
echo "[2/4] Updating Python dependencies..."
cd backend
sudo -u attendx ./venv/bin/pip install -r requirements.txt --quiet

# Restart the service
echo "[3/4] Restarting service..."
systemctl restart attendx

# Check status
echo "[4/4] Checking service status..."
sleep 2
systemctl status attendx --no-pager

echo ""
echo "✅ Update complete!"
echo "📋 Logs: journalctl -u attendx -f"
