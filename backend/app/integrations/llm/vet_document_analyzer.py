from __future__ import annotations

import base64
import json
import logging
import os
import re
import time
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from openai import OpenAI
from pydantic import ValidationError

from app.integrations.llm.client import FOLDER_ID, build_client
from app.integrations.llm.response import checked_message
from app.schemas.vet_documents import VeterinaryDocumentAnalysis

MODEL_NAME = os.getenv("YANDEX_MODEL", "deepseek-v4.1-flash")
logger = logging.getLogger(__name__)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
CONTRACT_KEYS = (
    "status",
    "document_type",
    "visit_at",
    "visit_reason",
    "visit_price",
    "veterinarian_name",
    "veterinarian_profession",
    "vet",
    "post_visit_instructions",
    "warnings",
    "error_code",
)
TEXT_FIELDS = (
    "visit_reason",
    "veterinarian_name",
    "veterinarian_profession",
    "vet",
    "post_visit_instructions",
)

SYSTEM_PROMPT = """
Ты — AI-анализатор фотографий ветеринарных документов приложения PetCare.

Твоя задача — извлечь из фотографии ровно семь полей:
- visit_at — дата и время ветеринарного приёма строго в ISO 8601 формате;
- visit_reason — явно указанная причина обращения, цель визита или жалоба;
- visit_price — стоимость именно ветеринарного приёма как JSON-число;
- veterinarian_name — имя ветеринарного врача;
- veterinarian_profession — профессия или должность ветеринарного специалиста;
- vet — название или иная явно указанная информация о ветеринарной клинике, которая выполнила услугу. Если в источнике нет такой информации, значение null;
- post_visit_instructions — явно указанные после приёма рекомендации: что сделать, купить или принимать. Это строковое поле; если таких рекомендаций нет, значение null.

ФОТОГРАФИЯ — главный и приоритетный источник данных. Сначала внимательно прочитай
фотографию, включая мелкий текст, таблицы, чеки и подписи. Затем используй текст пользователя
только для заполнения тех полей, которые остались null после анализа фотографии. Если
фотография и текст содержат разные значения, сохраняй значение с фотографии, не заменяй его
данными пользователя и добавляй предупреждение. Если фотография не содержит полезной
информации, заполни итоговые поля из текста, когда это возможно, но оставь status равным
error, поскольку status определяется исключительно по фотографии.

Не подменяй причину обращения диагнозом, результатом анализа или назначением. Не используй общую сумму чека,
стоимость лекарств, анализов, процедур или сумму нескольких услуг как visit_price.
Не ставь диагнозы, не назначай лечение и ничего не выдумывай. В поле post_visit_instructions
переноси только явно написанные в документе рекомендации после приёма; не формулируй
рекомендации самостоятельно и не превращай диагноз, результаты анализов или описание
процедуры в рекомендацию. Если значение нельзя достоверно определить, верни null.

Нормализуй visit_at строго в ISO 8601 формате с UTC-суффиксом Z:
YYYY-MM-DDTHH:MM:SSZ или YYYY-MM-DDTHH:MM:SS.sssZ.
Если дата указана, но время не найдено или неразборчиво, обязательно используй 00:00:00Z.
Если дата не найдена, верни null. Не возвращай только дату и не используй visit_date.
Примеры:
- «17.10.2026 в 15:44» → "2026-10-17T15:44:00Z";
- «17 октября 2026» без времени → "2026-10-17T00:00:00Z";
- дата не указана → null.
Стоимость возвращай числом, не строкой; 0 — допустимое значение и не является null.
Определи document_type исключительно по фотографии; для обычного ветеринарного отчёта
используй "veterinary_report", для чека — "veterinary_receipt", а если фотография не
содержит ветеринарного документа, верни null.

Определи status исключительно по фотографии, до подстановки значений из текста пользователя:
- success — на фотографии найдены все семь полей;
- partial — на фотографии найдено хотя бы одно, но не все семь полей;
- error — на фотографии не найдено ни одного из семи полей.
Итоговые поля при этом являются единым общим результатом: после определения status
заполни оставшиеся null-поля данными из текста пользователя, если они там явно указаны.

Используй error_code только при конкретной проблеме:
- UNREADABLE_IMAGE — файл или фотографию невозможно надёжно прочитать;
- UNSUPPORTED_DOCUMENT — фотография читаема, но на ней нет ветеринарного документа или
  полезной ветеринарной информации;
- INSUFFICIENT_INPUT — ни фотография, ни текст не дают ни одного значения.
Если фотография читаема, но не содержит полезной информации, а итоговые поля заполнены
из текста, используй UNSUPPORTED_DOCUMENT и добавь предупреждение об использовании текста.
Не используй UNREADABLE_IMAGE для читаемой фотографии без ветеринарного документа. Иначе
error_code должен быть null. Warnings — массив конкретных предупреждений, либо пустой массив.

Верни исключительно один валидный JSON-объект ровно такой структуры, без Markdown,
комментариев, дополнительных полей или текста вне JSON:
{
  "status": "success",
  "document_type": "veterinary_report",
  "visit_at": null,
  "visit_reason": null,
  "visit_price": null,
  "veterinarian_name": null,
  "veterinarian_profession": null,
  "vet": null,
  "post_visit_instructions": null,
  "warnings": [],
  "error_code": null
}

Верхний уровень обязан содержать ровно ключи status, document_type, visit_at, visit_reason,
visit_price, veterinarian_name, veterinarian_profession, vet,
post_visit_instructions, warnings и error_code. Все поля — включая семь извлекаемых полей и
четыре служебных поля — должны находиться непосредственно в корне JSON. Не добавляй extracted_data или
user_provided_data. Отсутствующие значения должны быть JSON null.

Пример: если на фотографии не найден ветеринарный документ, но в тексте явно указаны дата
«15 октября 2026 года», причина «Плановый осмотр», стоимость 2500 и врач «Иванов», верни
status "error", document_type null, эти значения в корне JSON, veterinarian_profession,
vet и post_visit_instructions равными null, предупреждение «На фотографии не обнаружено полезной информации. Данные заполнены из
текста.» и error_code "UNSUPPORTED_DOCUMENT".

Если на фотографии найдены дата, причина, стоимость и врач, текст может заполнить только
поля, которые остались null. Если клиника или после приёма рекомендации не указаны,
верни vet и post_visit_instructions равными null.
""".strip()


def _json_object_from_content(content: str) -> dict[str, Any]:
    """Parse a JSON object while tolerating common Markdown wrappers."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("The model response must be a JSON object")
    return parsed


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return None


def _normalize_price(value: Any) -> int | float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value if value >= 0 else None
    if not isinstance(value, str):
        return None
    cleaned = value.strip().replace("\u00a0", " ")
    cleaned = re.sub(r"[^0-9,.-]", "", cleaned)
    if not cleaned:
        return None
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "") if cleaned.rfind(".") > cleaned.rfind(",") else cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        parts = cleaned.split(",")
        cleaned = "".join(parts) if len(parts[-1]) == 3 else ".".join(parts)
    try:
        number = Decimal(cleaned)
    except InvalidOperation:
        return None
    if number < 0:
        return None
    return int(number) if number == number.to_integral_value() else float(number)


def _normalize_visit_at(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            for fmt in ("%d.%m.%Y", "%d.%m.%Y %H:%M", "%Y-%m-%d"):
                try:
                    parsed = datetime.strptime(raw, fmt)
                    break
                except ValueError:
                    continue
            else:
                return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _normalize_analysis(raw: dict[str, Any]) -> dict[str, Any]:
    """Make a best-effort model response conform to the public contract."""
    result: dict[str, Any] = {key: None for key in CONTRACT_KEYS}
    result["warnings"] = []

    result["visit_at"] = _normalize_visit_at(raw.get("visit_at"))
    result["visit_price"] = _normalize_price(raw.get("visit_price"))
    for field in TEXT_FIELDS:
        result[field] = _normalize_text(raw.get(field))

    document_type = _normalize_text(raw.get("document_type"))
    result["document_type"] = document_type
    status = raw.get("status")
    if status in {"success", "partial", "error"}:
        result["status"] = status
    else:
        result["status"] = "partial" if any(
            result[field] is not None
            for field in ("visit_at", *TEXT_FIELDS, "visit_price")
        ) else "error"

    warnings = raw.get("warnings")
    if isinstance(warnings, list):
        result["warnings"] = [warning for item in warnings if (warning := _normalize_text(item))]
    elif warnings is not None:
        warning = _normalize_text(warnings)
        result["warnings"] = [warning] if warning else []

    error_code = raw.get("error_code")
    if error_code in {"UNREADABLE_IMAGE", "UNSUPPORTED_DOCUMENT", "INSUFFICIENT_INPUT"}:
        result["error_code"] = error_code
    return result


def analyze_veterinary_document(
    image_bytes: bytes,
    *,
    content_type: str,
    user_text: str = "",
    client: OpenAI | None = None,
) -> dict[str, Any]:
    """Analyze a veterinary-document photo and return the exact validated contract."""
    if not image_bytes:
        raise ValueError("image_bytes must not be empty")

    normalized_content_type = content_type.split(";", maxsplit=1)[0].strip().lower()
    if normalized_content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("unsupported image content type")

    image_base64 = base64.b64encode(image_bytes).decode("ascii")
    image_data_url = f"data:{normalized_content_type};base64,{image_base64}"
    normalized_text = user_text.strip()
    context = normalized_text or "Текстовый комментарий отсутствует. Используй только фотографию."

    model_client = client or build_client()
    started = time.perf_counter()
    response = model_client.chat.completions.create(
        model=f"gpt://{FOLDER_ID}/{MODEL_NAME}",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Сначала проанализируй фотографию. Используй следующий текст "
                            "только как вспомогательный источник для незаполненных полей; "
                            f"значения с фотографии имеют приоритет:\n\n{context}"
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=900,
    )

    usage = getattr(response, "usage", None)
    # Never log the document text or the model output: they hold personal data.
    llm_fields = {
        "event": "llm.response",
        "model": MODEL_NAME,
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
        "image_bytes": len(image_bytes),
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "finish_reason": response.choices[0].finish_reason if response.choices else None,
    }
    logger.info("LLM answered", extra=llm_fields)

    try:
        raw_content = checked_message(response).content
        raw_payload = _json_object_from_content(raw_content)
        normalized = _normalize_analysis(raw_payload)
        parsed = VeterinaryDocumentAnalysis.model_validate(normalized)
    except (ValueError, ValidationError, json.JSONDecodeError) as exc:
        logger.warning(
            "LLM answer could not be normalized",
            extra={
                "event": "llm.invalid_answer",
                "errors": exc.error_count() if isinstance(exc, ValidationError) else None,
            },
        )
        raise ValueError("The model returned an invalid veterinary-document analysis") from exc

    return parsed.model_dump(mode="json")
