from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.health import MedicationIntake, MedicationTime
from tests.health_helpers import auth_headers, create_pet, local_today, pet_url


START = date(2026, 10, 1)


def create_medication(client: TestClient, headers: dict[str, str], pet_id: int, **overrides) -> dict:
    payload = {
        "name": "Praziquantel",
        "dose": "1 tablet",
        "start_date": str(START),
        "end_date": str(START + timedelta(days=4)),
        "interval_days": 2,
        "times": ["20:00", "09:00", "09:00:30"],
    } | overrides
    response = client.post(pet_url(pet_id, "medications"), headers=headers, json=payload)
    assert response.status_code == 201, response.json()
    return response.json()


def schedule(client: TestClient, headers: dict[str, str], pet_id: int, start: date, end: date) -> list:
    response = client.get(
        pet_url(pet_id, "medications/schedule"),
        headers=headers,
        params={"from": str(start), "to": str(end)},
    )
    assert response.status_code == 200, response.json()
    return response.json()


def test_times_are_normalized_and_dates_validated(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    medication = create_medication(client, headers, pet_id)
    assert medication["times"] == ["09:00:00", "20:00:00"]

    response = client.post(
        pet_url(pet_id, "medications"),
        headers=headers,
        json={
            "name": "Omega-3",
            "dose": "2 drops",
            "start_date": "2026-10-10",
            "end_date": "2026-10-01",
            "times": ["09:00"],
        },
    )
    assert response.status_code == 422
    patched = client.patch(
        pet_url(pet_id, f"medications/{medication['id']}"),
        headers=headers,
        json={"end_date": "2026-09-01"},
    )
    assert patched.status_code == 422
    assert patched.json()["detail"] == "end_date must not be before start_date"


def test_schedule_expands_interval_and_course_bounds(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    medication = create_medication(client, headers, pet_id)

    doses = schedule(client, headers, pet_id, START - timedelta(days=2), START + timedelta(days=10))
    assert [dose["scheduled_for"] for dose in doses] == [
        "2026-10-01T09:00:00",
        "2026-10-01T20:00:00",
        "2026-10-03T09:00:00",
        "2026-10-03T20:00:00",
        "2026-10-05T09:00:00",
        "2026-10-05T20:00:00",
    ]
    assert {dose["status"] for dose in doses} == {"pending"}
    assert {dose["medication_id"] for dose in doses} == {medication["id"]}


def test_schedule_range_validation_and_default(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    create_medication(
        client, headers, pet_id, start_date=str(local_today()), end_date=None, interval_days=1, times=["08:00"]
    )
    url = pet_url(pet_id, "medications/schedule")

    default = client.get(url, headers=headers).json()
    assert len(default) == 7
    assert default[0]["scheduled_for"] == f"{local_today()}T08:00:00"

    assert client.get(url, headers=headers, params={"from": "2026-10-10", "to": "2026-10-01"}).status_code == 422
    assert client.get(url, headers=headers, params={"from": "2026-01-01", "to": "2026-12-31"}).status_code == 422


def test_intake_marks(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    medication = create_medication(client, headers, pet_id)
    intakes = pet_url(pet_id, f"medications/{medication['id']}/intakes")

    taken = client.put(
        intakes, headers=headers, json={"scheduled_for": "2026-10-03T09:00:00", "status": "taken"}
    )
    assert taken.status_code == 200
    assert taken.json()["status"] == "taken"
    # Offset-aware input is converted to the owner's local time (UTC+3 for Moscow).
    skipped = client.put(
        intakes, headers=headers, json={"scheduled_for": "2026-10-03T17:00:00Z", "status": "skipped"}
    )
    assert skipped.json()["scheduled_for"] == "2026-10-03T20:00:00"

    statuses = {
        dose["scheduled_for"]: dose["status"]
        for dose in schedule(client, headers, pet_id, START, START + timedelta(days=4))
    }
    assert statuses["2026-10-03T09:00:00"] == "taken"
    assert statuses["2026-10-03T20:00:00"] == "skipped"
    assert statuses["2026-10-01T09:00:00"] == "pending"

    # Re-marking updates the same slot.
    client.put(intakes, headers=headers, json={"scheduled_for": "2026-10-03T09:00:00", "status": "skipped"})
    statuses = {d["scheduled_for"]: d["status"] for d in schedule(client, headers, pet_id, START, START)}
    assert statuses["2026-10-01T09:00:00"] == "pending"

    for not_a_dose in ("2026-10-02T09:00:00", "2026-10-03T10:00:00", "2026-10-07T09:00:00"):
        response = client.put(intakes, headers=headers, json={"scheduled_for": not_a_dose, "status": "taken"})
        assert response.status_code == 422

    cleared = client.delete(intakes, headers=headers, params={"scheduled_for": "2026-10-03T09:00:00"})
    assert cleared.status_code == 204
    again = client.delete(intakes, headers=headers, params={"scheduled_for": "2026-10-03T09:00:00"})
    assert again.status_code == 404


def test_patch_times_replaces_list(client: TestClient, db: Session) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    medication = create_medication(client, headers, pet_id)
    url = pet_url(pet_id, f"medications/{medication['id']}")

    patched = client.patch(url, headers=headers, json={"times": ["12:00", "09:00"], "dose": "1/2 tablet"})
    assert patched.status_code == 200, patched.json()
    assert patched.json()["times"] == ["09:00:00", "12:00:00"]
    assert patched.json()["dose"] == "1/2 tablet"
    assert client.get(url, headers=headers).json()["times"] == ["09:00:00", "12:00:00"]
    assert db.scalar(select(func.count()).select_from(MedicationTime)) == 2

    assert client.patch(url, headers=headers, json={"times": []}).status_code == 422
    assert client.patch(url, headers=headers, json={"times": None}).status_code == 422


def test_deleting_medication_removes_times_and_intakes(client: TestClient, db: Session) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    medication = create_medication(client, headers, pet_id)
    client.put(
        pet_url(pet_id, f"medications/{medication['id']}/intakes"),
        headers=headers,
        json={"scheduled_for": "2026-10-01T09:00:00", "status": "taken"},
    )

    assert client.delete(pet_url(pet_id, f"medications/{medication['id']}"), headers=headers).status_code == 204
    assert db.scalar(select(func.count()).select_from(MedicationTime)) == 0
    assert db.scalar(select(func.count()).select_from(MedicationIntake)) == 0


def test_medications_are_isolated(client: TestClient) -> None:
    owner = auth_headers(client, "owner@example.com")
    other = auth_headers(client, "other@example.com")
    pet_id = create_pet(client, owner)
    foreign_pet = create_pet(client, other)
    medication = create_medication(client, owner, pet_id)

    assert client.get(pet_url(foreign_pet, f"medications/{medication['id']}"), headers=owner).status_code == 404
    assert client.get(pet_url(pet_id, "medications/schedule"), headers=other).status_code == 404
    response = client.put(
        pet_url(foreign_pet, f"medications/{medication['id']}/intakes"),
        headers=owner,
        json={"scheduled_for": "2026-10-01T09:00:00", "status": "taken"},
    )
    assert response.status_code == 404
