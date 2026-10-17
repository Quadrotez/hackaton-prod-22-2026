
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

FOLDER_ID = os.getenv("YANDEX_FOLDER_ID", "")


def build_client() -> OpenAI:
    api_key = os.getenv("YANDEX_API_KEY", "")

    if not api_key or not FOLDER_ID:
        raise RuntimeError(
            "Заполните YANDEX_API_KEY и YANDEX_FOLDER_ID в .env"
        )

    return OpenAI(
        api_key=api_key,
        project=FOLDER_ID,
        base_url="https://ai.api.cloud.yandex.net/v1",
        timeout=30,
        max_retries=1,
    )
