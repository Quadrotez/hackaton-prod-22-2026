"""What the recipient of an accepted transfer (temporary caretaker) may do with the pet."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.transfer import PetTransfer
from tests.health_helpers import auth_headers, create_pet, pet_url

FOOD = {
    "name": "Catalog Chicken", "type": "dry", "protein": 30, "fats": 15,
    "carbohydrates": 40, "calories": 380, "total_grams": 1000,
}
FEEDING = {"fed_at": "2026-10-15T12:00:00Z", "amount_grams": 50, "liked": True, "tolerated": True}
VISIT = {"title": "Осмотр", "visit_at": "2026-10-20T10:00:00Z", "reason": "examination"}


def in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def created(response) -> dict:
    assert response.status_code == 201, response.json()
    return response.json()


def give(client: TestClient, owner: dict, recipient: dict, pet_id: int, **period) -> dict:
    period = period or {"ends_at": in_days(7)}
    transfer = created(
        client.post(
            pet_url(pet_id, "transfers"),
            headers=owner,
            json={"recipient_email": "ivan@example.com", **period},
        )
    )
    accepted = client.post(f"/api/v1/transfers/{transfer['id']}/accept", headers=recipient)
    assert accepted.status_code == 200, accepted.json()
    return accepted.json()


@pytest.fixture
def setup(client: TestClient) -> dict:
    """An owner's pet with one record of every kind, given to Ivan for a week."""
    owner = auth_headers(client, "anna@example.com")
    caretaker = auth_headers(client, "ivan@example.com")
    stranger = auth_headers(client, "petr@example.com")
    pet_id = create_pet(client, owner)
    url = lambda path: pet_url(pet_id, path)  # noqa: E731

    food = created(client.post("/api/v1/foods", headers=owner, json=FOOD))
    ids = {
        "food": food["id"],
        "feeding": created(
            client.post(url("feeding-records"), headers=owner, json={**FEEDING, "food_id": food["id"]})
        )["id"],
        "symptom": created(
            client.post(
                url("symptoms"),
                headers=owner,
                json={"description": "Чихает", "observed_at": "2026-10-14T10:00:00Z"},
            )
        )["id"],
        "allergy": created(client.post(url("allergies"), headers=owner, json={"allergen": "Курица"}))["id"],
        "vaccination": created(
            client.post(url("vaccinations"), headers=owner, json={"name": "Бешенство", "scheduled_on": "2026-12-14"})
        )["id"],
        "medication": created(
            client.post(
                url("medications"),
                headers=owner,
                json={"name": "Капли", "dose": "2", "start_date": "2026-10-15", "times": ["09:00"]},
            )
        )["id"],
        "visit": created(client.post(url("visits"), headers=owner, json=VISIT))["id"],
        "parasite": created(
            client.post(
                url("parasite-treatments"),
                headers=owner,
                json={"kind": "external", "product_name": "Стронгхолд", "treated_on": "2026-10-01"},
            )
        )["id"],
        "parameter": created(
            client.post(url("measurement-parameters"), headers=owner, json={"name": "Длина когтя", "unit": "см"})
        )["id"],
    }
    ids["measurement"] = created(
        client.post(
            url(f"measurement-parameters/{ids['parameter']}/measurements"),
            headers=owner,
            json={"value": 30, "measured_at": "2026-10-15T10:00:00Z"},
        )
    )["id"]
    transfer = give(client, owner, caretaker, pet_id)
    return {
        "owner": owner, "caretaker": caretaker, "stranger": stranger,
        "pet_id": pet_id, "ids": ids, "transfer": transfer,
    }


# (method, path relative to /pets/{pet_id}, body). {name} is replaced with a record id.
READS = [
    ("GET", "", None),
    ("GET", "weight", None),
    ("GET", "health", None),
    ("GET", "health/summary", None),
    ("GET", "feeding-records", None),
    ("GET", "feeding-records/{feeding}", None),
    ("GET", "symptoms", None),
    ("GET", "symptoms/{symptom}", None),
    ("GET", "allergies", None),
    ("GET", "vaccinations", None),
    ("GET", "medications", None),
    ("GET", "medications/{medication}", None),
    ("GET", "visits", None),
    ("GET", "visits/{visit}", None),
    ("GET", "parasite-treatments", None),
    ("GET", "measurement-parameters", None),
    ("GET", "measurement-parameters/{parameter}/measurements", None),
    ("GET", "pregnancy", None),
]
CARE_ACTIONS = [
    ("POST", "feeding-records", {**FEEDING, "food_id": "{food}"}),
    ("POST", "symptoms", {"description": "Вялый", "observed_at": "2026-10-15T10:00:00Z"}),
    ("POST", "measurement-parameters/{parameter}/measurements", {"value": 31, "measured_at": "2026-10-16T10:00:00Z"}),
    ("PUT", "medications/{medication}/intakes", {"scheduled_for": "2026-10-15T09:00:00", "status": "taken"}),
    ("POST", "visits", VISIT),
    ("PATCH", "", {"weight_g": 4700}),
]
OWNER_ONLY = [
    ("PATCH", "", {"name": "Другое имя"}),
    ("PATCH", "", {"weight_g": 4700, "name": "Другое имя"}),
    ("DELETE", "", None),
    ("PATCH", "feeding-records/{feeding}", {"notes": "x"}),
    ("DELETE", "feeding-records/{feeding}", None),
    ("PATCH", "symptoms/{symptom}", {"description": "x"}),
    ("DELETE", "symptoms/{symptom}", None),
    ("POST", "allergies", {"allergen": "Рыба"}),
    ("DELETE", "allergies/{allergy}", None),
    ("POST", "vaccinations", {"name": "Чума", "scheduled_on": "2026-12-14"}),
    ("DELETE", "vaccinations/{vaccination}", None),
    ("POST", "medications", {"name": "x", "dose": "1", "start_date": "2026-10-15", "times": ["09:00"]}),
    ("DELETE", "medications/{medication}", None),
    ("PATCH", "visits/{visit}", {"title": "x"}),
    ("DELETE", "visits/{visit}", None),
    ("POST", "parasite-treatments", {"kind": "external", "product_name": "x", "treated_on": "2026-10-01"}),
    ("DELETE", "parasite-treatments/{parasite}", None),
    ("POST", "measurement-parameters", {"name": "Хвост", "unit": "см"}),
    ("DELETE", "measurement-parameters/{parameter}", None),
    ("DELETE", "measurement-parameters/{parameter}/measurements/{measurement}", None),
    ("PUT", "pregnancy", {"month": 1}),
    ("POST", "transfers", {"recipient_email": "petr@example.com", "duration": "week"}),
    ("GET", "transfers", None),
]


def fill(value, ids: dict):
    if isinstance(value, str):
        if value.startswith("{") and value.endswith("}") and value[1:-1] in ids:
            return ids[value[1:-1]]
        return value.format(**ids)
    if isinstance(value, dict):
        return {key: fill(item, ids) for key, item in value.items()}
    return value


def call(client: TestClient, setup: dict, who: str, method: str, path: str, body):
    url = f"/api/v1/pets/{setup['pet_id']}" + (f"/{fill(path, setup['ids'])}" if path else "")
    return client.request(method, url, headers=setup[who], json=fill(body, setup["ids"]))


@pytest.mark.parametrize(("method", "path", "body"), READS + CARE_ACTIONS)
def test_caretaker_reads_and_adds_care_records(client: TestClient, setup, method, path, body) -> None:
    response = call(client, setup, "caretaker", method, path, body)
    assert response.status_code in (200, 201), response.json()
    assert call(client, setup, "stranger", method, path, body).status_code == 404


@pytest.mark.parametrize(("method", "path", "body"), OWNER_ONLY)
def test_caretaker_cannot_change_or_delete(client: TestClient, setup, method, path, body) -> None:
    response = call(client, setup, "caretaker", method, path, body)
    assert response.status_code == 403, response.json()
    assert "owner" in response.json()["detail"]
    assert call(client, setup, "stranger", method, path, body).status_code == 404


def test_pet_list_marks_cared_pets(client: TestClient, setup) -> None:
    own = create_pet(client, setup["caretaker"], name="Мурка")
    pets = client.get("/api/v1/pets/", headers=setup["caretaker"]).json()
    assert [(pet["id"], pet["access"]) for pet in pets] == [(own, "owner"), (setup["pet_id"], "caretaker")]
    cared = pets[1]
    assert cared["care_transfer_id"] == setup["transfer"]["id"]
    assert cared["care_ends_at"] is not None
    assert cared["owner_name"] == "anna@example.com"
    # The owner sees nothing new.
    owner_pets = client.get("/api/v1/pets/", headers=setup["owner"]).json()
    assert [(pet["id"], pet["access"]) for pet in owner_pets] == [(setup["pet_id"], "owner")]


def test_caretaker_feeds_from_owner_stock(client: TestClient, setup) -> None:
    foods = client.get(f"/api/v1/foods?pet_id={setup['pet_id']}", headers=setup["caretaker"])
    assert [food["id"] for food in foods.json()] == [setup["ids"]["food"]]
    assert client.get("/api/v1/foods", headers=setup["caretaker"]).json() == []
    assert client.get(f"/api/v1/foods?pet_id={setup['pet_id']}", headers=setup["stranger"]).status_code == 404

    fed = call(client, setup, "caretaker", *CARE_ACTIONS[0])
    assert fed.json()["stock"]["remaining_grams"] == 900  # 1000 - 50 (owner) - 50 (caretaker)
    # Still cannot touch the catalog itself.
    food_id = setup["ids"]["food"]
    assert client.patch(f"/api/v1/foods/{food_id}", headers=setup["caretaker"], json={"name": "x"}).status_code == 404


def test_calendar_includes_cared_pets(client: TestClient, setup) -> None:
    events = client.get(
        "/api/v1/calendar/events?from=2026-10-01&to=2026-10-31", headers=setup["caretaker"]
    ).json()
    assert {event["pet_id"] for event in events} == {setup["pet_id"]}


def test_summary_shows_owner_contact(client: TestClient, setup) -> None:
    summary = call(client, setup, "caretaker", "GET", "health/summary", None).json()
    assert "anna@example.com" in str(summary)
    assert "ivan@example.com" not in str(summary)


@pytest.mark.parametrize("ending", ["confirmed return", "owner ended", "expired"])
def test_access_ends_with_the_transfer(client: TestClient, setup, db: Session, ending) -> None:
    transfer_id = setup["transfer"]["id"]
    if ending == "confirmed return":
        assert client.post(f"/api/v1/transfers/{transfer_id}/return", headers=setup["caretaker"]).status_code == 200
        # While the return waits for the owner, the caretaker still looks after the pet.
        assert call(client, setup, "caretaker", "GET", "", None).status_code == 200
        done = client.post(f"/api/v1/transfers/{transfer_id}/confirm-return", headers=setup["owner"])
    elif ending == "owner ended":
        done = client.post(f"/api/v1/transfers/{transfer_id}/end", headers=setup["owner"])
    else:
        db.execute(
            update(PetTransfer)
            .where(PetTransfer.id == transfer_id)
            .values(ends_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        db.commit()
        done = None
    if done is not None:
        assert done.status_code == 200, done.json()
        assert done.json()["status"] == "returned"

    assert call(client, setup, "caretaker", "GET", "", None).status_code == 404
    assert client.get("/api/v1/pets/", headers=setup["caretaker"]).json() == []
    assert call(client, setup, "caretaker", *CARE_ACTIONS[1]).status_code == 404


def test_pending_transfer_gives_no_access(client: TestClient) -> None:
    owner = auth_headers(client, "anna@example.com")
    recipient = auth_headers(client, "ivan@example.com")
    pet_id = create_pet(client, owner)
    created(
        client.post(
            pet_url(pet_id, "transfers"),
            headers=owner,
            json={"recipient_email": "ivan@example.com", "ends_at": in_days(3)},
        )
    )
    assert client.get(pet_url(pet_id, "symptoms"), headers=recipient).status_code == 404


def test_only_owner_can_end_and_only_while_accepted(client: TestClient, setup) -> None:
    transfer_id = setup["transfer"]["id"]
    assert client.post(f"/api/v1/transfers/{transfer_id}/end", headers=setup["caretaker"]).status_code == 403
    assert client.post(f"/api/v1/transfers/{transfer_id}/end", headers=setup["owner"]).status_code == 200
    assert client.post(f"/api/v1/transfers/{transfer_id}/end", headers=setup["owner"]).status_code == 409


def test_custom_end_date(client: TestClient) -> None:
    owner = auth_headers(client, "anna@example.com")
    pet_id = create_pet(client, owner)
    url = pet_url(pet_id, "transfers")
    ends_at = (datetime.now(UTC) + timedelta(days=10)).replace(microsecond=0)

    def post(**body):
        return client.post(url, headers=owner, json={"recipient_email": "ivan@example.com", **body})

    for bad in (
        {},
        {"duration": "custom"},
        {"ends_at": in_days(-1)},
        {"ends_at": in_days(400)},
        {"ends_at": in_days(3), "duration": "week"},
        {"ends_at": "2026-12-01T10:00:00"},  # no timezone
    ):
        assert post(**bad).status_code == 422, bad

    transfer = created(post(ends_at=ends_at.isoformat()))
    assert transfer["duration"] == "custom"
    assert datetime.fromisoformat(transfer["ends_at"].replace("Z", "+00:00")) == ends_at
