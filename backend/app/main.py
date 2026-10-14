import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text, func

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.security import get_password_hash
import app.models
from app.models import User, Device, FileRecord, FileVersion, AuditLog, SecurityAlert
from app.api.v1.auth import router as auth_router
from app.api.v1.admin import router as admin_router
from app.api.v1.sync import router as sync_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("enterprise_backup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Ensure storage root exists
    Path(settings.STORAGE_ROOT).mkdir(parents=True, exist_ok=True)
    logger.info(f"Storage directory initialized at: {settings.STORAGE_ROOT}")

    # 2. Database table creation & schema migration
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_session_jti VARCHAR(64);"))
        except Exception as e:
            logger.warning(f"Migration notice: {e}")
    logger.info("Database schema initialized and verified.")

    # 3. Seed initial IT Superuser Admin if none exists
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(func.lower(User.email) == settings.DEFAULT_ADMIN_EMAIL.lower())
        )
        admin = result.scalar_one_or_none()
        if not admin:
            any_admin_res = await session.execute(select(User).where(User.is_admin == True))
            admin = any_admin_res.scalars().first()

        if not admin:
            admin_user = User(
                email=settings.DEFAULT_ADMIN_EMAIL.lower(),
                password_hash=get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
                full_name=settings.DEFAULT_ADMIN_NAME,
                quota_bytes=1099511627776,  # 1 TB quota for admin
                used_bytes=0,
                is_admin=True,
                is_active=True
            )
            session.add(admin_user)
            await session.commit()
            logger.info(f"Created default IT Admin account: {settings.DEFAULT_ADMIN_EMAIL}")
        else:
            admin.password_hash = get_password_hash(settings.DEFAULT_ADMIN_PASSWORD)
            admin.is_active = True
            admin.is_admin = True
            await session.commit()
            logger.info(f"Synchronized IT Admin password for: {admin.email}")

    yield

    # Shutdown
    await engine.dispose()
    logger.info("Database engine connections closed.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(sync_router, prefix=settings.API_V1_STR)


@app.get("/health", status_code=status.HTTP_200_OK)
@app.get(f"{settings.API_V1_STR}/health", status_code=status.HTTP_200_OK)
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "storage_root": settings.STORAGE_ROOT
    }
