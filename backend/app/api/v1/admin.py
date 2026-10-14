import csv
import io
from uuid import UUID
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_admin_user, get_password_hash
from app.models.user import User
from app.models.device import Device
from app.models.file import FileRecord, FileVersion
from app.models.audit import AuditLog
from app.models.security_alert import SecurityAlert
from app.schemas import (
    UserOut, UserCreate, UserUpdate, BatchUserResult,
    FileRecordOut, FileVersionOut, AuditLogOut, AdminStats,
    SecurityAlertOut, SecurityAlertCountResponse
)
from app.services.storage import storage_service
from app.services.sync_service import log_audit

router = APIRouter(prefix="/admin", tags=["Admin Operations"], dependencies=[Depends(get_current_admin_user)])


@router.get("/stats", response_model=AdminStats)
async def get_system_stats(db: AsyncSession = Depends(get_db)):
    # Aggregated metrics
    users_stats = await db.execute(
        select(
            func.count(User.id),
            func.coalesce(func.sum(User.used_bytes), 0),
            func.coalesce(func.sum(User.quota_bytes), 0)
        )
    )
    total_users, total_used, total_quota = users_stats.one()

    total_files_res = await db.execute(select(func.count(FileRecord.id)))
    total_files = total_files_res.scalar() or 0

    total_devices_res = await db.execute(select(func.count(Device.id)))
    total_devices = total_devices_res.scalar() or 0

    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    active_devices_res = await db.execute(
        select(func.count(Device.id)).where(Device.last_seen_at >= yesterday)
    )
    active_devices_24h = active_devices_res.scalar() or 0

    return AdminStats(
        total_users=total_users,
        total_used_bytes=total_used,
        total_quota_bytes=total_quota,
        total_files=total_files,
        total_devices=total_devices,
        active_devices_24h=active_devices_24h
    )


@router.get("/users", response_model=List[UserOut])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(User)
    if search:
        query = query.where(User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%"))
    query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)

    users_res = await db.execute(query)
    users = users_res.scalars().all()

    output = []
    for u in users:
        dev_res = await db.execute(select(func.count(Device.id)).where(Device.user_id == u.id))
        file_res = await db.execute(select(func.count(FileRecord.id)).where(FileRecord.user_id == u.id))
        output.append(UserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            quota_bytes=u.quota_bytes,
            used_bytes=u.used_bytes,
            is_admin=u.is_admin,
            is_active=u.is_active,
            device_count=dev_res.scalar() or 0,
            file_count=file_res.scalar() or 0,
            created_at=u.created_at
        ))
    return output


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    existing = await db.execute(select(User).where(User.email == user_in.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{user_in.email}' already exists"
        )

    quota_bytes = user_in.quota_bytes
    if quota_bytes is None:
        if user_in.quota_gb is not None:
            quota_bytes = int(user_in.quota_gb * 1024 * 1024 * 1024)
        else:
            quota_bytes = 53687091200  # Default 50 GB

    new_user = User(
        email=user_in.email.lower(),
        password_hash=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        quota_bytes=quota_bytes,
        used_bytes=0,
        is_admin=user_in.is_admin,
        is_active=True
    )
    db.add(new_user)
    await db.flush()

    await log_audit(
        db,
        current_admin.id,
        "ADMIN_USER_CREATED",
        {"target_email": new_user.email, "quota_bytes": quota_bytes, "is_admin": new_user.is_admin}
    )

    return UserOut(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        quota_bytes=new_user.quota_bytes,
        used_bytes=0,
        is_admin=new_user.is_admin,
        is_active=new_user.is_active,
        device_count=0,
        file_count=0,
        created_at=new_user.created_at
    )


@router.post("/users/batch-csv", response_model=BatchUserResult)
async def batch_create_users_csv(
    file: UploadFile = File(...),
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a .csv file")

    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(decoded))
    created_count = 0
    total_processed = 0
    errors: List[str] = []

    # Expected columns: email,password,name (or full_name),quota_gb
    for row_num, row in enumerate(reader, start=2):
        total_processed += 1
        # Normalize keys
        cleaned_row = {k.strip().lower() if k else "": v.strip() for k, v in row.items()}
        email = cleaned_row.get("email")
        password = cleaned_row.get("password")
        name = cleaned_row.get("name") or cleaned_row.get("full_name") or ""
        quota_gb_str = cleaned_row.get("quota_gb") or cleaned_row.get("quota") or "50"

        if not email or not password:
            errors.append(f"Row {row_num}: Missing email or password")
            continue

        existing = await db.execute(select(User).where(User.email == email.lower()))
        if existing.scalar_one_or_none():
            errors.append(f"Row {row_num}: User '{email}' already exists")
            continue

        try:
            quota_gb = float(quota_gb_str)
            quota_bytes = int(quota_gb * 1024 * 1024 * 1024)
        except ValueError:
            quota_bytes = 53687091200

        user = User(
            email=email.lower(),
            password_hash=get_password_hash(password),
            full_name=name,
            quota_bytes=quota_bytes,
            used_bytes=0,
            is_admin=False,
            is_active=True
        )
        db.add(user)
        created_count += 1

    await db.flush()
    await log_audit(
        db,
        current_admin.id,
        "ADMIN_BATCH_USERS_CSV",
        {"created_count": created_count, "errors_count": len(errors)}
    )

    return BatchUserResult(
        total_processed=total_processed,
        created_count=created_count,
        errors=errors
    )


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    user_in: UserUpdate,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user_res = await db.execute(select(User).where(User.id == user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_in.full_name is not None:
        user.full_name = user_in.full_name

    if user_in.password:
        user.password_hash = get_password_hash(user_in.password)

    if user_in.quota_gb is not None:
        user.quota_bytes = int(user_in.quota_gb * 1024 * 1024 * 1024)
    elif user_in.quota_bytes is not None:
        user.quota_bytes = user_in.quota_bytes

    if user_in.is_active is not None:
        user.is_active = user_in.is_active

    if user_in.is_admin is not None:
        user.is_admin = user_in.is_admin

    await log_audit(
        db,
        current_admin.id,
        "ADMIN_USER_UPDATED",
        {"target_user_id": str(user_id), "is_active": user.is_active, "quota_bytes": user.quota_bytes}
    )
    await db.flush()

    dev_res = await db.execute(select(func.count(Device.id)).where(Device.user_id == user.id))
    file_res = await db.execute(select(func.count(FileRecord.id)).where(FileRecord.user_id == user.id))

    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        quota_bytes=user.quota_bytes,
        used_bytes=user.used_bytes,
        is_admin=user.is_admin,
        is_active=user.is_active,
        device_count=dev_res.scalar() or 0,
        file_count=file_res.scalar() or 0,
        created_at=user.created_at
    )


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: UUID,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Deactivates user without deleting storage records or disk files.
    """
    user_res = await db.execute(select(User).where(User.id == user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate the currently authenticated administrator")

    user.is_active = False
    await log_audit(
        db,
        current_admin.id,
        "ADMIN_USER_DEACTIVATED",
        {"target_user_id": str(user_id), "email": user.email}
    )
    await db.flush()
    return {"status": "success", "message": f"User {user.email} deactivated successfully. Storage remains retained."}


# ---------------- Admin File Explorer Endpoints ----------------

@router.get("/users/{user_id}/files", response_model=List[FileRecordOut])
async def get_user_file_tree(
    user_id: UUID,
    include_deleted: bool = Query(False, description="Include files deleted on local client"),
    db: AsyncSession = Depends(get_db)
):
    query = select(FileRecord).where(FileRecord.user_id == user_id)
    if not include_deleted:
        query = query.where(FileRecord.is_deleted_locally == False)
    
    query = query.options(selectinload(FileRecord.versions)).order_by(FileRecord.relative_path.asc())

    files_res = await db.execute(query)
    records = files_res.scalars().all()

    output = []
    for r in records:
        versions_out = [
            FileVersionOut(
                id=v.id,
                version_number=v.version_number,
                file_size=v.file_size,
                sha256_hash=v.sha256_hash,
                created_at=v.created_at
            ) for v in r.versions
        ]
        output.append(FileRecordOut(
            id=r.id,
            user_id=r.user_id,
            device_id=r.device_id,
            relative_path=r.relative_path,
            file_size=r.file_size,
            sha256_hash=r.sha256_hash,
            mime_type=r.mime_type,
            current_version=r.current_version,
            is_deleted_locally=r.is_deleted_locally,
            last_modified_client=r.last_modified_client,
            created_at=r.created_at,
            updated_at=r.updated_at,
            versions=versions_out
        ))
    return output


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: UUID,
    version: Optional[int] = Query(None, description="Specific version number to download"),
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    file_res = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
    file_record = file_res.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File record not found")

    target_path_str = file_record.storage_path
    if version and version < file_record.current_version:
        ver_res = await db.execute(
            select(FileVersion).where(FileVersion.file_id == file_id, FileVersion.version_number == version)
        )
        ver_record = ver_res.scalar_one_or_none()
        if not ver_record:
            raise HTTPException(status_code=404, detail=f"Version {version} not found")
        target_path_str = ver_record.storage_path

    file_path = storage_service.get_file_path(target_path_str)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Physical file missing on server storage")

    filename = Path(file_record.relative_path).name
    mime_type = file_record.mime_type or "application/octet-stream"

    await log_audit(
        db,
        current_admin.id,
        "ADMIN_FILE_DOWNLOAD",
        {"file_id": str(file_id), "path": file_record.relative_path, "version": version or file_record.current_version}
    )

    return StreamingResponse(
        storage_service.file_chunk_generator(file_path),
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(file_path.stat().st_size)
        }
    )


@router.get("/files/{file_id}/preview")
async def preview_file(
    file_id: UUID,
    version: Optional[int] = Query(None, description="Specific version to preview"),
    db: AsyncSession = Depends(get_db)
):
    file_res = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
    file_record = file_res.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File record not found")

    target_path_str = file_record.storage_path
    if version and version < file_record.current_version:
        ver_res = await db.execute(
            select(FileVersion).where(FileVersion.file_id == file_id, FileVersion.version_number == version)
        )
        ver_record = ver_res.scalar_one_or_none()
        if not ver_record:
            raise HTTPException(status_code=404, detail=f"Version {version} not found")
        target_path_str = ver_record.storage_path

    file_path = storage_service.get_file_path(target_path_str)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Physical file missing on server storage")

    filename = Path(file_record.relative_path).name
    mime_type = file_record.mime_type or storage_service.detect_mime_type(filename)

    return StreamingResponse(
        storage_service.file_chunk_generator(file_path),
        media_type=mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Content-Length": str(file_path.stat().st_size)
        }
    )


@router.get("/users/{user_id}/export-zip")
async def export_folder_zip(
    user_id: UUID,
    folder: Optional[str] = Query(None, description="Subfolder prefix to export"),
    include_deleted: bool = Query(False, description="Include deleted files in archive"),
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user_res = await db.execute(select(User).where(User.id == user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    query = select(FileRecord).where(FileRecord.user_id == user_id)
    if not include_deleted:
        query = query.where(FileRecord.is_deleted_locally == False)
    if folder:
        clean_folder = folder.strip("/\\")
        query = query.where(FileRecord.relative_path.startswith(clean_folder))

    files_res = await db.execute(query)
    records = files_res.scalars().all()

    if not records:
        raise HTTPException(status_code=404, detail="No files found matching criteria to archive")

    files_to_zip = []
    for r in records:
        fpath = storage_service.get_file_path(r.storage_path)
        if fpath.exists():
            files_to_zip.append({
                "arcname": r.relative_path,
                "path": str(fpath)
            })

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    zip_filename = f"backup_{user.email.split('@')[0]}_{timestamp}.zip"

    await log_audit(
        db,
        current_admin.id,
        "ADMIN_EXPORT_ZIP",
        {"user_id": str(user_id), "files_count": len(files_to_zip), "folder": folder}
    )

    zip_stream = storage_service.create_zip_stream(files_to_zip)
    return StreamingResponse(
        zip_stream,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"'
        }
    )


@router.post("/files/{file_id}/restore", response_model=FileRecordOut)
async def restore_deleted_file(
    file_id: UUID,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Resets is_deleted_locally = false, making the retained file active again.
    """
    file_res = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
    file_record = file_res.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File record not found")

    file_record.is_deleted_locally = False
    await log_audit(
        db,
        current_admin.id,
        "ADMIN_FILE_RESTORED",
        {"file_id": str(file_id), "relative_path": file_record.relative_path}
    )
    await db.flush()

    return FileRecordOut(
        id=file_record.id,
        user_id=file_record.user_id,
        device_id=file_record.device_id,
        relative_path=file_record.relative_path,
        file_size=file_record.file_size,
        sha256_hash=file_record.sha256_hash,
        mime_type=file_record.mime_type,
        current_version=file_record.current_version,
        is_deleted_locally=False,
        last_modified_client=file_record.last_modified_client,
        created_at=file_record.created_at,
        updated_at=file_record.updated_at,
        versions=[]
    )


@router.get("/audit-logs", response_model=List[AuditLogOut])
async def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(AuditLog, User.email.label("user_email")).outerjoin(User, AuditLog.user_id == User.id)
    if action:
        query = query.where(AuditLog.action == action)
    query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)

    res = await db.execute(query)
    rows = res.all()

    output = []
    for audit, email in rows:
        output.append(AuditLogOut(
            id=audit.id,
            user_id=audit.user_id,
            user_email=email,
            action=audit.action,
            details=audit.details,
            created_at=audit.created_at
        ))
    return output


# ---------------- Security & Anti-Ransomware Alerts ----------------
@router.get("/alerts", response_model=List[SecurityAlertOut])
async def list_security_alerts(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: UNRESOLVED, ACKNOWLEDGED, RESOLVED, ALL"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(
            SecurityAlert,
            User.email.label("user_email"),
            User.full_name.label("user_name"),
            Device.device_name.label("device_name"),
            Device.os.label("device_os")
        )
        .outerjoin(User, SecurityAlert.user_id == User.id)
        .outerjoin(Device, SecurityAlert.device_id == Device.id)
    )
    if status_filter and status_filter.upper() != "ALL":
        query = query.where(SecurityAlert.status == status_filter.upper())

    query = query.order_by(SecurityAlert.created_at.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    rows = res.all()

    output = []
    for alert, u_email, u_name, d_name, d_os in rows:
        output.append(SecurityAlertOut(
            id=alert.id,
            user_id=alert.user_id,
            user_email=u_email,
            user_name=u_name,
            device_id=alert.device_id,
            device_name=d_name,
            device_os=d_os,
            file_name=alert.file_name,
            folder_path=alert.folder_path,
            threat_type=alert.threat_type,
            severity=alert.severity,
            details=alert.details,
            status=alert.status,
            created_at=alert.created_at
        ))
    return output


@router.get("/alerts/count", response_model=SecurityAlertCountResponse)
async def get_alerts_count(db: AsyncSession = Depends(get_db)):
    unresolved_res = await db.execute(
        select(func.count(SecurityAlert.id)).where(SecurityAlert.status == "UNRESOLVED")
    )
    unresolved_count = unresolved_res.scalar() or 0

    critical_res = await db.execute(
        select(func.count(SecurityAlert.id)).where(SecurityAlert.status == "UNRESOLVED", SecurityAlert.severity == "CRITICAL")
    )
    critical_count = critical_res.scalar() or 0

    return SecurityAlertCountResponse(
        unresolved_count=unresolved_count,
        critical_count=critical_count
    )


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: UUID,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(SecurityAlert).where(SecurityAlert.id == alert_id))
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "ACKNOWLEDGED"
    await log_audit(
        db,
        current_admin.id,
        "SECURITY_ALERT_ACKNOWLEDGED",
        {"alert_id": str(alert_id), "file_name": alert.file_name}
    )
    await db.commit()
    return {"status": "acknowledged", "alert_id": str(alert_id)}


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: UUID,
    current_admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(SecurityAlert).where(SecurityAlert.id == alert_id))
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "RESOLVED"
    await log_audit(
        db,
        current_admin.id,
        "SECURITY_ALERT_RESOLVED",
        {"alert_id": str(alert_id), "file_name": alert.file_name}
    )
    await db.commit()
    return {"status": "resolved", "alert_id": str(alert_id)}
