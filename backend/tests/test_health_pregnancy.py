from datetime import timedelta

from fastapi.testclient import TestClient

from tests.health_helpers import auth_headers, create_pet, local_today, pet_url


def test_pregnancy_lifecycle(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    url = pet_url(create_pet(client, headers, sex="girl"), "pregnancy")
    today = local_today()

    assert client.get(url, headers=headers).json() is None

    started = client.put(url, headers=headers, json={"month": 3})
    assert started.status_code == 200
    assert started.json()["month"] == 3
    assert started.json()["started_on"] == str(today - timedelta(days=60))

    updated = client.put(url, headers=headers, json={"started_on": str(today - timedelta(days=125))})
    assert updated.json()["id"] == started.json()["id"]
    assert updated.json()["month"] == 5
    assert client.get(url, headers=headers).json()["month"] == 5

    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).json() is None
    assert client.delete(url, headers=headers).status_code == 404

    restarted = client.put(url, headers=headers, json={"month": 1})
    assert restarted.json()["id"] != started.json()["id"]
    assert restarted.json()["started_on"] == str(today)


def test_month_is_capped_at_nine(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    url = pet_url(create_pet(client, headers), "pregnancy")
    response = client.put(
        url, headers=headers, json={"started_on": str(local_today() - timedelta(days=400))}
    )
    assert response.json()["month"] == 9


def test_pregnancy_validation(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    girl = pet_url(create_pet(client, headers, "Girl", sex="girl"), "pregnancy")
    boy = pet_url(create_pet(client, headers, "Boy", sex="boy"), "pregnancy")

    response = client.put(boy, headers=headers, json={"month": 2})
    assert response.status_code == 422
    assert response.json()["detail"] == "Pregnancy can only be recorded for a girl"

    future = str(local_today() + timedelta(days=3))
    for body in ({}, {"month": 2, "started_on": "2026-09-01"}, {"month": 0}, {"month": 10}):
        assert client.put(girl, headers=headers, json=body).status_code == 422
    assert client.put(girl, headers=headers, json={"started_on": future}).status_code == 422
    assert client.get(girl, headers=headers, params={"tz": "Mars/Olympus"}).status_code == 422
