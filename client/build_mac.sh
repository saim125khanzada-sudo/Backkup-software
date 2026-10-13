#!/bin/bash
# =========================================================================
#  Enterprise Endpoint Backup - macOS Client Agent Build Script
# =========================================================================

set -e

echo "[1/4] Ensuring Virtual Environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

echo "[2/4] Installing Dependencies..."
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "[3/4] Building macOS Application Bundle via PyInstaller..."
pyinstaller --noconfirm --windowed \
    --name "EnterpriseBackupAgent" \
    --hidden-import "pystray" \
    --hidden-import "watchdog.observers" \
    --hidden-import "PIL" \
    --hidden-import "tkinter" \
    client_daemon.py

echo ""
echo "[4/4] Build Complete!"
echo "Native macOS Application ready in: dist/EnterpriseBackupAgent.app"
echo "You can move this to /Applications or create a DMG installer."