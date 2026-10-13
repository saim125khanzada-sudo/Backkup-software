from uuid import UUID
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.device import Device
from app.models.file import FileRecord
from app.schemas import (
    HandshakeRequest, HandshakeResponse, UserOut,
    HashCheckRequest, HashCheckResponse, MarkDeletedRequest, FileRecordOut
)
from app.services.sync_service import process_file_upload, mark_file_deleted_locally, log_audit

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
        query = select(FileRecord).where(
            FileRecord.user_id == current_user.id,
            FileRecord.relative_path == item.relative_path
        )
        res = await db.execute(query)
        record = res.scalar_one_or_none()

        if not record:
            needed_uploads.append(item.relative_path)
        elif record.is_deleted_locally or record.sha256_hash.lower() != item.sha256_hash.lower():
            needed_uploads.append(item.relative_path)
        else:
            up_to_date.append(item.relative_path)

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
    # Touch device last seen
    if device_id:
        dev_res = await db.execute(select(Device).where(Device.id == device_id))
        dev = dev_res.scalar_one_or_none()
        if dev:
            dev.last_seen_at = datetime.now(timezone.utc)

    file_record = await process_file_upload(
        db=db,
        user=current_user,
        device_id=device_id,
        relative_path=relative_path,
        client_modified_at=client_modified_at,
        upload_file=file
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
