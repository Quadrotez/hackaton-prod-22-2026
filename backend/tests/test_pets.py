from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    password = "correct-horse-battery-staple"
    registered = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
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
            "sex": "boy",
            "breed": "British Shorthair",
            "birth_date": "2022-05-10",
            "weight_g": 4500,
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
        "sex": "boy",
        "breed": "British Shorthair",
        "birth_date": "2022-05-10",
        "approximate_age_years": None,
        "weight_g": 4500,
        "photo_url": None,
    }
    listed = client.get("/api/v1/pets/", headers=owner_headers)
    assert listed.status_code == 200
    assert [pet["name"] for pet in listed.json()] == ["Milo"]


def test_create_pet_with_weight_creates_initial_history(client: TestClient) -> None:
    headers = auth_headers(client, "initial-weight@example.com")
    created = create_pet(client, headers)

    assert created.status_code == 201
    history = client.get(f"/api/v1/pets/{created.json()['id']}/weight", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["id"] > 0
    assert history.json()[0]["pet_id"] == created.json()["id"]
    assert history.json()[0]["weight_g"] == 4500
    assert history.json()[0]["measured_at"]


def test_patch_weight_creates_history_only_when_changed(client: TestClient) -> None:
    headers = auth_headers(client, "weight-history@example.com")
    pet_id = create_pet(client, headers).json()["id"]

    same = client.patch(f"/api/v1/pets/{pet_id}", headers=headers, json={"weight_g": 4500})
    changed = client.patch(f"/api/v1/pets/{pet_id}", headers=headers, json={"weight_g": 4600})
    no_weight = client.patch(f"/api/v1/pets/{pet_id}", headers=headers, json={"name": "Milo II"})

    assert same.status_code == 200
    assert changed.status_code == 200
    assert no_weight.status_code == 200
    assert no_weight.json()["weight_g"] == 4600

    history = client.get(f"/api/v1/pets/{pet_id}/weight", headers=headers)
    assert [entry["weight_g"] for entry in history.json()] == [4500, 4600]
    assert all("id" in entry for entry in history.json())


def test_weight_history_is_private_and_missing_pet_is_not_found(client: TestClient) -> None:
    owner_headers = auth_headers(client, "weight-owner@example.com")
    other_headers = auth_headers(client, "weight-other@example.com")
    pet_id = create_pet(client, owner_headers).json()["id"]

    assert client.get(f"/api/v1/pets/{pet_id}/weight", headers=other_headers).status_code == 404
    assert client.get("/api/v1/pets/999999/weight", headers=owner_headers).status_code == 404


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
        json={
            "name": "   ",
            "species": "cat",
            "sex": "boy",
            "birth_date": "not-a-date",
            "weight_g": 4500,
        },
    )
    assert invalid.status_code == 422

    pet_id = create_pet(client, headers).json()["id"]
    empty_patch = client.patch(f"/api/v1/pets/{pet_id}", headers=headers, json={})
    assert empty_patch.status_code == 422


def test_create_pet_age_variants(client: TestClient) -> None:
    headers = auth_headers(client, "age-variants@example.com")
    base_payload = {"name": "Milo", "species": "cat", "sex": "boy", "weight_g": 4500}

    exact = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={**base_payload, "birth_date": "2022-05-10"},
    )
    assert exact.status_code == 201
    assert exact.json()["birth_date"] == "2022-05-10"
    assert exact.json()["approximate_age_years"] is None

    approximate = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={**base_payload, "name": "Luna", "approximate_age_years": 3},
    )
    assert approximate.status_code == 201
    assert approximate.json()["birth_date"] is None
    assert approximate.json()["approximate_age_years"] == 3

    unknown = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={**base_payload, "name": "Nova"},
    )
    assert unknown.status_code == 201
    assert unknown.json()["birth_date"] is None
    assert unknown.json()["approximate_age_years"] is None


def test_create_rejects_conflicting_or_out_of_range_age(client: TestClient) -> None:
    headers = auth_headers(client, "invalid-age@example.com")
    base_payload = {"name": "Milo", "species": "cat", "sex": "boy", "weight_g": 4500}

    conflict = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={
            **base_payload,
            "birth_date": "2022-05-10",
            "approximate_age_years": 2,
        },
    )
    assert conflict.status_code == 422
    assert "cannot both be provided" in conflict.text

    for age in (-1, 101):
        response = client.post(
            "/api/v1/pets/",
            headers=headers,
            json={**base_payload, "approximate_age_years": age},
        )
        assert response.status_code == 422


def test_create_accepts_age_boundaries(client: TestClient) -> None:
    headers = auth_headers(client, "age-boundaries@example.com")
    for age in (0, 100):
        response = client.post(
            "/api/v1/pets/",
            headers=headers,
            json={
                "name": f"Pet {age}",
                "species": "cat",
                "sex": "girl",
                "approximate_age_years": age,
                "weight_g": 4500,
            },
        )
        assert response.status_code == 201
        assert response.json()["approximate_age_years"] == age


def test_create_requires_positive_weight(client: TestClient) -> None:
    headers = auth_headers(client, "weight-validation@example.com")
    base_payload = {"name": "Milo", "species": "cat", "sex": "boy"}

    assert client.post("/api/v1/pets/", headers=headers, json=base_payload).status_code == 422
    for weight in (0, -1):
        response = client.post(
            "/api/v1/pets/",
            headers=headers,
            json={**base_payload, "weight_g": weight},
        )
        assert response.status_code == 422

    created = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={**base_payload, "weight_g": 1},
    )
    assert created.status_code == 201
    assert created.json()["weight_g"] == 1


def test_create_requires_valid_sex_and_patch_updates_it(client: TestClient) -> None:
    headers = auth_headers(client, "sex-validation@example.com")
    base_payload = {"name": "Milo", "species": "cat", "weight_g": 4500}

    missing = client.post("/api/v1/pets/", headers=headers, json=base_payload)
    assert missing.status_code == 422

    invalid = client.post(
        "/api/v1/pets/", headers=headers, json={**base_payload, "sex": "unknown"}
    )
    assert invalid.status_code == 422

    boy = client.post(
        "/api/v1/pets/", headers=headers, json={**base_payload, "sex": "boy"}
    )
    assert boy.status_code == 201
    assert boy.json()["sex"] == "boy"

    updated = client.patch(
        f"/api/v1/pets/{boy.json()['id']}", headers=headers, json={"sex": "girl"}
    )
    assert updated.status_code == 200
    assert updated.json()["sex"] == "girl"

    assert (
        client.patch(
            f"/api/v1/pets/{boy.json()['id']}", headers=headers, json={"sex": None}
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/v1/pets/{boy.json()['id']}", headers=headers, json={"sex": "male"}
        ).status_code
        == 422
    )


def test_patch_preserves_and_clears_age_fields(client: TestClient) -> None:
    headers = auth_headers(client, "patch-age@example.com")
    pet_id = create_pet(client, headers).json()["id"]

    unchanged = client.patch(
        f"/api/v1/pets/{pet_id}", headers=headers, json={"weight_g": 4600}
    )
    assert unchanged.status_code == 200
    assert unchanged.json()["birth_date"] == "2022-05-10"
    assert unchanged.json()["approximate_age_years"] is None

    cleared = client.patch(
        f"/api/v1/pets/{pet_id}", headers=headers, json={"birth_date": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["birth_date"] is None


def test_patch_validates_resulting_age_state_and_allows_explicit_transitions(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "patch-transition@example.com")
    pet_id = create_pet(client, headers).json()["id"]

    conflict = client.patch(
        f"/api/v1/pets/{pet_id}",
        headers=headers,
        json={"approximate_age_years": 2},
    )
    assert conflict.status_code == 422
    assert "cannot both be provided" in conflict.text

    to_approximate = client.patch(
        f"/api/v1/pets/{pet_id}",
        headers=headers,
        json={"birth_date": None, "approximate_age_years": 2},
    )
    assert to_approximate.status_code == 200
    assert to_approximate.json()["birth_date"] is None
    assert to_approximate.json()["approximate_age_years"] == 2

    reverse_conflict = client.patch(
        f"/api/v1/pets/{pet_id}",
        headers=headers,
        json={"birth_date": "2023-05-12"},
    )
    assert reverse_conflict.status_code == 422

    to_exact = client.patch(
        f"/api/v1/pets/{pet_id}",
        headers=headers,
        json={"approximate_age_years": None, "birth_date": "2023-05-12"},
    )
    assert to_exact.status_code == 200
    assert to_exact.json()["birth_date"] == "2023-05-12"
    assert to_exact.json()["approximate_age_years"] is None


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
