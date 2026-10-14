import uuid
from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True
    )

    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    folder_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    threat_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), default="CRITICAL")  # CRITICAL, HIGH, MEDIUM
    details: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="UNRESOLVED", index=True)  # UNRESOLVED, ACKNOWLEDGED, RESOLVED
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    # Relationships
    user = relationship("User", backref="security_alerts")
    device = relationship("Device", backref="security_alerts")
