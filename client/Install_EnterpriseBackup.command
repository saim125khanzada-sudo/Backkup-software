#!/bin/bash
# ==============================================================================
# Enterprise Endpoint Backup - macOS 1-Click Double-Clickable Installer
# Double-click this file in macOS Finder to install and launch the agent.
# ==============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

clear
echo "=================================================================="
echo "      Enterprise Endpoint Backup - macOS 1-Click Installer        "
echo "=================================================================="
echo ""

APP_DIR="$HOME/.enterprise_backup_agent"
mkdir -p "$APP_DIR"

# Copy daemon and requirements
if [ -f "$DIR/client_daemon.py" ]; then
    cp -f "$DIR/client_daemon.py" "$APP_DIR/"
    cp -f "$DIR/requirements.txt" "$APP_DIR/"
else
    echo "Fetching client daemon..."
    curl -fsSL https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/client_daemon.py -o "$APP_DIR/client_daemon.py"
    curl -fsSL https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/requirements.txt -o "$APP_DIR/requirements.txt"
fi

cd "$APP_DIR"

echo "[1/3] Setting up Python background runtime..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

./venv/bin/pip install --upgrade pip --quiet
./venv/bin/pip install -r requirements.txt --quiet

echo "[2/3] Configuring auto-start on macOS login..."
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.enterprise.backup.plist"
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
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.enterprise_backup/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.enterprise_backup/agent.log</string>
</dict>
</plist>
EOF

launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
launchctl load "$LAUNCH_AGENT"

echo "[3/3] Opening Configuration Window..."
./venv/bin/python3 client_daemon.py &

echo ""
echo "==> Installation complete!"
echo "==> Please enter your Server IP, Email, and Password in the setup window."
echo "==> The agent will stay in your top Menu Bar and auto-start on every login."
echo ""
sleep 2