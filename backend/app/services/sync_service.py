from datetime import datetime, timezone
from typing import Optional, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import UploadFile, HTTPException, status

from app.models.user import User
from app.models.file import FileRecord, FileVersion
from app.models.audit import AuditLog
from app.services.storage import storage_service


async def log_audit(
    db: AsyncSession,
    user_id: Optional[UUID],
    action: str,
    details: Optional[Any] = None
):
    audit = AuditLog(
        user_id=user_id,
        action=action,
        details=details
    )
    db.add(audit)
    await db.flush()


async def process_file_upload(
    db: AsyncSession,
    user: User,
    device_id: Optional[UUID],
    relative_path: str,
    client_modified_at: Optional[datetime],
    upload_file: UploadFile
) -> FileRecord:
    # 1. Fetch existing file record if any
    query = select(FileRecord).where(
        FileRecord.user_id == user.id,
        FileRecord.relative_path == relative_path
    )
    result = await db.execute(query)
    existing_file = result.scalar_one_or_none()

    old_size = existing_file.file_size if existing_file else 0

    # 2. Save stream to disk, computing SHA256 & size in single pass
    dest_path, file_size, sha256_hash = await storage_service.save_uploaded_stream(
        user_id=str(user.id),
        relative_path=relative_path,
        upload_file=upload_file
    )

    size_delta = file_size - old_size
    if (user.used_bytes + size_delta) > user.quota_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"User quota exceeded. Available: {user.quota_bytes - user.used_bytes} bytes, required: {size_delta} bytes"
        )

    mime_type = storage_service.detect_mime_type(relative_path)

    if existing_file:
        # Check if identical content
        if existing_file.sha256_hash == sha256_hash and not existing_file.is_deleted_locally:
            # File is unchanged, simply update timestamp
            existing_file.last_modified_client = client_modified_at or datetime.now(timezone.utc)
            if device_id:
                existing_file.device_id = device_id
            await db.flush()
            return existing_file

        # Content changed or file was previously deleted: Archive previous version
        if existing_file.sha256_hash != sha256_hash:
            snapshot_path = await storage_service.create_version_snapshot(
                user_id=str(user.id),
                file_id=str(existing_file.id),
                current_version_num=existing_file.current_version,
                source_storage_path=existing_file.storage_path
            )
            version_record = FileVersion(
                file_id=existing_file.id,
                version_number=existing_file.current_version,
                storage_path=snapshot_path,
                file_size=existing_file.file_size,
                sha256_hash=existing_file.sha256_hash
            )
            db.add(version_record)
            existing_file.current_version += 1

        existing_file.storage_path = dest_path
        existing_file.file_size = file_size
        existing_file.sha256_hash = sha256_hash
        existing_file.mime_type = mime_type
        existing_file.is_deleted_locally = False
        existing_file.last_modified_client = client_modified_at or datetime.now(timezone.utc)
        if device_id:
            existing_file.device_id = device_id
        
        user.used_bytes = max(0, user.used_bytes + size_delta)
        await log_audit(
            db,
            user.id,
            "FILE_UPDATED",
            {"relative_path": relative_path, "version": existing_file.current_version, "size": file_size}
        )
        await db.flush()
        return existing_file
    else:
        # New file creation
        new_file = FileRecord(
            user_id=user.id,
            device_id=device_id,
            relative_path=relative_path,
            storage_path=dest_path,
            file_size=file_size,
            sha256_hash=sha256_hash,
            mime_type=mime_type,
            current_version=1,
            is_deleted_locally=False,
            last_modified_client=client_modified_at or datetime.now(timezone.utc)
        )
        db.add(new_file)
        user.used_bytes = max(0, user.used_bytes + file_size)
        await log_audit(
            db,
            user.id,
            "FILE_CREATED",
            {"relative_path": relative_path, "version": 1, "size": file_size}
        )
        await db.flush()
        return new_file


async def mark_file_deleted_locally(
    db: AsyncSession,
    user: User,
    device_id: Optional[UUID],
    relative_path: str
) -> Optional[FileRecord]:
    query = select(FileRecord).where(
        FileRecord.user_id == user.id,
        FileRecord.relative_path == relative_path
    )
    result = await db.execute(query)
    file_record = result.scalar_one_or_none()

    if not file_record:
        return None

    # Strictly mark deleted flag without removing physical file or record
    file_record.is_deleted_locally = True
    if device_id:
        file_record.device_id = device_id

    await log_audit(
        db,
        user.id,
        "FILE_DELETED_LOCALLY",
        {"relative_path": relative_path, "file_id": str(file_record.id)}
    )
    await db.flush()
    return file_record
