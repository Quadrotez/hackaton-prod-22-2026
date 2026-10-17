from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.health import Allergy, Symptom, Vaccination
from tests.health_helpers import auth_headers, create_pet, local_today, pet_url

RECORD_PAYLOADS = {
    "symptoms": {"description": "Sneezing twice a day", "observed_at": "2026-10-14T10:00:00Z"},
    "allergies": {"allergen": "Chicken", "reactions": "itching"},
    "vaccinations": {"name": "Rabies", "scheduled_on": "2026-12-14"},
}


def test_symptom_crud_and_ordering(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "symptoms")

    older = client.post(
        url, headers=headers, json={"description": "  Lethargy  ", "observed_at": "2026-10-09T18:00:00Z"}
    )
    assert older.status_code == 201
    assert older.json()["description"] == "Lethargy"
    newer = client.post(url, headers=headers, json=RECORD_PAYLOADS["symptoms"]).json()

    listed = client.get(url, headers=headers).json()
    assert [item["id"] for item in listed] == [newer["id"], older.json()["id"]]

    patched = client.patch(
        f"{url}/{newer['id']}", headers=headers, json={"description": "Sneezing"}
    )
    assert patched.status_code == 200
    assert patched.json()["description"] == "Sneezing"
    assert patched.json()["observed_at"].startswith("2026-10-14")

    assert client.delete(f"{url}/{newer['id']}", headers=headers).status_code == 204
    assert client.get(f"{url}/{newer['id']}", headers=headers).status_code == 404


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({}, "At least one field is required"),
        ({"description": None}, "description must not be null"),
        ({"observed_at": None}, "observed_at must not be null"),
    ],
)
def test_symptom_patch_rejects_empty_and_null(client: TestClient, body: dict, detail: str) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "symptoms")
    symptom = client.post(url, headers=headers, json=RECORD_PAYLOADS["symptoms"]).json()

    response = client.patch(f"{url}/{symptom['id']}", headers=headers, json=body)
    assert response.status_code == 422
    assert response.json()["detail"] == detail


def test_blank_text_is_rejected(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    response = client.post(
        pet_url(pet_id, "allergies"), headers=headers, json={"allergen": "   "}
    )
    assert response.status_code == 422


def test_allergy_optional_fields_can_be_cleared(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "allergies")
    allergy = client.post(url, headers=headers, json=RECORD_PAYLOADS["allergies"]).json()
    assert allergy["reactions"] == "itching"
    assert allergy["notes"] is None

    patched = client.patch(f"{url}/{allergy['id']}", headers=headers, json={"reactions": None})
    assert patched.status_code == 200
    assert patched.json()["reactions"] is None
    assert patched.json()["allergen"] == "Chicken"


def test_vaccinations_default_to_planned_and_filter_by_status(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "vaccinations")
    today = local_today()

    later = client.post(
        url, headers=headers, json={"name": "Complex", "scheduled_on": str(today + timedelta(days=20))}
    ).json()
    sooner = client.post(
        url, headers=headers, json={"name": "Deworming", "scheduled_on": str(today + timedelta(days=5))}
    ).json()
    done = client.post(
        url,
        headers=headers,
        json={"name": "Rabies", "scheduled_on": "2025-12-14", "status": "done", "clinic": "Vet+"},
    ).json()
    assert later["status"] == "planned"

    planned = client.get(url, headers=headers, params={"status": "planned"}).json()
    assert [item["id"] for item in planned] == [sooner["id"], later["id"]]
    assert [item["id"] for item in client.get(url, headers=headers, params={"status": "done"}).json()] == [
        done["id"]
    ]
    assert client.get(url, headers=headers, params={"status": "unknown"}).status_code == 422

    marked = client.patch(f"{url}/{sooner['id']}", headers=headers, json={"status": "done"})
    assert marked.json()["status"] == "done"


@pytest.mark.parametrize("collection", sorted(RECORD_PAYLOADS))
def test_records_are_isolated_per_owner_and_pet(client: TestClient, collection: str) -> None:
    owner = auth_headers(client, "owner@example.com")
    other = auth_headers(client, "other@example.com")
    own_pet = create_pet(client, owner, "Own")
    second_pet = create_pet(client, owner, "Second")
    foreign_pet = create_pet(client, other, "Foreign")
    payload = RECORD_PAYLOADS[collection]

    record = client.post(pet_url(own_pet, collection), headers=owner, json=payload).json()
    foreign = pet_url(foreign_pet, collection)

    for method, path, kwargs in (
        ("get", foreign, {}),
        ("post", foreign, {"json": payload}),
        ("get", f"{foreign}/{record['id']}", {}),
        ("patch", f"{foreign}/{record['id']}", {"json": payload}),
        ("delete", f"{foreign}/{record['id']}", {}),
    ):
        assert getattr(client, method)(path, headers=owner, **kwargs).status_code == 404

    # Another pet of the same owner does not expose the record either.
    wrong_pet = f"{pet_url(second_pet, collection)}/{record['id']}"
    assert client.get(wrong_pet, headers=owner).status_code == 404
    assert client.get(pet_url(own_pet, collection), headers=other).status_code == 404
    assert client.get(pet_url(own_pet, collection)).status_code == 401


def test_deleting_pet_removes_its_health_records(client: TestClient, db: Session) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    for collection, payload in RECORD_PAYLOADS.items():
        assert client.post(pet_url(pet_id, collection), headers=headers, json=payload).status_code == 201

    assert client.delete(f"/api/v1/pets/{pet_id}", headers=headers).status_code == 204
    for model in (Symptom, Allergy, Vaccination):
        assert db.scalar(select(func.count()).select_from(model)) == 0
