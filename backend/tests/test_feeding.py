
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.feeding import FeedingRecord
from app.models.food import Food

PASSWORD = "correct-horse-battery-staple"


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    assert client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD},
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


def food_payload(name: str = "Catalog Chicken") -> dict[str, object]:
    return {
        "name": name,
        "description": "Complete dry food",
        "type": "dry",
        "protein": 30.5,
        "fats": 15,
        "carbohydrates": 40,
        "calories": 380,
        "total_grams": 5000,
    }


def create_food(client: TestClient, headers: dict[str, str], name: str = "Catalog Chicken") -> int:
    response = client.post("/api/v1/foods", headers=headers, json=food_payload(name))
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
        (
            "post",
            feeding_url(foreign_pet),
            {"json": {"food_name": "X", "fed_at": "2026-10-15T12:00:00Z", "liked": True, "tolerated": True}},
        ),
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


def test_catalog_food_link_preserves_first_time_rating_rule(client: TestClient, db: Session) -> None:
    headers = auth_headers(client, "catalog-feeding@example.com")
    pet_id = create_pet(client, headers)
    food_id = create_food(client, headers)

    missing_ratings = client.post(
        feeding_url(pet_id),
        headers=headers,
        json={"food_id": food_id, "amount_grams": 50, "fed_at": "2026-10-15T12:00:00Z"},
    )
    assert missing_ratings.status_code == 422

    first = client.post(
        feeding_url(pet_id),
        headers=headers,
        json={
            "food_id": food_id,
            "amount_grams": 50,
            "fed_at": "2026-10-15T12:00:00Z",
            "liked": False,
            "tolerated": True,
        },
    )
    assert first.status_code == 201
    assert first.json()["food_id"] == food_id
    assert first.json()["food_name"] == "Catalog Chicken"

    repeated = client.post(
        feeding_url(pet_id),
        headers=headers,
        json={"food_id": food_id, "amount_grams": 50, "fed_at": "2026-10-16T12:00:00Z"},
    )
    assert repeated.status_code == 201
    assert (repeated.json()["liked"], repeated.json()["tolerated"]) == (False, True)
    assert db.get(Food, food_id) is not None


def test_catalog_food_is_owned_and_delete_unlinks_history(client: TestClient, db: Session) -> None:
    owner_headers = auth_headers(client, "catalog-owner@example.com")
    other_headers = auth_headers(client, "catalog-other@example.com")
    pet_id = create_pet(client, owner_headers)
    food_id = create_food(client, owner_headers)
    record = client.post(
        feeding_url(pet_id),
        headers=owner_headers,
        json={
            "food_id": food_id,
            "amount_grams": 50,
            "fed_at": "2026-10-15T12:00:00Z",
            "liked": True,
            "tolerated": True,
        },
    ).json()

    assert client.post(
        feeding_url(pet_id),
        headers=other_headers,
        json={
            "food_id": food_id,
            "amount_grams": 50,
            "fed_at": "2026-10-15T12:00:00Z",
            "liked": True,
            "tolerated": True,
        },
    ).status_code == 404

    assert client.delete(f"/api/v1/foods/{food_id}", headers=owner_headers).status_code == 204
    db.expire_all()
    stored = db.get(FeedingRecord, record["id"])
    assert stored is not None
    assert stored.food_id is None
    assert stored.food_name == "Catalog Chicken"


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

    invalid_payloads = (
        {},
        {"liked": None},
        {"tolerated": None},
        {"fed_at": None},
        {"food_name": None},
        {"food_name": "  "},
    )
    for payload in invalid_payloads:
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


def feed_catalog_food(
    client: TestClient,
    headers: dict[str, str],
    pet_id: int,
    food_id: int,
    amount_grams: int,
    fed_at: str = "2026-10-15T12:00:00Z",
):
    return client.post(
        feeding_url(pet_id),
        headers=headers,
        json={
            "food_id": food_id,
            "amount_grams": amount_grams,
            "fed_at": fed_at,
            "liked": True,
            "tolerated": True,
        },
    )


def create_small_food(client: TestClient, headers: dict[str, str], grams: int) -> int:
    response = client.post(
        "/api/v1/foods",
        headers=headers,
        json={**food_payload("Small Pack"), "total_grams": grams},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_catalog_feeding_requires_amount_grams(client: TestClient) -> None:
    headers = auth_headers(client, "amount-required@example.com")
    pet_id = create_pet(client, headers)
    food_id = create_food(client, headers)

    for amount in (None, 0, -5):
        payload: dict[str, object] = {
            "food_id": food_id,
            "fed_at": "2026-10-15T12:00:00Z",
            "liked": True,
            "tolerated": True,
        }
        if amount is not None:
            payload["amount_grams"] = amount
        assert client.post(feeding_url(pet_id), headers=headers, json=payload).status_code == 422


def test_catalog_feeding_deducts_stock_and_reports_it(client: TestClient) -> None:
    headers = auth_headers(client, "deduct@example.com")
    pet_id = create_pet(client, headers)
    food_id = create_food(client, headers)

    response = feed_catalog_food(client, headers, pet_id, food_id, 120)

    assert response.status_code == 201
    body = response.json()
    assert body["amount_grams"] == 120
    assert body["out_of_stock"] is False
    assert body["stock"] == {"food_id": food_id, "remaining_grams": 4880, "out_of_stock": False}
    food = client.get(f"/api/v1/foods/{food_id}", headers=headers).json()
    assert food["remaining_grams"] == 4880
    assert food["out_of_stock"] is False


def test_feeding_that_uses_last_grams_sets_out_of_stock_flag(client: TestClient) -> None:
    headers = auth_headers(client, "last-grams@example.com")
    pet_id = create_pet(client, headers)
    food_id = create_small_food(client, headers, 100)

    response = feed_catalog_food(client, headers, pet_id, food_id, 100)

    assert response.status_code == 201
    assert response.json()["out_of_stock"] is True
    assert response.json()["stock"]["remaining_grams"] == 0
    assert response.json()["stock"]["out_of_stock"] is True
    assert client.get(f"/api/v1/foods/{food_id}", headers=headers).json()["out_of_stock"] is True


def test_feeding_returns_409_when_food_ran_out_and_creates_nothing(
    client: TestClient, db: Session
) -> None:
    headers = auth_headers(client, "ran-out@example.com")
    pet_id = create_pet(client, headers)
    food_id = create_small_food(client, headers, 100)
    assert feed_catalog_food(client, headers, pet_id, food_id, 100).status_code == 201

    response = feed_catalog_food(client, headers, pet_id, food_id, 30, "2026-10-16T12:00:00Z")

    assert response.status_code == 409
    assert response.json() == {
        "code": "food_out_of_stock",
        "message": "Food has run out",
        "food_id": food_id,
        "food_name": "Small Pack",
        "requested_grams": 30,
        "remaining_grams": 0,
        "out_of_stock": True,
    }
    assert db.scalar(select(func.count()).select_from(FeedingRecord)) == 1


def test_feeding_returns_409_when_stock_is_insufficient_and_keeps_stock(
    client: TestClient, db: Session
) -> None:
    headers = auth_headers(client, "insufficient@example.com")
    pet_id = create_pet(client, headers)
    food_id = create_small_food(client, headers, 100)
    assert feed_catalog_food(client, headers, pet_id, food_id, 60).status_code == 201

    response = feed_catalog_food(client, headers, pet_id, food_id, 50, "2026-10-16T12:00:00Z")

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "food_out_of_stock"
    assert body["remaining_grams"] == 40
    assert body["requested_grams"] == 50
    assert body["out_of_stock"] is False
    assert client.get(f"/api/v1/foods/{food_id}", headers=headers).json()["remaining_grams"] == 40
    assert db.scalar(select(func.count()).select_from(FeedingRecord)) == 1


def test_legacy_food_name_feeding_does_not_touch_stock(client: TestClient) -> None:
    headers = auth_headers(client, "legacy-stock@example.com")
    pet_id = create_pet(client, headers)
    food_id = create_food(client, headers)

    response = create_record(client, headers, pet_id)

    assert response.status_code == 201
    assert response.json()["amount_grams"] is None
    assert response.json()["stock"] is None
    assert response.json()["out_of_stock"] is False
    assert client.get(f"/api/v1/foods/{food_id}", headers=headers).json()["remaining_grams"] == 5000


def test_openapi_documents_out_of_stock_response(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    post = schema["paths"]["/api/v1/pets/{pet_id}/feeding-records"]["post"]
    conflict = post["responses"]["409"]
    assert (
        conflict["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/FoodOutOfStockError"
    )
    assert "ran_out" in conflict["content"]["application/json"]["examples"]
    error_schema = schema["components"]["schemas"]["FoodOutOfStockError"]
    assert {"code", "remaining_grams", "out_of_stock"}.issubset(error_schema["properties"])
    created = schema["components"]["schemas"]["FeedingRecordCreated"]
    assert {"stock", "out_of_stock"}.issubset(created["properties"])
    assert "out_of_stock" in schema["components"]["schemas"]["FoodPublic"]["properties"]


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
    assert set(create_schema["required"]) == {"fed_at"}
    assert "food_id" in create_schema["properties"]
    assert "conditionally required" in create_schema["description"]
    public_schema = schema["components"]["schemas"]["FeedingRecordPublic"]
    assert public_schema["properties"]["liked"]["type"] == "boolean"
    assert public_schema["properties"]["tolerated"]["type"] == "boolean"
