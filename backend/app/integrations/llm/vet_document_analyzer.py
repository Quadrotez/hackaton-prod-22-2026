from __future__ import annotations

import base64
import os
from typing import Any

from openai import OpenAI
from pydantic import ValidationError

from app.integrations.llm.client import FOLDER_ID, build_client
from app.integrations.llm.response import checked_message
from app.schemas.vet_documents import VeterinaryDocumentAnalysis


MODEL_NAME = os.getenv("YANDEX_MODEL", "deepseek-v4.1-flash")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

SYSTEM_PROMPT = """
Ты — AI-анализатор фотографий ветеринарных документов приложения PetCare.

Твоя задача — извлечь из фотографии ровно шесть полей:
- animal_name — имя животного;
- visit_date — дата ветеринарного приёма в формате YYYY-MM-DD;
- visit_reason — явно указанная причина обращения, цель визита или жалоба;
- visit_price — стоимость именно ветеринарного приёма как JSON-число;
- veterinarian_name — имя ветеринарного врача;
- dentistry — информация о стоматологической услуге или стоматологическом обращении. Если в источнике нет такой информации, значение null.

ФОТОГРАФИЯ — главный и приоритетный источник данных. Сначала внимательно прочитай
фотографию, включая мелкий текст, таблицы, чеки и подписи. Затем используй текст пользователя
только для заполнения тех полей, которые остались null после анализа фотографии. Если
фотография и текст содержат разные значения, сохраняй значение с фотографии, не заменяй его
данными пользователя и добавляй предупреждение. Если фотография не содержит полезной
информации, заполни итоговые поля из текста, когда это возможно, но оставь status равным
error, поскольку status определяется исключительно по фотографии.

Не путай имя животного с именем владельца или врача. Не подменяй причину обращения
диагнозом, результатом анализа или назначением. Не используй общую сумму чека,
стоимость лекарств, анализов, процедур или сумму нескольких услуг как visit_price.
Не ставь диагнозы, не назначай лечение и ничего не выдумывай. Если значение нельзя
достоверно определить, верни null.

Нормализуй дату строго в YYYY-MM-DD. Стоимость возвращай числом, не строкой; 0 —
допустимое значение и не является null.
Определи document_type исключительно по фотографии; для обычного ветеринарного отчёта
используй "veterinary_report", для чека — "veterinary_receipt", а если фотография не
содержит ветеринарного документа, верни null.

Определи status исключительно по фотографии, до подстановки значений из текста пользователя:
- success — на фотографии найдены все шесть полей;
- partial — на фотографии найдено хотя бы одно, но не все шесть полей;
- error — на фотографии не найдено ни одного из шести полей.
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
  "animal_name": null,
  "visit_date": null,
  "visit_reason": null,
  "visit_price": null,
  "veterinarian_name": null,
  "dentistry": null,
  "warnings": [],
  "error_code": null
}

Верхний уровень обязан содержать ровно ключи status, document_type, animal_name, visit_date,
visit_reason, visit_price, veterinarian_name, dentistry, warnings и error_code. Все шесть
значений должны находиться непосредственно в корне JSON. Не добавляй extracted_data или
user_provided_data. Отсутствующие значения должны быть JSON null.

Пример: если на фотографии не найден ветеринарный документ, но в тексте явно указаны имя
«Лайка», дата «15 октября 2026 года», причина «Плановый осмотр», стоимость 2500 и врач
«Иванов», верни status "error", document_type null, эти значения в корне JSON, dentistry
null, предупреждение «На фотографии не обнаружено полезной информации. Данные заполнены из
текста.» и error_code "UNSUPPORTED_DOCUMENT".

Если на фотографии найдены имя «Бим», дата, причина, стоимость и врач, а в тексте указано
другое имя «Лайка», верни имя «Бим» и остальные значения с фотографии; текст может заполнить
только поля, которые остались null. Если стоматологической информации нет, dentistry равно
null.
""".strip()


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

    raw_content = checked_message(response).content
    try:
        parsed = VeterinaryDocumentAnalysis.model_validate_json(raw_content)
    except ValidationError as exc:
        raise ValueError(
            "The model returned an invalid veterinary-document analysis"
        ) from exc

    return parsed.model_dump(mode="json")
