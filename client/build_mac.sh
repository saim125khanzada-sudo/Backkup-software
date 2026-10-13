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

echo "[4/5] Packaging into Apple Disk Image (.dmg)..."
mkdir -p dist/dmg_staging
cp -R dist/EnterpriseBackupAgent.app dist/dmg_staging/
ln -s /Applications dist/dmg_staging/Applications

hdiutil create -volname "Enterprise Backup Agent" \
    -srcfolder dist/dmg_staging \
    -ov -format UDZO \
    dist/EnterpriseBackupAgent.dmg

rm -rf dist/dmg_staging

echo ""
echo "[5/5] Build Complete!"
echo "Native macOS Installer ready in: dist/EnterpriseBackupAgent.dmg"
echo "You can double-click this .dmg and drag the app into Applications."