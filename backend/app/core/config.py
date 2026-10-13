import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Enterprise Backup & Sync Platform"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://backup_admin:SecurePass2026@postgres:5432/enterprise_backup"
    
    # Security
    SECRET_KEY: str = "change-me-to-a-very-secure-random-secret-key-in-production-50char-min"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Storage
    STORAGE_ROOT: str = "/data/storage"
    
    # Initial Admin Seed
    DEFAULT_ADMIN_EMAIL: str = "admin@enterprise.local"
    DEFAULT_ADMIN_PASSWORD: str = "AdminPass123!"
    DEFAULT_ADMIN_NAME: str = "IT System Administrator"
    
    # Default User Quota (50 GB)
    DEFAULT_USER_QUOTA_BYTES: int = 53687091200
    
    # Streaming Chunk Size (4MB)
    STREAM_CHUNK_SIZE: int = 1024 * 1024 * 4

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
