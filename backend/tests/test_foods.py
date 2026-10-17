from fastapi.testclient import TestClient


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


def food_payload(**overrides):
    return {
        "name": "Acme Chicken",
        "description": "Complete dry food",
        "type": "dry",
        "protein": 30.5,
        "fats": 15,
        "carbohydrates": 40,
        "calories": 380,
        "total_grams": 5000,
        **overrides,
    }


def test_food_crud_and_stock(client: TestClient) -> None:
    headers = auth_headers(client, "food-owner@example.com")
    created = client.post("/api/v1/foods", headers=headers, json=food_payload())
    assert created.status_code == 201
    food = created.json()
    assert food["remaining_grams"] == 5000
    assert food["total_grams"] == 5000

    updated = client.patch(
        f"/api/v1/foods/{food['id']}",
        headers=headers,
        json={"name": "Acme Chicken Plus", "remaining_grams": 4200},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Acme Chicken Plus"
    assert updated.json()["remaining_grams"] == 4200

    listed = client.get("/api/v1/foods", headers=headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [food["id"]]

    deleted = client.delete(f"/api/v1/foods/{food['id']}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/foods/{food['id']}", headers=headers).status_code == 404


def test_foods_are_isolated_between_users(client: TestClient) -> None:
    owner_headers = auth_headers(client, "food-owner@example.com")
    other_headers = auth_headers(client, "food-other@example.com")
    created = client.post("/api/v1/foods", headers=owner_headers, json=food_payload())
    food_id = created.json()["id"]

    assert client.get(f"/api/v1/foods/{food_id}", headers=other_headers).status_code == 404
    assert client.patch(
        f"/api/v1/foods/{food_id}", headers=other_headers, json={"name": "Stolen"}
    ).status_code == 404
    assert client.delete(f"/api/v1/foods/{food_id}", headers=other_headers).status_code == 404
    assert client.get("/api/v1/foods", headers=other_headers).json() == []


def test_food_validation(client: TestClient) -> None:
    headers = auth_headers(client, "food-validation@example.com")
    too_much = client.post(
        "/api/v1/foods",
        headers=headers,
        json=food_payload(remaining_grams=5001),
    )
    assert too_much.status_code == 422

    created = client.post("/api/v1/foods", headers=headers, json=food_payload())
    invalid_patch = client.patch(
        f"/api/v1/foods/{created.json()['id']}",
        headers=headers,
        json={"total_grams": 1000},
    )
    assert invalid_patch.status_code == 422
