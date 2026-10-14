from uuid import UUID
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, ConfigDict, Field


# ---------------- Auth & Tokens ----------------
class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: Optional[str] = None
    quota_bytes: int
    used_bytes: int
    is_admin: bool
    is_active: bool
    device_count: Optional[int] = 0
    file_count: Optional[int] = 0
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------- User Provisioning ----------------
class UserCreate(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    quota_gb: Optional[float] = None
    quota_bytes: Optional[int] = None
    is_admin: bool = False


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    quota_gb: Optional[float] = None
    quota_bytes: Optional[int] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


class BatchUserResult(BaseModel):
    total_processed: int
    created_count: int
    errors: List[str]


# ---------------- Devices ----------------
class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    device_name: str
    os: str
    client_version: Optional[str] = None
    last_seen_at: datetime
    created_at: datetime


# ---------------- Files & Versions ----------------
class FileVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_number: int
    file_size: int
    sha256_hash: str
    created_at: datetime


class FileRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    device_id: Optional[UUID] = None
    relative_path: str
    file_size: int
    sha256_hash: str
    mime_type: Optional[str] = None
    current_version: int
    is_deleted_locally: bool
    last_modified_client: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    versions: Optional[List[FileVersionOut]] = []


# ---------------- Sync Protocol ----------------
class HandshakeRequest(BaseModel):
    device_name: str
    os: str
    client_version: Optional[str] = "1.0.0"


class HandshakeResponse(BaseModel):
    device_id: UUID
    server_time: datetime
    user: UserOut


class HashCheckItem(BaseModel):
    relative_path: str
    sha256_hash: str
    file_size: int


class HashCheckRequest(BaseModel):
    device_id: Optional[UUID] = None
    files: List[HashCheckItem]


class HashCheckResponse(BaseModel):
    needed_uploads: List[str]
    up_to_date: List[str]


class MarkDeletedRequest(BaseModel):
    device_id: Optional[UUID] = None
    relative_path: str


# ---------------- Audit & Stats ----------------
class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: Optional[UUID] = None
    user_email: Optional[str] = None
    action: str
    details: Optional[Any] = None
    created_at: datetime


class AdminStats(BaseModel):
    total_users: int
    total_used_bytes: int
    total_quota_bytes: int
    total_files: int
    total_devices: int
    active_devices_24h: int


# ---------------- Security Alerts & Ransomware ----------------
class SecurityAlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: Optional[UUID] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    device_id: Optional[UUID] = None
    device_name: Optional[str] = None
    device_os: Optional[str] = None
    file_name: str
    folder_path: str
    threat_type: str
    severity: str
    details: Optional[Any] = None
    status: str
    created_at: datetime


class ReportThreatRequest(BaseModel):
    device_id: Optional[UUID] = None
    relative_path: str
    file_name: str
    threat_type: str
    details: Optional[Any] = None


class SecurityAlertCountResponse(BaseModel):
    unresolved_count: int
    critical_count: int
