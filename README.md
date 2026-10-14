# Centralized Enterprise Endpoint Backup & Sync Platform

A complete, production-grade, on-premises endpoint backup and file synchronization platform designed to run in Docker on Ubuntu, with native desktop client agents for Windows and macOS.

This system replaces OneDrive and Seafile for an office fleet of 50+ laptops, featuring **IT Admin root visibility**, **immutable server retention** (client deletions never delete files on disk), **bulk user provisioning**, **streaming chunked uploads**, and a **debounced desktop client agent**.

---

## 1. Architectural Highlights

```
+-----------------------------------------------------------------------------------------+
|                                    CLIENT AGENTS                                        |
|  Windows Laptop (watchdog + pystray)           macOS Laptop (watchdog + pystray)        |
|  - 2s Debounce Watcher                         - 2s Debounce Watcher                    |
|  - SHA-256 Hash Verifier                       - SHA-256 Hash Verifier                  |
|  - Chunked Streaming Uploader                  - Chunked Streaming Uploader             |
|  - Mark-Deleted Notifier (No Download Loop)    - Mark-Deleted Notifier (No Download)    |
+-----------------------------------------------------------------------------------------+
                                    | HTTP/HTTPS (Port 80/443)
                                    v
+-----------------------------------------------------------------------------------------+
|                               ON-PREMISES LINUX SERVER (DOCKER)                         |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | NGINX REVERSE PROXY & GATEWAY (Port 80 / 443)                                     |  |
|  | - Single entrypoint on port 80/443 (eliminates CORS and port refusal issues)       |  |
|  | - Streaming file upload & download proxy with client_max_body_size 0              |  |
|  | - Serves Vite React Admin SPA with client-side routing fallback                   |  |
|  +-----------------------------------------------------------------------------------+  |
|            |                                            |                               |
|            v                                            v                               |
|  +------------------------------+             +-------------------------------------+   |
|  | FRONTEND (Vite + React + TS) |             | BACKEND API (FastAPI + Python 3.11) |   |
|  | - Fleet Dashboard & Stats    |             | - Auth & Superuser Admin Services   |   |
|  | - User Management & CSV Bulk |             | - Sync Handshake & Hash Check       |   |
|  | - Full Tree File Explorer    |             | - Streaming Upload & Versioning     |   |
|  | - In-Browser Previewers      |             | - On-the-fly ZIP Streaming          |   |
|  | - On-the-fly ZIP Download    |             | - Soft Retention Deletion Handling  |   |
|  | - Audit Log Viewer           |             | - Audit Logging Engine              |   |
|  +------------------------------+             +-------------------------------------+   |
|                                                                 |                       |
|                                            +--------------------+--------------------+  |
|                                            |                                         |  |
|                                            v                                         v  |
|                              +----------------------------+             +------------+  |
|                              | POSTGRESQL 16 DATABASE     |             | PERSISTENT |  |
|                              | - users, devices, files    |             | STORAGE    |  |
|                              | - file_versions, audit_logs|             | /data/     |  |
|                              +----------------------------+             |   storage/ |  |
|                                                                         +------------+  |
+-----------------------------------------------------------------------------------------+
```

### Core Invariants
1. **IT Admin Superuser Visibility:**
   - The IT Administrator has unrestricted root visibility over the entire fleet.
   - Inspect any user's directory tree, preview files directly in the browser (PDFs, images, text, code, CSV tables, audio, video), download individual files, or export entire folders/user backups as a `.zip` archive on the fly.
   - Zero user permissions or shared links required.
2. **Immutable Server Retention (No Client Deletions):**
   - When a user deletes a file on their laptop, the server **never** purges the physical file from disk or deletes its catalog record.
   - The server marks the file record as `is_deleted_locally = true` for auditing and compliance.
   - The client agent records local deletions in a local tombstone index so it **never** enters an infinite loop attempting to re-download files that the user intentionally deleted locally.
   - Admins can toggle "Show Deleted Files" in the portal and restore files at any time with one click.
3. **Provisioning Exclusively by IT Admin:**
   - No public self-registration.
   - Single user creation and bulk CSV import (`email,password,name,quota_gb`) with validation.
4. **Reliable File Streaming:**
   - Nginx handles chunked streaming with `proxy_buffering off` and `client_max_body_size 0`, preventing memory exhaustion on large multi-gigabyte transfers.

---

## 2. Directory Structure

```
endpoint-backup-sync/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── auth.py          # Admin login and profile
│   │   │   ├── admin.py         # Stats, user CRUD, CSV batch, file tree, preview, ZIP export
│   │   │   └── sync.py          # Handshake, check-hashes, streaming upload, mark-deleted
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic v2 application settings
│   │   │   ├── database.py      # Async SQLAlchemy 2.0 session factory & init_db
│   │   │   └── security.py      # JWT authentication and bcrypt password hashing
│   │   ├── models/
│   │   │   ├── user.py          # User entity with quota & active status
│   │   │   ├── device.py        # Device enrollment (name, OS, last seen)
│   │   │   ├── file.py          # Master catalog FileRecord & immutable FileVersion
│   │   │   └── audit.py         # AuditLog event history
│   │   ├── schemas/             # Pydantic v2 schemas for all payloads
│   │   ├── services/
│   │   │   ├── storage.py       # Chunked streaming disk I/O, hash calculation & ZIP generator
│   │   │   └── sync_service.py  # Quota calculation, version snapshots, deletion tracking
│   │   └── main.py              # FastAPI app, CORS, lifespan startup & admin seeding
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.ts        # Axios client with JWT bearer interceptor
│   │   ├── context/AuthContext.tsx # Authentication provider and user state
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── CreateUserModal.tsx
│   │   │   ├── BatchCsvModal.tsx
│   │   │   ├── EditUserModal.tsx
│   │   │   ├── FilePreviewModal.tsx   # PDF, images, text, CSV, audio, video
│   │   │   └── VersionHistoryModal.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx    # Fleet KPI cards and capacity visualizer
│   │   │   ├── UsersManager.tsx # Interactive user table and quota meters
│   │   │   ├── FileExplorer.tsx # Superuser directory explorer & ZIP streamer
│   │   │   └── AuditLogs.tsx    # Compliance and sync audit trail
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf               # Unified gateway proxy & SPA routing
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── client/
│   ├── client_daemon.py         # Watchdog debouncer, pystray menu bar, Tkinter setup GUI
│   ├── requirements.txt
│   └── build_windows.bat        # PyInstaller packaging script
├── docker-compose.yml           # Unified stack: Postgres 16 + FastAPI + Nginx Gateway
├── .env.example
├── .gitattributes               # LF line ending enforcement
└── README.md
```

---

## 3. Running Locally on Windows (Development)

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- PostgreSQL running locally OR Docker Desktop

### 1. Backend Setup
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Run backend (ensure PostgreSQL is running or use SQLite/Docker)
uvicorn app.main:app --reload --port 8000
```
API Documentation will be accessible at: `http://localhost:8000/docs`

### 2. Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```
Admin Portal will be accessible at: `http://localhost:3000` (proxies `/api` to port 8000).

Default Admin Credentials:
- **Email:** `admin@enterprise.local`
- **Password:** `AdminPass123!`

### 3. Client Agent Setup
```powershell
cd client
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Launch client agent
python client_daemon.py
```
On first launch, the Setup Dialog appears:
1. Enter Server URL: `http://localhost:8000` (or `http://localhost` if running via Docker)
2. Enter User Email & Password
3. Select the folder to back up (e.g., `Documents`)
4. Click **Authenticate & Start Sync**. The agent minimizes to the Windows System Tray.

---

## 4. Pushing to GitHub

To publish this project to GitHub from PowerShell:

```powershell
cd "C:\Users\Muhammad Saim\.gemini\antigravity\scratch\endpoint-backup-sync"

# 1. Initialize git repository
git init

# 2. Add all project files
git add .

# 3. Commit
git commit -m "feat: Centralized Enterprise Endpoint Backup & Sync Platform v1.0.0"

# 4. Set main branch
git branch -M main

# 5. Link to your GitHub remote repository (replace with your repo URL)
git remote add origin https://github.com/your-organization/enterprise-endpoint-backup.git

# 6. Push to GitHub
git push -u origin main
```

---

## 5. Deploying on Ubuntu Server (Production)

### Step 1: Install Docker & Docker Compose on Ubuntu
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw ca-certificates

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### Step 2: Clone Repository & Configure Environment
```bash
git clone https://github.com/your-organization/enterprise-endpoint-backup.git /opt/enterprise-backup
cd /opt/enterprise-backup

# Copy environment configuration
cp .env.example .env

# Generate a secure 64-character secret key
openssl rand -hex 32
```
Edit `.env` using `nano .env`:
- Set `SECRET_KEY` to the generated string.
- Set `POSTGRES_PASSWORD` to a strong database password.
- Adjust `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`.

### Step 3: Configure Firewall (UFW)
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP Gateway & Sync
sudo ufw allow 443/tcp   # HTTPS Gateway (Optional)
sudo ufw enable
```

### Step 4: Launch the Entire Stack
```bash
docker compose up -d --build
```

Verify running containers:
```bash
docker compose ps
docker compose logs -f
```

The platform is now live on port 80 at `http://<your-server-ip>/`!

---

## 6. Client Agent Deployment on Laptops

Pre-built native desktop clients are compiled automatically via GitHub Actions CI/CD on Windows and macOS runners.

### Pre-built Binary Downloads:
* **macOS Apple Installer Package (.pkg):** [Download EnterpriseBackupAgent.pkg](https://github.com/saim125khanzada-sudo/Backkup-software/releases/download/latest/EnterpriseBackupAgent.pkg)
* **macOS Apple Disk Image (.dmg):** [Download EnterpriseBackupAgent.dmg](https://github.com/saim125khanzada-sudo/Backkup-software/releases/download/latest/EnterpriseBackupAgent.dmg)
* **Windows Standalone Binary (.exe):** [Download EnterpriseBackupAgent.exe](https://github.com/saim125khanzada-sudo/Backkup-software/releases/download/latest/EnterpriseBackupAgent.exe)

### macOS Quick 1-Line Installer:
Run this directly in Mac Terminal (bypasses Apple Gatekeeper blocks and auto-starts on login):
```bash
curl -fsSL https://raw.githubusercontent.com/saim125khanzada-sudo/Backkup-software/main/client/install_mac.sh | bash
```

### Local Compilation (Optional)
* **Windows:** Run `client\build_windows.bat` to package a single-file executable via PyInstaller.
* **macOS:** Run `python client/package_mac_app.py` to package `EnterpriseBackupInstaller.app` and `EnterpriseBackup-macOS.zip`.

---

## 7. Disaster Recovery & Admin Operations

### Restoring Files Deleted by Users
1. Log in to the Admin Portal at `http://<server-ip>/`.
2. Go to **File Explorer** and select the target employee.
3. Check **Show Locally Deleted Files**.
4. Locally deleted files will appear with a yellow/red **Deleted locally (Retained)** status badge.
5. Click **Preview** to inspect the file or click **Restore** to reset its active retention status.

### Exporting Forensic Archive
1. In the **File Explorer**, navigate to any folder or the root directory.
2. Click **Export Fleet .ZIP** or **Export Folder .ZIP**.
3. Nginx and FastAPI will stream a dynamically generated `.zip` archive on the fly without loading the whole archive into memory.

### Backing Up the PostgreSQL Database
```bash
docker exec -t enterprise_backup_db pg_dump -U backup_admin enterprise_backup > backup_db_$(date +%Y%m%d).sql
```