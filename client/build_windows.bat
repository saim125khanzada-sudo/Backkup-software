@echo off
REM =========================================================================
REM  Enterprise Endpoint Backup - Windows Client Agent Build Script
REM =========================================================================

echo [1/4] Ensuring Virtual Environment...
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\activate.bat

echo [2/4] Installing Required Dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt

echo [3/4] Packaging Executable via PyInstaller...
pyinstaller --noconfirm --onedir --windowed ^
    --name "EnterpriseBackupAgent" ^
    --hidden-import "pystray" ^
    --hidden-import "watchdog.observers" ^
    --hidden-import "PIL" ^
    --hidden-import "tkinter" ^
    client_daemon.py

echo.
echo [4/4] Build Complete!
echo Standalone client is ready in: dist\EnterpriseBackupAgent\EnterpriseBackupAgent.exe
pause
