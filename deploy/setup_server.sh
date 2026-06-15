#!/bin/bash
# ============================================================
# ATTENDX Production Server Setup — Oracle Cloud Ubuntu 22.04
# Run this script once after creating your VM:
#   chmod +x setup_server.sh && sudo ./setup_server.sh
# ============================================================

set -e

echo "============================================"
echo "  ATTENDX Production Server Setup"
echo "============================================"

# ── 1. System updates ──
echo "[1/10] Updating system packages..."
apt update && apt upgrade -y

# ── 2. Install Python 3.11 + build tools ──
echo "[2/10] Installing Python 3.11 and build tools..."
apt install -y software-properties-common
add-apt-repository -y ppa:deadsnakes/ppa
apt update
apt install -y python3.11 python3.11-venv python3.11-dev python3-pip
apt install -y build-essential cmake pkg-config
apt install -y libboost-all-dev libopenblas-dev liblapack-dev
apt install -y libx11-dev libgtk-3-dev libatlas-base-dev gfortran
apt install -y libjpeg-dev libpng-dev libtiff-dev
apt install -y git curl wget nginx certbot python3-certbot-nginx

# ── 3. Install MySQL ──
echo "[3/10] Installing MySQL Server..."
apt install -y mysql-server
systemctl start mysql
systemctl enable mysql

# Create database and user
echo "[4/10] Setting up database..."
mysql -u root <<EOF
CREATE DATABASE IF NOT EXISTS attendance_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'attendx'@'localhost' IDENTIFIED BY 'AttendX_Prod_2024!';
GRANT ALL PRIVILEGES ON attendance_db.* TO 'attendx'@'localhost';
FLUSH PRIVILEGES;
EOF
echo "  ✅ Database 'attendance_db' created"
echo "  ✅ User 'attendx' created"

# ── 4. Create app user ──
echo "[5/10] Creating application user..."
useradd -m -s /bin/bash attendx 2>/dev/null || echo "  User 'attendx' already exists"

# ── 5. Clone the project ──
echo "[6/10] Cloning ATTENDX repository..."
cd /home/attendx
if [ -d "attendx" ]; then
    cd attendx && git pull origin main
else
    sudo -u attendx git clone https://github.com/manaspediredla/attendx.git
    cd attendx
fi

# ── 6. Python virtual environment + dependencies ──
echo "[7/10] Setting up Python environment (this may take 10-15 min for dlib)..."
cd /home/attendx/attendx/backend
sudo -u attendx python3.11 -m venv venv
sudo -u attendx ./venv/bin/pip install --upgrade pip setuptools wheel
sudo -u attendx ./venv/bin/pip install -r requirements.txt
sudo -u attendx ./venv/bin/pip install gunicorn

# ── 7. Copy production environment file ──
echo "[8/10] Setting up environment variables..."
if [ ! -f /home/attendx/attendx/backend/.env ]; then
    cp /home/attendx/attendx/deploy/.env.production /home/attendx/attendx/backend/.env
    echo "  ⚠️  EDIT /home/attendx/attendx/backend/.env with your actual values!"
fi
chown attendx:attendx /home/attendx/attendx/backend/.env
chmod 600 /home/attendx/attendx/backend/.env

# ── 8. Install systemd service ──
echo "[9/10] Installing systemd service..."
cp /home/attendx/attendx/deploy/attendx.service /etc/systemd/system/attendx.service
systemctl daemon-reload
systemctl enable attendx
systemctl start attendx

# ── 9. Configure nginx ──
echo "[10/10] Configuring nginx..."
cp /home/attendx/attendx/deploy/nginx.conf /etc/nginx/sites-available/attendx
ln -sf /etc/nginx/sites-available/attendx /etc/nginx/sites-enabled/attendx
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# ── 10. Open firewall ports ──
echo "Opening firewall ports..."
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save 2>/dev/null || iptables-save > /etc/iptables/rules.v4

echo ""
echo "============================================"
echo "  ✅ ATTENDX Server Setup Complete!"
echo "============================================"
echo ""
echo "  Backend:  http://YOUR_SERVER_IP (port 80)"
echo "  Service:  systemctl status attendx"
echo "  Logs:     journalctl -u attendx -f"
echo ""
echo "  NEXT STEPS:"
echo "  1. Edit /home/attendx/attendx/backend/.env"
echo "     - Set your MAIL_USERNAME, MAIL_PASSWORD"
echo "     - Set a strong JWT_SECRET_KEY and SECRET_KEY"
echo "  2. Restart: sudo systemctl restart attendx"
echo "  3. For HTTPS: sudo certbot --nginx -d your-domain.com"
echo "  4. Update frontend VITE_API_URL to your server URL"
echo ""
