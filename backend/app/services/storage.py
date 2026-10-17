from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

SUPPORTED_IMAGE_FORMATS = {
    "PNG": (".png", "image/png"),
    "JPEG": (".jpg", "image/jpeg"),
    "GIF": (".gif", "image/gif"),
    "WEBP": (".webp", "image/webp"),
}
MEDIA_PREFIX = "/media/"
CHUNK_SIZE = 64 * 1024


class InvalidImageError(ValueError):
    pass


class FileTooLargeError(ValueError):
    pass


class LocalMediaStorage:
    def __init__(self, media_dir: Path, max_file_size: int) -> None:
        self.media_dir = media_dir.resolve()
        self.max_file_size = max_file_size
        self.media_dir.mkdir(parents=True, exist_ok=True)

    async def save_pet_photo(self, file: UploadFile) -> str:
        return await self._save_image(file, "pets")

    async def save_avatar(self, file: UploadFile) -> str:
        return await self._save_image(file, "avatars")

    async def _save_image(self, file: UploadFile, directory: str) -> str:
        relative_path = Path(directory) / f"{uuid4().hex}.upload"
        temporary_path = self._safe_path(relative_path)
        temporary_path.parent.mkdir(parents=True, exist_ok=True)
        size = 0
        try:
            with temporary_path.open("wb") as output:
                while chunk := await file.read(CHUNK_SIZE):
                    size += len(chunk)
                    if size > self.max_file_size:
                        raise FileTooLargeError
                    output.write(chunk)

            extension, _ = self._inspect_image(temporary_path)
            final_relative_path = temporary_path.relative_to(self.media_dir).with_suffix(extension)
            final_path = self._safe_path(final_relative_path)
            temporary_path.replace(final_path)
            return f"{MEDIA_PREFIX}{final_relative_path.as_posix()}"
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise

    def resolve_photo(self, photo_url: str | None) -> tuple[Path, str] | None:
        if not photo_url or not photo_url.startswith(MEDIA_PREFIX):
            return None
        relative_path = Path(photo_url.removeprefix(MEDIA_PREFIX))
        if relative_path.is_absolute() or ".." in relative_path.parts:
            return None
        destination = self._safe_path(relative_path)
        if not destination.is_file():
            return None
        media_type = SUPPORTED_IMAGE_FORMATS.get(
            destination.suffix.upper().lstrip("."), ("", "application/octet-stream")
        )[1]
        return destination, media_type

    def delete(self, photo_url: str | None) -> None:
        resolved = self.resolve_photo(photo_url)
        if resolved is not None:
            resolved[0].unlink(missing_ok=True)

    def _safe_path(self, relative_path: Path) -> Path:
        destination = (self.media_dir / relative_path).resolve()
        if self.media_dir == destination or self.media_dir not in destination.parents:
            raise ValueError("Invalid media path")
        return destination

    @staticmethod
    def _inspect_image(path: Path) -> tuple[str, str]:
        try:
            with Image.open(path) as image:
                image.verify()
                image_format = image.format or ""
        except (UnidentifiedImageError, OSError, SyntaxError):
            raise InvalidImageError from None

        result = SUPPORTED_IMAGE_FORMATS.get(image_format)
        if result is None:
            raise InvalidImageError
        return result
