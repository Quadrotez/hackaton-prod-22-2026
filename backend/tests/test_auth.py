from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import dependencies
from app.core.config import get_settings
from app.core.security import ALGORITHM
from app.models.user import User


EMAIL = "owner@example.com"
PASSWORD = "correct-horse-battery-staple"


def register(
    client: TestClient,
    email: str = EMAIL,
    name: str | None = None,
    password: str = PASSWORD,
):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": name, "password": password},
    )


def login(
    client: TestClient,
    email: str = EMAIL,
    password: str = PASSWORD,
):
    return client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )


def test_registration_hashes_password_and_rejects_duplicate_email(
    client: TestClient, db: Session
) -> None:
    response = register(client, email="  OWNER@Example.COM ", name=" Петр Лукьянов ")

    assert response.status_code == 201
    assert response.json()["email"] == EMAIL
    assert response.json()["name"] == "Петр Лукьянов"
    assert response.json()["avatar_url"] is None
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


def test_login_rejects_non_email(client: TestClient) -> None:
    response = login(client, email="PET_OWNER")
    assert response.status_code == 422


def test_login_auto_registers_unknown_email(client: TestClient, db: Session) -> None:
    email = "brand-new@example.com"

    response = login(client, email=email, password="whatever")

    assert response.status_code == 200
    assert response.json()["access_token"]

    user = db.scalar(select(User).where(User.email == email))
    assert user is not None
    assert user.password_hash != "whatever"


def test_me_returns_public_user_for_valid_token(client: TestClient) -> None:
    registered = register(client)
    token = login(client).json()["access_token"]

    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["id"] == registered.json()["id"]
    assert response.json()["email"] == EMAIL
    assert response.json()["name"] is None
    assert response.json()["avatar_url"] is None
    assert "password_hash" not in response.json()


def test_avatar_upload_and_replacement(client: TestClient) -> None:
    register(client)
    token = login(client).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    first = client.post(
        "/api/v1/auth/me/avatar",
        headers=headers,
        files={"file": ("avatar.png", b"not-an-image", "image/png")},
    )
    assert first.status_code == 415

    from io import BytesIO

    from PIL import Image

    image = Image.new("RGB", (2, 2), color="blue")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    uploaded = client.post(
        "/api/v1/auth/me/avatar",
        headers=headers,
        files={"file": ("avatar.png", buffer.getvalue(), "image/png")},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["avatar_url"].startswith("/media/avatars/")

    avatar = client.get("/api/v1/auth/me/avatar", headers=headers)
    assert avatar.status_code == 200
    assert avatar.headers["content-type"] == "image/png"


def test_me_rejects_missing_invalid_and_expired_tokens(client: TestClient) -> None:
    missing = client.get("/api/v1/auth/me")
    assert missing.status_code == 401
    assert missing.headers["www-authenticate"] == "Bearer"

    for endpoint in ("/api/v1/auth/me", "/api/v1/pets/"):
        for token in ("not-a-valid-token", "abc123random"):
            invalid = client.get(
                endpoint, headers={"Authorization": f"Bearer {token}"}
            )
            assert invalid.status_code == 401
            assert invalid.json() == {"detail": "Could not validate credentials"}
            assert invalid.headers["www-authenticate"] == "Bearer"

        non_ascii = client.get(
            endpoint,
            headers={b"authorization": "Bearer нещщн".encode("utf-8")},
        )
        assert non_ascii.status_code == 401
        assert non_ascii.json() == {"detail": "Could not validate credentials"}
        assert non_ascii.headers["www-authenticate"] == "Bearer"

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


@pytest.mark.parametrize("token_error", [TypeError("invalid token"), UnicodeError("invalid token")])
def test_me_converts_token_parser_errors_to_unauthorized(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, token_error: Exception
) -> None:
    def fail_to_decode(*args: object, **kwargs: object) -> dict[str, object]:
        raise token_error

    monkeypatch.setattr(dependencies, "decode_access_token", fail_to_decode)

    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer malformed-token"}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Could not validate credentials"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_swagger_sanitizes_non_ascii_authorization_before_fetch(client: TestClient) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    assert '"requestInterceptor": request =>' in response.text
    assert "/[^\\x00-\\x7F]/.test(authorization)" in response.text
    assert 'headers[authorizationKey] = "Bearer invalid-non-ascii-token"' in response.text
    assert "__petcare_request_interceptor__" not in response.text


def test_health_endpoint_remains_available(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
