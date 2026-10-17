from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.feeding import FeedingRecord


PASSWORD = "correct-horse-battery-staple"


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    assert client.post(
        "/api/v1/auth/register", json={"email": email, "password": PASSWORD}
    ).status_code == 201
    response = client.post(
        "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_pet(client: TestClient, headers: dict[str, str], name: str = "Milo") -> int:
    response = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={"name": name, "species": "cat", "sex": "boy", "weight_g": 4500},
    )
    assert response.status_code == 201
    return response.json()["id"]


def feeding_url(pet_id: int) -> str:
    return f"/api/v1/pets/{pet_id}/feeding-records"


def create_record(
    client: TestClient,
    headers: dict[str, str],
    pet_id: int,
    *,
    food_name: str = "Royal Canin Kitten",
    fed_at: str = "2026-10-15T12:00:00Z",
    liked: bool | None = True,
    tolerated: bool | None = True,
    include_liked: bool = True,
    include_tolerated: bool = True,
    reaction_notes: str | None = None,
    notes: str | None = None,
):
    payload: dict[str, object] = {
        "food_name": food_name,
        "fed_at": fed_at,
        "reaction_notes": reaction_notes,
        "notes": notes,
    }
    if include_liked:
        payload["liked"] = liked
    if include_tolerated:
        payload["tolerated"] = tolerated
    return client.post(feeding_url(pet_id), headers=headers, json=payload)


def test_new_food_requires_both_ratings_and_rejects_blank_name(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)

    for payload in (
        {"food_name": "New Food", "fed_at": "2026-10-15T12:00:00Z"},
        {
            "food_name": "New Food",
            "fed_at": "2026-10-15T12:00:00Z",
            "liked": False,
        },
        {
            "food_name": "   ",
            "fed_at": "2026-10-15T12:00:00Z",
            "liked": True,
            "tolerated": True,
        },
    ):
        response = client.post(feeding_url(pet_id), headers=headers, json=payload)
        assert response.status_code == 422


def test_new_food_accepts_false_and_persists_complete_record(
    client: TestClient, db: Session
) -> None:
    headers = auth_headers(client, "false@example.com")
    pet_id = create_pet(client, headers)
    response = create_record(
        client,
        headers,
        pet_id,
        food_name="  New   Food  ",
        liked=False,
        tolerated=False,
        reaction_notes="Upset stomach",
        notes="Small portion",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["food_name"] == "New Food"
    assert body["liked"] is False
    assert body["tolerated"] is False
    assert body["reaction_notes"] == "Upset stomach"
    assert body["notes"] == "Small portion"
    assert body["pet_id"] == pet_id
    assert body["created_at"]
    stored = db.get(FeedingRecord, body["id"])
    assert stored is not None
    assert stored.liked is False
    assert stored.tolerated is False


def test_repeat_food_defaults_each_omitted_rating_and_preserves_history(
    client: TestClient, db: Session
) -> None:
    headers = auth_headers(client, "defaults@example.com")
    pet_id = create_pet(client, headers)
    original = create_record(client, headers, pet_id, liked=True, tolerated=False)
    original_body = original.json()

    both_defaulted = create_record(
        client,
        headers,
        pet_id,
        food_name="  royal   CANIN kitten ",
        fed_at="2026-10-16T12:00:00Z",
        include_liked=False,
        include_tolerated=False,
    )
    liked_overridden = create_record(
        client,
        headers,
        pet_id,
        fed_at="2026-10-17T12:00:00Z",
        liked=False,
        include_tolerated=False,
    )
    tolerated_overridden = create_record(
        client,
        headers,
        pet_id,
        fed_at="2026-10-18T12:00:00Z",
        include_liked=False,
        tolerated=True,
    )
    both_overridden = create_record(
        client,
        headers,
        pet_id,
        fed_at="2026-10-19T12:00:00Z",
        liked=True,
        tolerated=False,
    )

    assert both_defaulted.status_code == 201
    assert (both_defaulted.json()["liked"], both_defaulted.json()["tolerated"]) == (
        True,
        False,
    )
    assert (liked_overridden.json()["liked"], liked_overridden.json()["tolerated"]) == (
        False,
        False,
    )
    assert (
        tolerated_overridden.json()["liked"],
        tolerated_overridden.json()["tolerated"],
    ) == (False, True)
    assert (both_overridden.json()["liked"], both_overridden.json()["tolerated"]) == (
        True,
        False,
    )
    db.expire_all()
    stored_original = db.get(FeedingRecord, original_body["id"])
    assert stored_original is not None
    assert (stored_original.liked, stored_original.tolerated) == (True, False)
    assert db.scalar(select(func.count()).select_from(FeedingRecord)) == 5


def test_latest_match_uses_fed_at_then_created_at_then_id(client: TestClient) -> None:
    headers = auth_headers(client, "latest@example.com")
    pet_id = create_pet(client, headers)
    create_record(
        client,
        headers,
        pet_id,
        fed_at="2026-10-20T12:00:00Z",
        liked=True,
        tolerated=True,
    )
    create_record(
        client,
        headers,
        pet_id,
        fed_at="2026-10-19T12:00:00Z",
        liked=False,
        tolerated=False,
    )
    latest_same_fed_at = create_record(
        client,
        headers,
        pet_id,
        fed_at="2026-10-20T12:00:00Z",
        liked=False,
        tolerated=True,
    )
    assert latest_same_fed_at.status_code == 201

    defaulted = create_record(
        client,
        headers,
        pet_id,
        fed_at="2026-10-21T12:00:00Z",
        include_liked=False,
        include_tolerated=False,
    )
    assert defaulted.status_code == 201
    assert (defaulted.json()["liked"], defaulted.json()["tolerated"]) == (False, True)


def test_food_history_is_isolated_per_pet_and_owner(client: TestClient) -> None:
    owner_headers = auth_headers(client, "owner@example.com")
    other_headers = auth_headers(client, "other@example.com")
    first_pet = create_pet(client, owner_headers, "First")
    second_pet = create_pet(client, owner_headers, "Second")
    foreign_pet = create_pet(client, other_headers, "Foreign")
    first_record = create_record(
        client, owner_headers, first_pet, liked=True, tolerated=False
    ).json()

    second_without_ratings = create_record(
        client,
        owner_headers,
        second_pet,
        include_liked=False,
        include_tolerated=False,
    )
    assert second_without_ratings.status_code == 422

    for method, path, kwargs in (
        ("get", feeding_url(foreign_pet), {}),
        ("post", feeding_url(foreign_pet), {"json": {"food_name": "X", "fed_at": "2026-10-15T12:00:00Z", "liked": True, "tolerated": True}}),
        ("get", f"{feeding_url(foreign_pet)}/suggestions?food_name=X", {}),
        ("get", f"{feeding_url(foreign_pet)}/{first_record['id']}", {}),
        ("patch", f"{feeding_url(foreign_pet)}/{first_record['id']}", {"json": {"liked": False}}),
        ("delete", f"{feeding_url(foreign_pet)}/{first_record['id']}", {}),
    ):
        response = getattr(client, method)(path, headers=owner_headers, **kwargs)
        assert response.status_code == 404


def test_suggestions_for_new_and_known_food_are_read_only(
    client: TestClient, db: Session
) -> None:
    headers = auth_headers(client, "suggestions@example.com")
    pet_id = create_pet(client, headers)
    new_response = client.get(
        f"{feeding_url(pet_id)}/suggestions",
        headers=headers,
        params={"food_name": " New Food "},
    )
    assert new_response.status_code == 200
    assert new_response.json() == {
        "food_name": "New Food",
        "previously_tried": False,
        "suggested_values": None,
    }

    create_record(client, headers, pet_id, liked=False, tolerated=True)
    before = db.scalar(select(func.count()).select_from(FeedingRecord))
    known_response = client.get(
        f"{feeding_url(pet_id)}/suggestions",
        headers=headers,
        params={"food_name": " royal  CANIN kitten "},
    )
    after = db.scalar(select(func.count()).select_from(FeedingRecord))
    assert known_response.status_code == 200
    assert known_response.json()["previously_tried"] is True
    assert known_response.json()["suggested_values"] == {
        "liked": False,
        "tolerated": True,
    }
    assert before == after == 1


def test_list_and_get_return_only_requested_pet_in_stable_order(client: TestClient) -> None:
    headers = auth_headers(client, "read@example.com")
    first_pet = create_pet(client, headers, "First")
    second_pet = create_pet(client, headers, "Second")
    older = create_record(
        client, headers, first_pet, food_name="Older", fed_at="2026-10-10T12:00:00Z"
    ).json()
    newer = create_record(
        client, headers, first_pet, food_name="Newer", fed_at="2026-10-11T12:00:00Z"
    ).json()
    foreign_record = create_record(client, headers, second_pet, food_name="Other").json()

    listed = client.get(feeding_url(first_pet), headers=headers)
    assert listed.status_code == 200
    assert [record["id"] for record in listed.json()] == [newer["id"], older["id"]]
    retrieved = client.get(f"{feeding_url(first_pet)}/{older['id']}", headers=headers)
    assert retrieved.status_code == 200
    assert retrieved.json()["food_name"] == "Older"
    assert (
        client.get(f"{feeding_url(first_pet)}/{foreign_record['id']}", headers=headers).status_code
        == 404
    )


def test_patch_updates_only_supplied_fields_supports_false_and_clearing_notes(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "patch@example.com")
    pet_id = create_pet(client, headers)
    record = create_record(
        client,
        headers,
        pet_id,
        liked=True,
        tolerated=True,
        reaction_notes="Rash",
        notes="Observed",
    ).json()

    patched = client.patch(
        f"{feeding_url(pet_id)}/{record['id']}",
        headers=headers,
        json={"liked": False, "tolerated": False, "notes": None, "reaction_notes": None},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["liked"] is False
    assert body["tolerated"] is False
    assert body["notes"] is None
    assert body["reaction_notes"] is None
    assert body["food_name"] == record["food_name"]
    assert body["fed_at"] == record["fed_at"]

    renamed = client.patch(
        f"{feeding_url(pet_id)}/{record['id']}",
        headers=headers,
        json={"food_name": "  Renamed   Food  "},
    )
    assert renamed.status_code == 200
    assert renamed.json()["food_name"] == "Renamed Food"


def test_patch_validation_rejects_empty_null_and_blank_required_fields(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "patch-validation@example.com")
    pet_id = create_pet(client, headers)
    record_id = create_record(client, headers, pet_id).json()["id"]
    url = f"{feeding_url(pet_id)}/{record_id}"

    for payload in ({}, {"liked": None}, {"tolerated": None}, {"fed_at": None}, {"food_name": None}, {"food_name": "  "}):
        response = client.patch(url, headers=headers, json=payload)
        assert response.status_code == 422


def test_delete_removes_only_selected_record_and_pet_delete_cascades(
    client: TestClient, db: Session
) -> None:
    headers = auth_headers(client, "delete@example.com")
    pet_id = create_pet(client, headers)
    first = create_record(client, headers, pet_id, fed_at="2026-10-10T12:00:00Z").json()
    second = create_record(client, headers, pet_id, fed_at="2026-10-11T12:00:00Z").json()

    deleted = client.delete(f"{feeding_url(pet_id)}/{first['id']}", headers=headers)
    assert deleted.status_code == 204
    assert db.get(FeedingRecord, first["id"]) is None
    assert db.get(FeedingRecord, second["id"]) is not None

    assert client.delete(f"/api/v1/pets/{pet_id}", headers=headers).status_code == 204
    db.expire_all()
    assert db.get(FeedingRecord, second["id"]) is None


def test_openapi_documents_feeding_endpoints_and_conditional_ratings(
    client: TestClient,
) -> None:
    schema = client.get("/openapi.json").json()
    base_path = "/api/v1/pets/{pet_id}/feeding-records"
    assert {"get", "post"}.issubset(schema["paths"][base_path])
    assert "get" in schema["paths"][f"{base_path}/suggestions"]
    assert {"get", "patch", "delete"}.issubset(
        schema["paths"][f"{base_path}/{{record_id}}"]
    )
    create_schema = schema["components"]["schemas"]["FeedingRecordCreate"]
    assert set(create_schema["required"]) == {"food_name", "fed_at"}
    assert "conditionally required" in create_schema["description"]
    public_schema = schema["components"]["schemas"]["FeedingRecordPublic"]
    assert public_schema["properties"]["liked"]["type"] == "boolean"
    assert public_schema["properties"]["tolerated"]["type"] == "boolean"
