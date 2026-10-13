#!/bin/bash
# =========================================================================
#  Enterprise Endpoint Backup - macOS Client Auto-Installer
# =========================================================================

set -e

APP_DIR="$HOME/.enterprise_backup_agent"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.enterprise.backup.plist"

echo "==> Setting up Enterprise Backup Agent on macOS..."

# Create dedicated install directory
mkdir -p "$APP_DIR"
cp client_daemon.py "$APP_DIR/"
cp requirements.txt "$APP_DIR/"

# Setup python environment
cd "$APP_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# Create macOS LaunchAgent for auto-start on login
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

# Load the LaunchAgent
launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
launchctl load "$LAUNCH_AGENT"

echo "==> Enterprise Backup Agent installed successfully!"
echo "==> It is now running in your Menu Bar and will start automatically on login."