from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    password = "correct-horse-battery-staple"
    registered = client.post(
        "/api/v1/auth/register", json={"email": email, "password": password}
    )
    assert registered.status_code == 201
    logged_in = client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert logged_in.status_code == 200
    return {"Authorization": f"Bearer {logged_in.json()['access_token']}"}


def create_pet(client: TestClient, headers: dict[str, str], name: str = "Milo"):
    return client.post(
        "/api/v1/pets/",
        headers=headers,
        json={
            "name": name,
            "species": "cat",
            "breed": "British Shorthair",
            "birth_date": "2022-05-10",
        },
    )


def image_bytes(image_format: str = "PNG") -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (2, 2), color="blue").save(buffer, format=image_format)
    return buffer.getvalue()


def test_create_and_list_only_current_users_pets(client: TestClient) -> None:
    owner_headers = auth_headers(client, "owner@example.com")
    other_headers = auth_headers(client, "other@example.com")

    created = create_pet(client, owner_headers)
    create_pet(client, other_headers, name="Other pet")

    assert created.status_code == 201
    assert created.json() == {
        "id": created.json()["id"],
        "name": "Milo",
        "species": "cat",
        "breed": "British Shorthair",
        "birth_date": "2022-05-10",
        "photo_url": None,
    }
    listed = client.get("/api/v1/pets/", headers=owner_headers)
    assert listed.status_code == 200
    assert [pet["name"] for pet in listed.json()] == ["Milo"]


def test_retrieve_update_and_delete_pet(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers).json()["id"]

    retrieved = client.get(f"/api/v1/pets/{pet_id}", headers=headers)
    assert retrieved.status_code == 200
    assert retrieved.json()["name"] == "Milo"

    updated = client.patch(
        f"/api/v1/pets/{pet_id}",
        headers=headers,
        json={"name": "Milo II", "breed": None},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Milo II"
    assert updated.json()["breed"] is None

    deleted = client.delete(f"/api/v1/pets/{pet_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/pets/{pet_id}", headers=headers).status_code == 404


def test_user_cannot_access_or_modify_another_users_pet(client: TestClient) -> None:
    owner_headers = auth_headers(client, "owner@example.com")
    other_headers = auth_headers(client, "other@example.com")
    pet_id = create_pet(client, owner_headers).json()["id"]

    assert client.get(f"/api/v1/pets/{pet_id}", headers=other_headers).status_code == 404
    assert (
        client.patch(
            f"/api/v1/pets/{pet_id}", headers=other_headers, json={"name": "Stolen"}
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/pets/{pet_id}", headers=other_headers).status_code == 404
    assert (
        client.post(
            f"/api/v1/pets/{pet_id}/photo",
            headers=other_headers,
            files={"file": ("pet.png", image_bytes(), "image/png")},
        ).status_code
        == 404
    )


def test_upload_valid_image_and_serve_it(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers).json()["id"]

    uploaded = client.post(
        f"/api/v1/pets/{pet_id}/photo",
        headers=headers,
        files={"file": ("untrusted-name.png", image_bytes(), "text/plain")},
    )

    assert uploaded.status_code == 200
    photo_url = uploaded.json()["photo_url"]
    assert photo_url.startswith("/media/pets/")
    assert "untrusted-name" not in photo_url
    assert client.get(photo_url).status_code == 404
    displayed = client.get(f"/api/v1/pets/{pet_id}/photo", headers=headers)
    assert displayed.status_code == 200
    assert displayed.content == image_bytes()

    other_headers = auth_headers(client, "other@example.com")
    assert client.get(f"/api/v1/pets/{pet_id}/photo", headers=other_headers).status_code == 404


def test_validation_rejects_blank_fields_invalid_dates_and_empty_patch(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    invalid = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={"name": "   ", "species": "cat", "birth_date": "not-a-date"},
    )
    assert invalid.status_code == 422

    pet_id = create_pet(client, headers).json()["id"]
    empty_patch = client.patch(f"/api/v1/pets/{pet_id}", headers=headers, json={})
    assert empty_patch.status_code == 422


def test_reject_invalid_and_oversized_uploads(client: TestClient, monkeypatch) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers).json()["id"]

    invalid = client.post(
        f"/api/v1/pets/{pet_id}/photo",
        headers=headers,
        files={"file": ("fake.png", b"not an image", "image/png")},
    )
    assert invalid.status_code == 415

    from app.api.v1 import pets

    original_init = pets.LocalMediaStorage.__init__

    def limited_init(self, media_dir: Path, max_file_size: int) -> None:
        original_init(self, media_dir, 10)

    monkeypatch.setattr(pets.LocalMediaStorage, "__init__", limited_init)
    oversized = client.post(
        f"/api/v1/pets/{pet_id}/photo",
        headers=headers,
        files={"file": ("large.png", image_bytes(), "image/png")},
    )
    assert oversized.status_code == 413
    assert client.get(f"/api/v1/pets/{pet_id}", headers=headers).json()["photo_url"] is None


def test_failed_database_update_removes_new_file_and_keeps_old_file(client: TestClient, monkeypatch) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers).json()["id"]
    first = client.post(
        f"/api/v1/pets/{pet_id}/photo",
        headers=headers,
        files={"file": ("first.png", image_bytes(), "image/png")},
    )
    old_url = first.json()["photo_url"]

    original_commit = Session.commit
    calls = 0

    def fail_second_commit(self):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("simulated database failure")
        return original_commit(self)

    monkeypatch.setattr(Session, "commit", fail_second_commit)
    calls = 1
    second = client.post(
        f"/api/v1/pets/{pet_id}/photo",
        headers=headers,
        files={"file": ("second.png", image_bytes("JPEG"), "image/jpeg")},
    )
    assert second.status_code == 500
    assert client.get(f"/api/v1/pets/{pet_id}", headers=headers).json()["photo_url"] == old_url
    assert client.get(f"/api/v1/pets/{pet_id}/photo", headers=headers).status_code == 200


def test_existing_auth_and_health_endpoints_remain_available(client: TestClient) -> None:
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    headers = auth_headers(client, "owner@example.com")
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200
