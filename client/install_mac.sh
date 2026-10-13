#!/bin/bash
# ==============================================================================
# Enterprise Endpoint Backup & Sync - macOS 1-Click Client Installer
# ==============================================================================

set -e

echo "=================================================================="
echo "    Enterprise Endpoint Backup & Sync - macOS Client Setup        "
echo "=================================================================="
echo ""

APP_DIR="$HOME/.enterprise_backup_agent"
CONFIG_DIR="$HOME/.enterprise_backup"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.enterprise.backup.plist"

mkdir -p "$APP_DIR"
mkdir -p "$CONFIG_DIR"

# 1. Obtain daemon files
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" 2>/dev/null && pwd )"
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/client_daemon.py" ]; then
    echo "[1/4] Copying client files..."
    cp -f "$SCRIPT_DIR/client_daemon.py" "$APP_DIR/"
    cp -f "$SCRIPT_DIR/requirements.txt" "$APP_DIR/"
else
    echo "[1/4] Downloading latest client files..."
    curl -fsSL "https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/client_daemon.py" -o "$APP_DIR/client_daemon.py"
    curl -fsSL "https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/requirements.txt" -o "$APP_DIR/requirements.txt"
fi

cd "$APP_DIR"

# 2. Check Python 3
echo "[2/4] Checking Python 3 runtime..."
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required. Launching developer tools installer..."
    xcode-select --install
    echo "Please finish the prompt on screen and run the installer again."
    exit 1
fi

# 3. Create isolated virtual environment
echo "[3/4] Installing dependencies (watchdog, httpx, pystray, pillow)..."
if [ ! -d "venv" ]; then
    python3 -m venv venv || {
        echo "Creating venv failed. Attempting ensurepip..."
        python3 -m ensurepip --upgrade || true
        python3 -m venv venv
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
echo "  Installation Successful!                                        "
echo "  Launching Setup Window on your screen now...                    "
echo "=================================================================="
echo "Please enter your Server IP (e.g. 192.168.2.88), Email, and Password."
echo ""

# Launch the client daemon
./venv/bin/python3 client_daemon.py &