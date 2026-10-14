import uuid
import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, get_current_user
from app.models.user import User
from app.models.device import Device
from app.models.file import FileRecord
from app.schemas import LoginRequest, Token, UserOut
from app.services.sync_service import log_audit

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("enterprise_backup.auth")


@router.post("/login", response_model=Token)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    cleaned_input = str(credentials.email).strip().lower()
    
    # 1. Exact match by email
    query = select(User).where(func.lower(User.email) == cleaned_input)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    # 2. Support username shortcuts (e.g. 'saim' or 'admin' matching 'saim@...' or 'admin@...')
    if not user and "@" not in cleaned_input:
        prefix_query = select(User).where(
            or_(
                func.lower(User.email).like(f"{cleaned_input}@%"),
                func.lower(User.email) == f"{cleaned_input}@enterprise.local",
                func.lower(User.email) == f"{cleaned_input}@mobilelink.local"
            )
        )
        result = await db.execute(prefix_query)
        matches = result.scalars().all()
        if matches:
            # Prefer admin user if there are multiple matches
            user = next((u for u in matches if u.is_admin), matches[0])

    if not user:
        logger.warning(f"Login failed: no user account found for '{cleaned_input}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(credentials.password, user.password_hash):
        logger.warning(f"Login failed: password mismatch for user '{user.email}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Please contact your IT administrator."
        )

    # Fetch counts
    dev_count_res = await db.execute(
        select(func.count(Device.id)).where(Device.user_id == user.id)
    )
    device_count = dev_count_res.scalar() or 0

    file_count_res = await db.execute(
        select(func.count(FileRecord.id)).where(FileRecord.user_id == user.id)
    )
    file_count = file_count_res.scalar() or 0

    if user.is_admin:
        session_jti = uuid.uuid4().hex
        user.admin_session_jti = session_jti
        await db.commit()

        access_token = create_access_token(
            subject=str(user.id),
            expires_delta=timedelta(minutes=settings.ADMIN_TOKEN_EXPIRE_MINUTES),
            jti=session_jti
        )
    else:
        access_token = create_access_token(subject=str(user.id))

    await log_audit(db, user.id, "AUTH_LOGIN", {"email": user.email})

    user_out = UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        quota_bytes=user.quota_bytes,
        used_bytes=user.used_bytes,
        is_admin=user.is_admin,
        is_active=user.is_active,
        device_count=device_count,
        file_count=file_count,
        created_at=user.created_at
    )

    return Token(access_token=access_token, token_type="bearer", user=user_out)


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Terminates and invalidates the active admin session immediately so it can never be used again.
    """
    if current_user.is_admin:
        current_user.admin_session_jti = None
        await db.commit()
    await log_audit(db, current_user.id, "AUTH_LOGOUT", {"email": current_user.email})
    return {"message": "Session successfully terminated and invalidated"}


@router.get("/me", response_model=UserOut)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    dev_count_res = await db.execute(
        select(func.count(Device.id)).where(Device.user_id == current_user.id)
    )
    device_count = dev_count_res.scalar() or 0

    file_count_res = await db.execute(
        select(func.count(FileRecord.id)).where(FileRecord.user_id == current_user.id)
    )
    file_count = file_count_res.scalar() or 0

    return UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        quota_bytes=current_user.quota_bytes,
        used_bytes=current_user.used_bytes,
        is_admin=current_user.is_admin,
        is_active=current_user.is_active,
        device_count=device_count,
        file_count=file_count,
        created_at=current_user.created_at
    )
