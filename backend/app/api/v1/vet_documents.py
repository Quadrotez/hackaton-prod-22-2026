import logging
from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from openai import OpenAIError
from PIL import Image, UnidentifiedImageError

from app.api.dependencies import AppSettings, CurrentUser, DbSession
from app.api.v1.pets import get_cared_pet
from app.integrations.llm.vet_document_analyzer import analyze_veterinary_document
from app.schemas.vet_documents import VeterinaryDocumentAnalysis

router = APIRouter(prefix="/pets/{pet_id}/vet-documents", tags=["vet documents"])
logger = logging.getLogger(__name__)
IMAGE_FORMAT_CONTENT_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
READ_CHUNK_SIZE = 64 * 1024


async def read_limited_image(file: UploadFile, max_size: int) -> tuple[bytes, str]:
    chunks: list[bytes] = []
    size = 0
    while chunk := await file.read(READ_CHUNK_SIZE):
        size += len(chunk)
        if size > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Image exceeds the maximum allowed size",
            )
        chunks.append(chunk)

    image_bytes = b"".join(chunks)
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Uploaded file is not a supported image",
        )

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.verify()
            image_format = image.format or ""
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Uploaded file is not a supported image",
        ) from None

    content_type = IMAGE_FORMAT_CONTENT_TYPES.get(image_format)
    if content_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image format; use PNG, JPEG, or WebP",
        )
    return image_bytes, content_type


@router.post(
    "/analyze",
    response_model=VeterinaryDocumentAnalysis,
    summary="Analyze a veterinary document photo",
    description=(
        "Accepts a PNG, JPEG, or WebP photo and optional context about the authenticated "
        "user's pet. The photo has priority over context. Returns status, document type, "
        "the eight flat extracted fields, including veterinarian_profession, the clinic "
        "in vet, and post-visit instructions, followed by warnings and error code."
    ),
)
async def analyze_pet_veterinary_document(
    pet_id: int,
    current_user: CurrentUser,
    db: DbSession,
    settings: AppSettings,
    image: UploadFile = File(...),
    pet_context: str | None = Form(default=None, max_length=4000),
) -> VeterinaryDocumentAnalysis:
    get_cared_pet(pet_id, current_user, db)
    normalized_context = (pet_context or "").strip()

    try:
        image_bytes, content_type = await read_limited_image(
            image, settings.max_upload_size_bytes
        )
        result = analyze_veterinary_document(
            image_bytes,
            content_type=content_type,
            user_text=normalized_context,
        )
        analysis = VeterinaryDocumentAnalysis.model_validate(result)
        logger.info(
            "Vet document analyzed",
            extra={
                "event": "vet_document.analyzed",
                "pet_id": pet_id,
                "status": analysis.status,
                "document_type": analysis.document_type,
                "error_code": analysis.error_code,
                "warnings": len(analysis.warnings),
            },
        )
        return analysis
    except HTTPException:
        raise
    except ValueError as exc:
        logger.warning(
            "AI returned an unusable answer: %s",
            exc,
            extra={"event": "vet_document.invalid_answer", "pet_id": pet_id},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an invalid response",
        ) from None
    except (OpenAIError, RuntimeError) as exc:
        logger.error(
            "AI service call failed: %s",
            type(exc).__name__,
            exc_info=True,
            extra={"event": "vet_document.ai_unavailable", "pet_id": pet_id},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service is unavailable",
        ) from None
    finally:
        await image.close()
