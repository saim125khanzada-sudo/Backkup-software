from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, get_current_user
from app.models.user import User
from app.models.device import Device
from app.models.file import FileRecord
from app.schemas import LoginRequest, Token, UserOut
from app.services.sync_service import log_audit

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == credentials.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.password_hash):
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
