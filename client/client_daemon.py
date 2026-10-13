"""
Enterprise Endpoint Backup & Sync - Desktop Client Daemon
Compatible with Windows and macOS.
Monitors configured folders, debounces file write events, computes SHA-256 hashes,
streams file uploads to the server, and informs the server of local deletions (retaining files).
"""

import os
import sys
import time
import json
import hashlib
import platform
import threading
from pathlib import Path
from typing import Dict, List, Set, Optional, Tuple

import httpx
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

# GUI & System Tray imports
try:
    import pystray
    from PIL import Image, ImageDraw
    HAS_TRAY = True
except ImportError:
    HAS_TRAY = False

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# Configuration Path
CONFIG_DIR = Path.home() / ".enterprise_backup"
CONFIG_FILE = CONFIG_DIR / "config.json"


# ---------------- Configuration Manager ----------------
class ConfigManager:
    def __init__(self):
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        self.data = self.load()

    def load(self) -> dict:
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "server_url": "http://localhost",
            "email": "",
            "auth_token": "",
            "device_id": "",
            "device_name": platform.node(),
            "os": "windows" if sys.platform.startswith("win") else "macos" if sys.platform == "darwin" else "linux",
            "watch_paths": [str(Path.home() / "Documents")],
            "tombstones": []  # List of relative paths deleted locally
        }

    def save(self):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2)

    def add_tombstone(self, relative_path: str):
        if "tombstones" not in self.data:
            self.data["tombstones"] = []
        if relative_path not in self.data["tombstones"]:
            self.data["tombstones"].append(relative_path)
            self.save()

    def remove_tombstone(self, relative_path: str):
        if "tombstones" in self.data and relative_path in self.data["tombstones"]:
            self.data["tombstones"].remove(relative_path)
            self.save()

    def is_tombstoned(self, relative_path: str) -> bool:
        return relative_path in self.data.get("tombstones", [])


config_manager = ConfigManager()


# ---------------- Tray Icon Generator ----------------
def create_tray_image(color="green"):
    width = 64
    height = 64
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Base cloud / hard drive shape
    draw.rounded_rectangle([8, 14, 56, 50], radius=10, fill=(30, 41, 59, 255), outline=(100, 116, 139, 255), width=2)
    draw.line([16, 32, 48, 32], fill=(148, 163, 184, 255), width=2)

    # Status LED Dot
    color_map = {
        "green": (16, 185, 129, 255),   # Idle
        "blue": (14, 165, 233, 255),    # Syncing
        "red": (239, 68, 68, 255),      # Error / Offline
        "amber": (245, 158, 11, 255),   # Paused
    }
    led_color = color_map.get(color, color_map["green"])
    draw.ellipse([42, 38, 52, 48], fill=led_color)
    return image


# ---------------- Setup / Settings GUI ----------------
class SetupDialog:
    def __init__(self, on_saved_callback=None):
        self.on_saved = on_saved_callback
        self.root = tk.Tk()
        self.root.title("Enterprise Endpoint Backup - Client Agent")
        self.root.geometry("520x460")
        self.root.resizable(False, False)
        self.root.configure(bg="#0f172a")

        self.cfg = config_manager.data
        self.build_ui()

    def build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")

        header_frame = tk.Frame(self.root, bg="#1e293b", pady=15, padx=20)
        header_frame.pack(fill="x")

        title = tk.Label(
            header_frame,
            text="Enterprise Backup Client Setup",
            font=("Segoe UI", 13, "bold"),
            fg="#f8fafc",
            bg="#1e293b",
        )
        title.pack(anchor="w")

        subtitle = tk.Label(
            header_frame,
            text="Centralized Immutable Endpoint Synchronization",
            font=("Segoe UI", 9),
            fg="#94a3b8",
            bg="#1e293b",
        )
        subtitle.pack(anchor="w")

        form = tk.Frame(self.root, bg="#0f172a", padx=25, pady=20)
        form.pack(fill="both", expand=True)

        # Server URL
        tk.Label(form, text="Server URL:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0f172a").pack(anchor="w")
        self.server_entry = tk.Entry(form, font=("Segoe UI", 9), bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", relief="flat")
        self.server_entry.insert(0, self.cfg.get("server_url", "http://localhost"))
        self.server_entry.pack(fill="x", pady=(2, 10), ipady=4)

        # Email
        tk.Label(form, text="Provisioned Email:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0f172a").pack(anchor="w")
        self.email_entry = tk.Entry(form, font=("Segoe UI", 9), bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", relief="flat")
        self.email_entry.insert(0, self.cfg.get("email", ""))
        self.email_entry.pack(fill="x", pady=(2, 10), ipady=4)

        # Password
        tk.Label(form, text="Account Password:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0f172a").pack(anchor="w")
        self.pass_entry = tk.Entry(form, font=("Segoe UI", 9), show="•", bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", relief="flat")
        self.pass_entry.pack(fill="x", pady=(2, 10), ipady=4)

        # Local Folder to Watch
        tk.Label(form, text="Folder to Backup:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0f172a").pack(anchor="w")
        folder_frame = tk.Frame(form, bg="#0f172a")
        folder_frame.pack(fill="x", pady=(2, 10))

        default_folder = self.cfg.get("watch_paths", [str(Path.home() / "Documents")])[0]
        self.folder_entry = tk.Entry(folder_frame, font=("Segoe UI", 9), bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", relief="flat")
        self.folder_entry.insert(0, default_folder)
        self.folder_entry.pack(side="left", fill="x", expand=True, ipady=4)

        browse_btn = tk.Button(folder_frame, text="Browse...", command=self.browse_folder, bg="#334155", fg="#ffffff", relief="flat", padx=10)
        browse_btn.pack(side="right", padx=(8, 0))

        # Status Label
        self.status_lbl = tk.Label(form, text="", font=("Segoe UI", 8), fg="#38bdf8", bg="#0f172a")
        self.status_lbl.pack(anchor="w", pady=(5, 10))

        # Action Buttons
        btn_frame = tk.Frame(self.root, bg="#0f172a", padx=25, pady=10)
        btn_frame.pack(fill="x", side="bottom")

        connect_btn = tk.Button(
            btn_frame,
            text="Authenticate & Start Sync",
            command=self.save_and_connect,
            bg="#0284c7",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            pady=6,
            padx=15,
        )
        connect_btn.pack(side="right")

    def browse_folder(self):
        selected = filedialog.askdirectory(initialdir=self.folder_entry.get())
        if selected:
            self.folder_entry.delete(0, tk.END)
            self.folder_entry.insert(0, selected)

    def save_and_connect(self):
        server_url = self.server_entry.get().strip().rstrip("/")
        email = self.email_entry.get().strip()
        password = self.pass_entry.get().strip()
        folder = self.folder_entry.get().strip()

        if not server_url or not email or not password or not folder:
            messagebox.showerror("Validation Error", "All fields are required.")
            return

        self.status_lbl.config(text="Authenticating with enterprise server...")
        self.root.update()

        try:
            # 1. Login
            with httpx.Client(base_url=server_url, timeout=15.0) as client:
                res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
                if res.status_code != 200:
                    err_msg = res.json().get("detail", "Authentication failed")
                    self.status_lbl.config(text=f"Error: {err_msg}", fg="#f87171")
                    messagebox.showerror("Authentication Failed", err_msg)
                    return

                auth_data = res.json()
                token = auth_data["access_token"]

                # 2. Handshake
                headers = {"Authorization": f"Bearer {token}"}
                os_name = "windows" if sys.platform.startswith("win") else "macos" if sys.platform == "darwin" else "linux"
                handshake_res = client.post(
                    "/api/v1/sync/handshake",
                    headers=headers,
                    json={
                        "device_name": platform.node(),
                        "os": os_name,
                        "client_version": "1.0.0"
                    }
                )
                if handshake_res.status_code != 200:
                    messagebox.showerror("Handshake Failed", "Could not register device with server.")
                    return

                device_info = handshake_res.json()
                device_id = device_info["device_id"]

                # Save updated config
                config_manager.data.update({
                    "server_url": server_url,
                    "email": email,
                    "auth_token": token,
                    "device_id": str(device_id),
                    "watch_paths": [folder]
                })
                config_manager.save()

                messagebox.showinfo("Success", "Authenticated successfully! Endpoint backup daemon is now active.")
                self.root.destroy()
                if self.on_saved:
                    self.on_saved()

        except Exception as e:
            self.status_lbl.config(text=f"Connection Error: {str(e)}", fg="#f87171")
            messagebox.showerror("Connection Error", f"Unable to reach server:\n{str(e)}")

    def run(self):
        self.root.mainloop()


# ---------------- Core Sync Daemon & Watcher ----------------
class EndpointSyncDaemon:
    # Files / Folders to strictly ignore
    IGNORE_PREFIXES = ("~$", ".~", "._")
    IGNORE_EXTENSIONS = (".tmp", ".crdownload", ".part", ".swp", ".lock")
    IGNORE_SUBSTRINGS = (
        os.sep + ".git" + os.sep,
        os.sep + "node_modules" + os.sep,
        os.sep + "__pycache__" + os.sep,
        ".DS_Store",
        "Thumbs.db",
        "desktop.ini",
        ".enterprise_backup"
    )

    def __init__(self):
        self.running = False
        self.paused = False
        self.status = "Idle"
        self.pending_files: Dict[str, Tuple[float, str]] = {}  # {abs_path: (trigger_time, action)}
        self.lock = threading.Lock()
        self.observer = None
        self.tray_icon = None

    def should_ignore(self, path: str) -> bool:
        name = os.path.basename(path)
        for prefix in self.IGNORE_PREFIXES:
            if name.startswith(prefix):
                return True
        for ext in self.IGNORE_EXTENSIONS:
            if name.endswith(ext):
                return True
        for sub in self.IGNORE_SUBSTRINGS:
            if sub in path:
                return True
        return False

    def compute_sha256(self, file_path: str) -> Optional[str]:
        sha = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    sha.update(chunk)
            return sha.hexdigest()
        except (PermissionError, FileNotFoundError, OSError):
            return None

    def get_relative_path(self, abs_path: str, root_watch_dir: str) -> str:
        rel = os.path.relpath(abs_path, root_watch_dir)
        return rel.replace("\\", "/")

    # Event Debouncer
    def schedule_event(self, abs_path: str, action: str = "upload"):
        if self.should_ignore(abs_path):
            return

        with self.lock:
            # 2.0-second debounce timer
            self.pending_files[abs_path] = (time.time() + 2.0, action)

    def handle_local_deletion(self, abs_path: str, root_watch_dir: str):
        if self.should_ignore(abs_path):
            return

        rel_path = self.get_relative_path(abs_path, root_watch_dir)
        config_manager.add_tombstone(rel_path)

        # Notify server of local deletion
        server_url = config_manager.data.get("server_url")
        token = config_manager.data.get("auth_token")
        device_id = config_manager.data.get("device_id")

        if not server_url or not token:
            return

        try:
            with httpx.Client(base_url=server_url, timeout=10.0) as client:
                headers = {"Authorization": f"Bearer {token}"}
                res = client.post(
                    "/api/v1/sync/mark-deleted",
                    headers=headers,
                    json={
                        "device_id": device_id or None,
                        "relative_path": rel_path
                    }
                )
                print(f"[SYNC] Marked locally deleted on server: {rel_path} -> {res.status_code}")
        except Exception as e:
            print(f"[SYNC ERROR] Failed to report deletion for {rel_path}: {e}")

    # Upload file to server
    def upload_file(self, abs_path: str, root_watch_dir: str):
        if not os.path.exists(abs_path) or not os.path.isfile(abs_path):
            return

        rel_path = self.get_relative_path(abs_path, root_watch_dir)

        # If user created/restored the file locally, remove tombstone
        if config_manager.is_tombstoned(rel_path):
            config_manager.remove_tombstone(rel_path)

        # 1. Compute Hash
        sha256 = self.compute_sha256(abs_path)
        if not sha256:
            return

        file_size = os.path.getsize(abs_path)
        mtime = datetime_from_mtime(os.path.getmtime(abs_path))

        server_url = config_manager.data.get("server_url")
        token = config_manager.data.get("auth_token")
        device_id = config_manager.data.get("device_id")

        if not server_url or not token:
            return

        headers = {"Authorization": f"Bearer {token}"}

        try:
            with httpx.Client(base_url=server_url, timeout=60.0) as client:
                # 2. Fast Hash Check
                check_res = client.post(
                    "/api/v1/sync/check-hashes",
                    headers=headers,
                    json={
                        "device_id": device_id or None,
                        "files": [{"relative_path": rel_path, "sha256_hash": sha256, "file_size": file_size}]
                    }
                )

                if check_res.status_code == 200:
                    needed = check_res.json().get("needed_uploads", [])
                    if rel_path not in needed:
                        # Already matches server hash!
                        return

                # 3. Stream Upload
                with open(abs_path, "rb") as f:
                    upload_res = client.post(
                        "/api/v1/sync/upload",
                        headers=headers,
                        data={
                            "relative_path": rel_path,
                            "device_id": device_id or "",
                            "client_modified_at": mtime
                        },
                        files={"file": (os.path.basename(abs_path), f)}
                    )
                    if upload_res.status_code == 200:
                        print(f"[SYNC] Successfully uploaded {rel_path} ({file_size} bytes)")
                    else:
                        print(f"[SYNC ERROR] Upload failed: {upload_res.status_code} {upload_res.text}")

        except Exception as e:
            print(f"[SYNC ERROR] Upload exception for {rel_path}: {e}")

    # Background worker checking debounce queue
    def debounce_worker(self):
        while self.running:
            if self.paused:
                time.sleep(1)
                continue

            now = time.time()
            to_process = []

            with self.lock:
                for path, (trigger_time, action) in list(self.pending_files.items()):
                    if now >= trigger_time:
                        to_process.append((path, action))
                        del self.pending_files[path]

            if to_process:
                self.update_status(f"Syncing ({len(to_process)} remaining)", "blue")
                root_dirs = config_manager.data.get("watch_paths", [])
                root_watch_dir = root_dirs[0] if root_dirs else str(Path.home() / "Documents")

                for path, action in to_process:
                    if action == "upload":
                        self.upload_file(path, root_watch_dir)
                    elif action == "delete":
                        self.handle_local_deletion(path, root_watch_dir)

                self.update_status("Idle", "green")

            time.sleep(0.5)

    def initial_scan(self):
        """Scans the watched folder on startup to catch files modified while offline."""
        root_dirs = config_manager.data.get("watch_paths", [])
        if not root_dirs:
            return
        root_watch_dir = root_dirs[0]

        if not os.path.exists(root_watch_dir):
            return

        print(f"[SYNC] Running initial scan on: {root_watch_dir}")
        for root, dirs, files in os.walk(root_watch_dir):
            for fname in files:
                full_p = os.path.join(root, fname)
                if not self.should_ignore(full_p):
                    self.schedule_event(full_p, "upload")

    def update_status(self, text: str, color: str = "green"):
        self.status = text
        if self.tray_icon and HAS_TRAY:
            self.tray_icon.title = f"Enterprise Backup: {text}"
            self.tray_icon.icon = create_tray_image(color)

    def start(self):
        self.running = True

        # Watchdog FileSystem Event Handler
        parent = self

        class BackupHandler(FileSystemEventHandler):
            def __init__(self, root_dir: str):
                self.root_dir = root_dir

            def on_created(self, event: FileSystemEvent):
                if not event.is_directory:
                    parent.schedule_event(event.src_path, "upload")

            def on_modified(self, event: FileSystemEvent):
                if not event.is_directory:
                    parent.schedule_event(event.src_path, "upload")

            def on_deleted(self, event: FileSystemEvent):
                if not event.is_directory:
                    parent.schedule_event(event.src_path, "delete")

            def on_moved(self, event: FileSystemEvent):
                if not event.is_directory:
                    parent.schedule_event(event.src_path, "delete")
                    parent.schedule_event(event.dest_path, "upload")

        root_dirs = config_manager.data.get("watch_paths", [])
        watch_dir = root_dirs[0] if root_dirs else str(Path.home() / "Documents")
        Path(watch_dir).mkdir(parents=True, exist_ok=True)

        self.observer = Observer()
        handler = BackupHandler(watch_dir)
        self.observer.schedule(handler, watch_dir, recursive=True)
        self.observer.start()

        # Start debounce worker thread
        self.worker_thread = threading.Thread(target=self.debounce_worker, daemon=True)
        self.worker_thread.start()

        # Run initial scan
        threading.Thread(target=self.initial_scan, daemon=True).start()

        print(f"[DAEMON] Active and monitoring folder: {watch_dir}")

    def stop(self):
        self.running = False
        if self.observer:
            self.observer.stop()
            self.observer.join()
        if self.tray_icon:
            self.tray_icon.stop()


def datetime_from_mtime(mtime: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()


# ---------------- Entrypoint & Tray Runner ----------------
def run_app():
    # Check if credentials exist
    token = config_manager.data.get("auth_token")
    if not token:
        setup = SetupDialog()
        setup.run()
        token = config_manager.data.get("auth_token")
        if not token:
            print("[INFO] Setup cancelled. Exiting.")
            sys.exit(0)

    daemon = EndpointSyncDaemon()
    daemon.start()

    if not HAS_TRAY:
        print("[INFO] Running in console daemon mode (pystray/Pillow not available). Press Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            daemon.stop()
            sys.exit(0)

    # Setup System Tray Menu
    def on_sync_now(icon, item):
        threading.Thread(target=daemon.initial_scan, daemon=True).start()

    def on_open_folder(icon, item):
        root_dirs = config_manager.data.get("watch_paths", [])
        if root_dirs and os.path.exists(root_dirs[0]):
            if sys.platform.startswith("win"):
                os.startfile(root_dirs[0])
            elif sys.platform == "darwin":
                os.system(f'open "{root_dirs[0]}"')
            else:
                os.system(f'xdg-open "{root_dirs[0]}"')

    def on_settings(icon, item):
        def show_dialog():
            setup = SetupDialog(on_saved_callback=lambda: daemon.initial_scan())
            setup.run()
        threading.Thread(target=show_dialog, daemon=True).start()

    def on_exit(icon, item):
        daemon.stop()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("Status: Active & Idle", lambda icon, item: None, enabled=False),
        pystray.MenuItem("Sync Now", on_sync_now),
        pystray.MenuItem("Open Backup Folder", on_open_folder),
        pystray.MenuItem("Settings & Account...", on_settings),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit Agent", on_exit)
    )

    icon = pystray.Icon(
        "enterprise_backup_agent",
        create_tray_image("green"),
        "Enterprise Endpoint Backup",
        menu
    )
    daemon.tray_icon = icon
    icon.run()


if __name__ == "__main__":
    run_app()
