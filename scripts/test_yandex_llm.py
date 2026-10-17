"""Minimal live smoke test for the configured Yandex AI Studio model."""

from __future__ import annotations

import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.integrations.llm.client import FOLDER_ID, build_client
from app.integrations.llm.vet_document_analyzer import MODEL_NAME


def main() -> None:
    client = build_client()
    response = client.chat.completions.create(
        model=f"gpt://{FOLDER_ID}/{MODEL_NAME}",
        messages=[
            {
                "role": "user",
                "content": "Ответь одним коротким предложением: работает ли модель?",
            }
        ],
        temperature=0,
        max_tokens=100,
    )

    if not response.choices:
        raise RuntimeError("Модель не вернула вариантов ответа")

    message = response.choices[0].message
    print(json.dumps({
        "model": response.model,
        "finish_reason": response.choices[0].finish_reason,
        "content": message.content,
        "refusal": message.refusal,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
