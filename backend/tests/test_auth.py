from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import ALGORITHM
from app.models.user import User


EMAIL = "owner@example.com"
PASSWORD = "correct-horse-battery-staple"


def register(client: TestClient, email: str = EMAIL, password: str = PASSWORD):
    return client.post("/api/v1/auth/register", json={"email": email, "password": password})


def login(client: TestClient, email: str = EMAIL, password: str = PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_registration_hashes_password_and_rejects_duplicate_email(
    client: TestClient, db: Session
) -> None:
    response = register(client, email="  OWNER@Example.COM ")

    assert response.status_code == 201
    assert response.json()["email"] == EMAIL
    assert "password" not in response.json()
    assert "password_hash" not in response.json()

    user = db.scalar(select(User).where(User.email == EMAIL))
    assert user is not None
    assert user.password_hash != PASSWORD
    assert user.password_hash.startswith("$argon2id$")

    duplicate = register(client, email="Owner@Example.com")
    assert duplicate.status_code == 409


def test_login_success_and_incorrect_password_rejection(client: TestClient) -> None:
    register(client)

    response = login(client)
    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]

    incorrect = login(client, password="incorrect-password")
    assert incorrect.status_code == 401
    assert incorrect.headers["www-authenticate"] == "Bearer"


def test_me_returns_public_user_for_valid_token(client: TestClient) -> None:
    registered = register(client)
    token = login(client).json()["access_token"]

    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["id"] == registered.json()["id"]
    assert response.json()["email"] == EMAIL
    assert "password_hash" not in response.json()


def test_me_rejects_missing_invalid_and_expired_tokens(client: TestClient) -> None:
    missing = client.get("/api/v1/auth/me")
    assert missing.status_code == 401
    assert missing.headers["www-authenticate"] == "Bearer"

    invalid = client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-valid-token"}
    )
    assert invalid.status_code == 401

    settings = get_settings()
    expired_token = jwt.encode(
        {"sub": "1", "exp": datetime.now(UTC) - timedelta(minutes=1)},
        settings.jwt_secret_key,
        algorithm=ALGORITHM,
    )
    expired = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert expired.status_code == 401
    assert expired.headers["www-authenticate"] == "Bearer"


def test_health_endpoint_remains_available(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
