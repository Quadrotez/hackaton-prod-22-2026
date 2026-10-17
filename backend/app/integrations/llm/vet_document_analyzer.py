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

SYSTEM_PROMPT = """
Ты — AI-анализатор ветеринарных документов приложения PetCare.

На вход ты получаешь фотографию ветеринарного документа и обязательный текст
пользователя о конкретном животном. Извлеки ровно четыре значения:

- `animal_name` — имя животного;
- `visit_date` — дата ветеринарного приёма в формате `YYYY-MM-DD`;
- `visit_reason` — явно указанная причина обращения;
- `visit_price` — стоимость именно ветеринарного приёма как JSON-число.

Фотография и текст пользователя — два источника для заполнения одного результата.
Если значение нельзя достоверно определить, верни для него JSON `null`. Не путай
имя животного с именами владельца или врача. Не подменяй причину обращения
диагнозом. Не используй общую сумму чека, стоимость лекарств, анализов или процедур
как стоимость приёма. Не ставь диагнозы, не назначай лечение и ничего не выдумывай.

Верни исключительно один валидный JSON-объект ровно с четырьмя ключами:
{
  "animal_name": null,
  "visit_date": null,
  "visit_reason": null,
  "visit_price": null
}

Все четыре ключа обязательны. Дополнительные ключи, вложенные объекты, массивы,
Markdown и любой текст вне JSON запрещены.
""".strip()


def analyze_veterinary_document(
    image_bytes: bytes,
    *,
    content_type: str,
    user_text: str,
    client: OpenAI | None = None,
) -> dict[str, Any]:
    """Analyze a validated image and strictly validate the model's four-field JSON."""
    if not image_bytes:
        raise ValueError("image_bytes must not be empty")

    normalized_text = user_text.strip()
    if not normalized_text:
        raise ValueError("user_text must not be blank")

    normalized_content_type = content_type.split(";", maxsplit=1)[0].strip().lower()
    image_base64 = base64.b64encode(image_bytes).decode("ascii")
    image_data_url = f"data:{normalized_content_type};base64,{image_base64}"

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
                            "Проанализируй фотографию с учётом обязательного описания "
                            f"пользователя о животном:\n\n{normalized_text}"
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=500,
    )

    raw_content = checked_message(response).content
    try:
        parsed = VeterinaryDocumentAnalysis.model_validate_json(raw_content)
    except ValidationError as exc:
        raise ValueError(
            "The model response must contain exactly animal_name, visit_date, "
            "visit_reason, and visit_price"
        ) from exc

    return parsed.model_dump(mode="json")
