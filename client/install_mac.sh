#!/bin/bash
# ==============================================================================
# Enterprise Endpoint Backup & Sync - macOS Client Installer
# ==============================================================================

set -eo pipefail

echo "=================================================================="
echo "    Enterprise Endpoint Backup & Sync - macOS Client Setup        "
echo "=================================================================="
echo ""

APP_DIR="$HOME/.enterprise_backup_agent"
CONFIG_DIR="$HOME/.enterprise_backup"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.enterprise.backup.plist"

mkdir -p "$APP_DIR"
mkdir -p "$CONFIG_DIR"

# 1. Download client daemon and requirements
echo "[1/4] Fetching client files..."
curl -fsSL "https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/client_daemon.py" -o "$APP_DIR/client_daemon.py"
curl -fsSL "https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/requirements.txt" -o "$APP_DIR/requirements.txt"

cd "$APP_DIR"

# 2. Check Python 3
echo "[2/4] Verifying Python runtime..."
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required. Please install Python from https://www.python.org/downloads/macos/ or run: xcode-select --install"
    xcode-select --install || true
    exit 1
fi

# 3. Create virtual environment and install packages
echo "[3/4] Setting up dependencies..."
if [ ! -d "venv" ]; then
    python3 -m venv venv || {
        echo "Standard venv failed, bootstrapping pip..."
        python3 -m venv --without-pip venv || true
        curl -fsSL https://bootstrap.pypa.io/get-pip.py -o get-pip.py
        ./venv/bin/python get-pip.py
        rm -f get-pip.py
    }
fi

./venv/bin/pip install --upgrade pip --quiet
./venv/bin/pip install -r requirements.txt --quiet

# 4. Configure LaunchAgent for auto-start on macOS login
echo "[4/4] Configuring auto-start on macOS login..."
mkdir -p "$HOME/Library/LaunchAgents"

cat << EOF > "$LAUNCH_AGENT"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.enterprise.backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>$APP_DIR/venv/bin/python3</string>
        <string>$APP_DIR/client_daemon.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$CONFIG_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$CONFIG_DIR/agent.log</string>
</dict>
</plist>
EOF

launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
launchctl load "$LAUNCH_AGENT" 2>/dev/null || true

# Strip any quarantine flags on install directory
xattr -cr "$APP_DIR" 2>/dev/null || true

echo ""
echo "=================================================================="
echo "  Setup Complete! Launching Agent Setup Window...                 "
echo "=================================================================="
echo ""

# Launch detached in Aqua user session
nohup "$APP_DIR/venv/bin/python3" "$APP_DIR/client_daemon.py" > "$CONFIG_DIR/agent.log" 2>&1 &