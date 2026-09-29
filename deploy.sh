#!/bin/bash
# =============================================================
# EC2 Deployment Script for K K's Food House
# Target: Ubuntu/Amazon Linux EC2 Instance
# Public IP: 15.252.17.218
# =============================================================

set -e

echo "============================================="
echo "  K K's Food House - EC2 Deployment Setup"
echo "============================================="

# 1. System Update
echo "[1/7] Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y 2>/dev/null || \
sudo yum update -y 2>/dev/null

# 2. Install Node.js 18+ (using NodeSource)
echo "[2/7] Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - 2>/dev/null || \
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo -E bash - 2>/dev/null
    sudo apt-get install -y nodejs 2>/dev/null || sudo yum install -y nodejs 2>/dev/null
fi
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# 3. Install PM2 (process manager for production)
echo "[3/7] Installing PM2 process manager..."
sudo npm install -g pm2

# 4. Install project dependencies
echo "[4/7] Installing project dependencies..."
npm install --production=false

# 5. Build the frontend
echo "[5/7] Building frontend for production..."
npm run build

# 6. Open port 3000 in iptables (in case UFW or iptables blocks it)
echo "[6/7] Configuring firewall..."
# For UFW (Ubuntu)
if command -v ufw &> /dev/null; then
    sudo ufw allow 3000/tcp 2>/dev/null || true
    sudo ufw allow 80/tcp 2>/dev/null || true
    sudo ufw allow 443/tcp 2>/dev/null || true
fi
# For iptables fallback
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || true

# 7. Start with PM2
echo "[7/7] Starting application with PM2..."
pm2 stop kks-food-house 2>/dev/null || true
pm2 delete kks-food-house 2>/dev/null || true

PORT=3000 NODE_ENV=production pm2 start server/index.js \
  --name "kks-food-house" \
  --max-memory-restart 512M \
  --log-date-format "YYYY-MM-DD HH:mm:ss" \
  --merge-logs

# Save PM2 process list so it auto-starts on reboot
pm2 save
pm2 startup 2>/dev/null || echo "Run the command above with sudo if prompted"

echo ""
echo "============================================="
echo "  ✅ Deployment Complete!"
echo "============================================="
echo ""
echo "  App URL:   http://15.252.17.218:3000"
echo ""
echo "  PM2 Commands:"
echo "    pm2 status          - Check app status"
echo "    pm2 logs            - View live logs"
echo "    pm2 restart all     - Restart app"
echo "    pm2 monit           - Monitor dashboard"
echo ""
echo "============================================="
