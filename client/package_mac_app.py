import os
import stat
import zipfile
from pathlib import Path

CLIENT_DIR = Path(__file__).resolve().parent
DIST_DIR = CLIENT_DIR / "dist"
DIST_DIR.mkdir(parents=True, exist_ok=True)

APP_NAME = "EnterpriseBackupInstaller.app"
APP_DIR = DIST_DIR / APP_NAME

# Clean previous build
import shutil
if APP_DIR.exists():
    shutil.rmtree(APP_DIR)

contents_dir = APP_DIR / "Contents"
macos_dir = contents_dir / "MacOS"
resources_dir = contents_dir / "Resources"

macos_dir.mkdir(parents=True, exist_ok=True)
resources_dir.mkdir(parents=True, exist_ok=True)

# 1. Info.plist
info_plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>EnterpriseBackupInstaller</string>
    <key>CFBundleDisplayName</key>
    <string>Enterprise Backup Installer</string>
    <key>CFBundleIdentifier</key>
    <string>com.enterprise.backup.installer</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>CFBundleExecutable</key>
    <string>EnterpriseBackupInstaller</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
"""
(contents_dir / "Info.plist").write_text(info_plist, encoding="utf-8")
(contents_dir / "PkgInfo").write_text("APPL????", encoding="utf-8")

# 2. Launcher script inside Contents/MacOS/
launcher_script = """#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RESOURCES_DIR="$DIR/../Resources"

APP_DIR="$HOME/.enterprise_backup_agent"
CONFIG_DIR="$HOME/.enterprise_backup"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.enterprise.backup.plist"

mkdir -p "$APP_DIR"
mkdir -p "$CONFIG_DIR"

# Copy daemon files
if [ -f "$RESOURCES_DIR/client_daemon.py" ]; then
    cp -f "$RESOURCES_DIR/client_daemon.py" "$APP_DIR/"
    cp -f "$RESOURCES_DIR/requirements.txt" "$APP_DIR/"
else
    curl -fsSL "https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/client_daemon.py" -o "$APP_DIR/client_daemon.py"
    curl -fsSL "https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/requirements.txt" -o "$APP_DIR/requirements.txt"
fi

cd "$APP_DIR"

# Check Python 3
if ! command -v python3 &> /dev/null; then
    osascript -e 'display alert "Python 3 Required" message "Please install Python 3 to continue with Enterprise Backup."'
    xcode-select --install
    exit 1
fi

# Setup Virtual Environment
if [ ! -d "venv" ]; then
    python3 -m venv venv || python3 -m ensurepip && python3 -m venv venv
    ./venv/bin/pip install --upgrade pip --quiet
    ./venv/bin/pip install -r requirements.txt --quiet
fi

# Setup LaunchAgent
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

# Launch Daemon GUI
./venv/bin/python3 client_daemon.py &
"""
executable_path = macos_dir / "EnterpriseBackupInstaller"
executable_path.write_text(launcher_script, encoding="utf-8")

# 3. Copy resources
shutil.copy2(CLIENT_DIR / "client_daemon.py", resources_dir / "client_daemon.py")
shutil.copy2(CLIENT_DIR / "requirements.txt", resources_dir / "requirements.txt")

# Also copy Install_EnterpriseBackup.command into dist
shutil.copy2(CLIENT_DIR / "Install_EnterpriseBackup.command", DIST_DIR / "Install_EnterpriseBackup.command")

# 4. Create ZIP package with Unix permissions preserved (0755 for executables / directories, 0644 for files)
zip_path = DIST_DIR / "EnterpriseBackup-macOS.zip"
print(f"Creating {zip_path} with Unix permissions...")

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    # Add .app bundle
    for root, dirs, files in os.walk(APP_DIR):
        for d in dirs:
            dir_full = Path(root) / d
            rel = dir_full.relative_to(DIST_DIR)
            zinfo = zipfile.ZipInfo(str(rel).replace("\\", "/") + "/")
            zinfo.external_attr = (0o755 << 16) | 0x10  # directory + rwxr-xr-x
            zf.writestr(zinfo, "")
        for f in files:
            file_full = Path(root) / f
            rel = file_full.relative_to(DIST_DIR)
            with open(file_full, "rb") as fp:
                data = fp.read()
            zinfo = zipfile.ZipInfo(str(rel).replace("\\", "/"))
            if "MacOS" in str(rel):
                zinfo.external_attr = 0o755 << 16  # rwxr-xr-x
            else:
                zinfo.external_attr = 0o644 << 16  # rw-r--r--
            zf.writestr(zinfo, data)
            
    # Add .command file to root of zip as well
    cmd_file = CLIENT_DIR / "Install_EnterpriseBackup.command"
    with open(cmd_file, "rb") as fp:
        cmd_data = fp.read()
    zinfo = zipfile.ZipInfo("Install_EnterpriseBackup.command")
    zinfo.external_attr = 0o755 << 16  # rwxr-xr-x executable
    zf.writestr(zinfo, cmd_data)

print("SUCCESS: EnterpriseBackup-macOS.zip generated successfully!")
