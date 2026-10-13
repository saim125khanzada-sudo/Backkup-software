import os
import io
import shutil
import hashlib
import mimetypes
import zipfile
from pathlib import Path
from typing import AsyncGenerator, BinaryIO, Tuple, List, Dict
import aiofiles
from fastapi import UploadFile, HTTPException

from app.core.config import settings


class StorageService:
    def __init__(self, base_path: str = settings.STORAGE_ROOT):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def get_user_storage_dir(self, user_id: str) -> Path:
        user_dir = self.base_path / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    def get_file_path(self, storage_path: str) -> Path:
        path = Path(storage_path)
        if not path.is_absolute():
            path = self.base_path / path
        return path

    def detect_mime_type(self, filename: str) -> str:
        mime, _ = mimetypes.guess_type(filename)
        if mime:
            return mime
        # Fallbacks for common extensions
        ext = os.path.splitext(filename)[1].lower()
        mapping = {
            ".log": "text/plain",
            ".py": "text/x-python",
            ".ts": "text/typescript",
            ".tsx": "text/typescript",
            ".js": "text/javascript",
            ".jsx": "text/javascript",
            ".json": "application/json",
            ".csv": "text/csv",
            ".tsv": "text/tab-separated-values",
            ".md": "text/markdown",
            ".yaml": "text/yaml",
            ".yml": "text/yaml",
            ".sql": "text/x-sql",
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".webp": "image/webp",
            ".mp4": "video/mp4",
            ".mp3": "audio/mpeg",
        }
        return mapping.get(ext, "application/octet-stream")

    async def save_uploaded_stream(
        self,
        user_id: str,
        relative_path: str,
        upload_file: UploadFile
    ) -> Tuple[str, int, str]:
        """
        Streams uploaded file directly to disk while computing SHA256 hash
        and file size in a single pass to prevent memory exhaustion.
        Returns: (storage_path, file_size, sha256_hash)
        """
        # Clean relative path to avoid path traversal
        clean_rel = os.path.normpath(relative_path).lstrip("/\\")
        if ".." in clean_rel:
            raise HTTPException(status_code=400, detail="Invalid relative path traversal")

        dest_file_path = self.get_user_storage_dir(user_id) / clean_rel
        dest_file_path.parent.mkdir(parents=True, exist_ok=True)

        temp_path = dest_file_path.with_name(f"{dest_file_path.name}.tmp_{os.urandom(6).hex()}")

        sha256 = hashlib.sha256()
        bytes_written = 0

        async with aiofiles.open(temp_path, "wb") as out_f:
            while True:
                chunk = await upload_file.read(settings.STREAM_CHUNK_SIZE)
                if not chunk:
                    break
                sha256.update(chunk)
                bytes_written += len(chunk)
                await out_f.write(chunk)

        # Atomically replace destination file
        if temp_path.exists():
            if dest_file_path.exists():
                dest_file_path.unlink()
            shutil.move(str(temp_path), str(dest_file_path))

        return str(dest_file_path), bytes_written, sha256.hexdigest()

    async def create_version_snapshot(
        self,
        user_id: str,
        file_id: str,
        current_version_num: int,
        source_storage_path: str
    ) -> str:
        """
        Stores an immutable copy of the previous version into
        /data/storage/{user_id}/.versions/{file_id}/v{current_version_num}
        """
        versions_dir = self.get_user_storage_dir(user_id) / ".versions" / str(file_id)
        versions_dir.mkdir(parents=True, exist_ok=True)

        version_dest = versions_dir / f"v{current_version_num}"
        source_path = self.get_file_path(source_storage_path)

        if source_path.exists():
            shutil.copy2(str(source_path), str(version_dest))
        return str(version_dest)

    async def file_chunk_generator(self, file_path: Path, chunk_size: int = settings.STREAM_CHUNK_SIZE) -> AsyncGenerator[bytes, None]:
        async with aiofiles.open(file_path, "rb") as f:
            while True:
                chunk = await f.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    def create_zip_stream(self, files_to_zip: List[Dict[str, str]]) -> AsyncGenerator[bytes, None]:
        """
        Yields zip file chunks on the fly for on-demand downloading.
        files_to_zip format: [{'arcname': 'relative/path.ext', 'path': '/data/storage/...'}]
        """
        class ZipStreamQueue:
            def __init__(self):
                self.buffer = io.BytesIO()

            def write(self, b):
                return self.buffer.write(b)

            def flush(self):
                pass

            def read_all(self):
                val = self.buffer.getvalue()
                self.buffer.seek(0)
                self.buffer.truncate(0)
                return val

        stream_buffer = ZipStreamQueue()

        async def generator():
            with zipfile.ZipFile(stream_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                for item in files_to_zip:
                    arcname = item["arcname"]
                    local_p = Path(item["path"])
                    if local_p.exists() and local_p.is_file():
                        # Write in chunks to keep memory bounded
                        with open(local_p, "rb") as src:
                            zinfo = zipfile.ZipInfo(arcname)
                            zinfo.compress_type = zipfile.ZIP_DEFLATED
                            zinfo.external_attr = 0o644 << 16
                            with zf.open(zinfo, mode="w") as dest:
                                while True:
                                    chunk = src.read(settings.STREAM_CHUNK_SIZE)
                                    if not chunk:
                                        break
                                    dest.write(chunk)
                                    flushed = stream_buffer.read_all()
                                    if flushed:
                                        yield flushed
                    flushed = stream_buffer.read_all()
                    if flushed:
                        yield flushed

            flushed = stream_buffer.read_all()
            if flushed:
                yield flushed

        return generator()


storage_service = StorageService()
