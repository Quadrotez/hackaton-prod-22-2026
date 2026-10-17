from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

PASSWORD = "correct-horse-battery-staple"
TIMEZONE = ZoneInfo("Europe/Moscow")


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    registration = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": None, "password": PASSWORD},
    )
    assert registration.status_code in (201, 409), registration.json()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.json()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_pet(
    client: TestClient,
    headers: dict[str, str],
    name: str = "Barsik",
    sex: str = "girl",
    species: str = "cat",
) -> int:
    response = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={"name": name, "species": species, "sex": sex, "weight_g": 4600},
    )
    assert response.status_code == 201
    return response.json()["id"]


def pet_url(pet_id: int, path: str) -> str:
    return f"/api/v1/pets/{pet_id}/{path}"


def local_today() -> date:
    return datetime.now(TIMEZONE).date()
