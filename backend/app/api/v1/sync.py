from uuid import UUID
from datetime import datetime, timezone
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.device import Device
from app.models.file import FileRecord
from app.models.security_alert import SecurityAlert
from app.schemas import (
    HandshakeRequest, HandshakeResponse, UserOut,
    HashCheckRequest, HashCheckResponse, MarkDeletedRequest, FileRecordOut,
    ReportThreatRequest
)
from app.services.sync_service import process_file_upload, mark_file_deleted_locally, log_audit
from app.services.threat_scanner import MaliciousFileException

router = APIRouter(prefix="/sync", tags=["Sync Protocol"])


@router.post("/handshake", response_model=HandshakeResponse)
async def sync_handshake(
    req: HandshakeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Find or register device
    dev_query = select(Device).where(
        Device.user_id == current_user.id,
        Device.device_name == req.device_name,
        Device.os == req.os.lower()
    )
    result = await db.execute(dev_query)
    device = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if device:
        device.client_version = req.client_version
        device.last_seen_at = now
    else:
        device = Device(
            user_id=current_user.id,
            device_name=req.device_name,
            os=req.os.lower(),
            client_version=req.client_version,
            last_seen_at=now
        )
        db.add(device)

    await log_audit(
        db,
        current_user.id,
        "CLIENT_HANDSHAKE",
        {"device_name": req.device_name, "os": req.os, "version": req.client_version}
    )
    await db.flush()

    user_out = UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        quota_bytes=current_user.quota_bytes,
        used_bytes=current_user.used_bytes,
        is_admin=current_user.is_admin,
        is_active=current_user.is_active,
        device_count=1,
        file_count=0,
        created_at=current_user.created_at
    )

    return HandshakeResponse(
        device_id=device.id,
        server_time=now,
        user=user_out
    )


@router.post("/check-hashes", response_model=HashCheckResponse)
async def check_hashes(
    req: HashCheckRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Compares client file hashes against server catalog to determine which
    files actually need to be uploaded, saving network bandwidth.
    """
    needed_uploads: List[str] = []
    up_to_date: List[str] = []

    for item in req.files:
        norm_rel = item.relative_path.replace("\\", "/").strip("/\\")
        # Ignore files exceeding the 1GB hard limit
        if item.file_size > settings.MAX_SINGLE_FILE_BYTES:
            continue

        query = select(FileRecord).where(
            FileRecord.user_id == current_user.id,
            FileRecord.relative_path == norm_rel
        )
        res = await db.execute(query)
        record = res.scalar_one_or_none()

        if not record:
            needed_uploads.append(norm_rel)
        elif record.is_deleted_locally or record.sha256_hash.lower() != item.sha256_hash.lower():
            needed_uploads.append(norm_rel)
        else:
            up_to_date.append(norm_rel)

    return HashCheckResponse(
        needed_uploads=needed_uploads,
        up_to_date=up_to_date
    )


@router.post("/upload", response_model=FileRecordOut)
async def upload_file(
    relative_path: str = Form(...),
    device_id: Optional[UUID] = Form(None),
    client_modified_at: Optional[datetime] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Streams incoming file upload, verifies hash & quota, saves to disk,
    and updates version history immutably.
    """
    if file.size and file.size > settings.MAX_SINGLE_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds maximum allowed single file size limit of 1GB"
        )

    # Touch device last seen
    if device_id:
        dev_res = await db.execute(select(Device).where(Device.id == device_id))
        dev = dev_res.scalar_one_or_none()
        if dev:
            dev.last_seen_at = datetime.now(timezone.utc)

    norm_rel = relative_path.replace("\\", "/").strip("/\\")
    try:
        file_record = await process_file_upload(
            db=db,
            user=current_user,
            device_id=device_id,
            relative_path=norm_rel,
            client_modified_at=client_modified_at,
            upload_file=file
        )
    except MaliciousFileException as e:
        folder_p = str(Path(norm_rel).parent).replace("\\", "/")
        if folder_p == ".":
            folder_p = "/"
        file_name = Path(norm_rel).name

        alert = SecurityAlert(
            user_id=current_user.id,
            device_id=device_id,
            file_name=file_name,
            folder_path=folder_p,
            threat_type=e.threat_type,
            severity="CRITICAL",
            details=e.details,
            status="UNRESOLVED"
        )
        db.add(alert)
        await log_audit(
            db,
            current_user.id,
            "SECURITY_ALERT_MALICIOUS_UPLOAD_BLOCKED",
            {
                "file_name": file_name,
                "folder_path": folder_p,
                "threat_type": e.threat_type,
                "details": e.details
            }
        )
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "MALICIOUS_CONTENT_BLOCKED",
                "message": f"Security violation: File '{file_name}' was blocked from backup.",
                "threat_type": e.threat_type,
                "file_name": file_name,
                "folder_path": folder_p
            }
        )

    return FileRecordOut(
        id=file_record.id,
        user_id=file_record.user_id,
        device_id=file_record.device_id,
        relative_path=file_record.relative_path,
        file_size=file_record.file_size,
        sha256_hash=file_record.sha256_hash,
        mime_type=file_record.mime_type,
        current_version=file_record.current_version,
        is_deleted_locally=file_record.is_deleted_locally,
        last_modified_client=file_record.last_modified_client,
        created_at=file_record.created_at,
        updated_at=file_record.updated_at,
        versions=[]
    )


@router.post("/report-threat")
async def report_threat(
    req: ReportThreatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Called by client agents when a malicious or ransomware file is intercepted locally.
    Records alert for IT Administrator notification.
    """
    norm_rel = req.relative_path.replace("\\", "/").strip("/\\")
    folder_p = str(Path(norm_rel).parent).replace("\\", "/")
    if folder_p == ".":
        folder_p = "/"

    alert = SecurityAlert(
        user_id=current_user.id,
        device_id=req.device_id,
        file_name=req.file_name,
        folder_path=folder_p,
        threat_type=req.threat_type,
        severity="CRITICAL",
        details=req.details,
        status="UNRESOLVED"
    )
    db.add(alert)
    await log_audit(
        db,
        current_user.id,
        "SECURITY_ALERT_CLIENT_PREFLIGHT_BLOCKED",
        {
            "file_name": req.file_name,
            "folder_path": folder_p,
            "threat_type": req.threat_type,
            "details": req.details
        }
    )
    await db.commit()

    return {
        "status": "threat_recorded",
        "alert_id": str(alert.id),
        "admin_notified": True
    }


@router.post("/mark-deleted")
async def mark_file_deleted(
    req: MarkDeletedRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Records local deletion by setting is_deleted_locally = true.
    DOES NOT purge or delete the physical file on the server.
    """
    record = await mark_file_deleted_locally(
        db=db,
        user=current_user,
        device_id=req.device_id,
        relative_path=req.relative_path
    )
    if not record:
        return {"status": "not_found", "message": "File was not tracked on server"}

    return {
        "status": "marked_deleted_locally",
        "file_id": str(record.id),
        "relative_path": record.relative_path,
        "is_deleted_locally": True,
        "server_retention": "file retained safely on server disk"
    }
