from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.health import ParasiteTreatment
from tests.health_helpers import auth_headers, create_pet, local_today, pet_url

CALENDAR = "/api/v1/calendar"


def payload(**overrides) -> dict:
    base = {
        "kind": "external",
        "product_name": "Стронгхолд",
        "treated_on": str(local_today()),
    }
    base.update(overrides)
    return base


def test_create_computes_next_due_from_interval(client: TestClient) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    today = local_today()

    response = client.post(
        pet_url(pet_id, "parasite-treatments"),
        headers=headers,
        json=payload(treated_on=str(today), interval_days=90, clinic="Вет+"),
    )
    assert response.status_code == 201, response.json()
    created = response.json()
    assert created["kind"] == "external"
    assert created["product_name"] == "Стронгхолд"
    assert created["treated_on"] == str(today)
    assert created["interval_days"] == 90
    assert created["next_due_on"] == str(today + timedelta(days=90))
    assert created["clinic"] == "Вет+"


def test_explicit_next_due_wins_over_interval(client: TestClient) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    today = local_today()
    explicit = today + timedelta(days=10)

    created = client.post(
        pet_url(pet_id, "parasite-treatments"),
        headers=headers,
        json=payload(treated_on=str(today), interval_days=90, next_due_on=str(explicit)),
    ).json()
    assert created["next_due_on"] == str(explicit)


def test_patch_recomputes_and_reset_interval_clears_next_due(client: TestClient) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "parasite-treatments")
    today = local_today()
    treatment = client.post(
        url, headers=headers, json=payload(treated_on=str(today), interval_days=30)
    ).json()

    pushed = client.patch(
        f"{url}/{treatment['id']}", headers=headers, json={"treated_on": str(today + timedelta(days=5))}
    ).json()
    assert pushed["next_due_on"] == str(today + timedelta(days=35))

    changed = client.patch(f"{url}/{treatment['id']}", headers=headers, json={"interval_days": 60}).json()
    assert changed["next_due_on"] == str(today + timedelta(days=65))

    cleared = client.patch(f"{url}/{treatment['id']}", headers=headers, json={"interval_days": None}).json()
    assert cleared["interval_days"] is None
    assert cleared["next_due_on"] is None


def test_blank_product_name_and_zero_interval_rejected(client: TestClient) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "parasite-treatments")

    assert client.post(url, headers=headers, json=payload(product_name="   ")).status_code == 422
    assert client.post(url, headers=headers, json=payload(interval_days=0)).status_code == 422
    assert client.post(url, headers=headers, json=payload(kind="wrong")).status_code == 422


def test_list_ordering_and_kind_filter(client: TestClient) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "parasite-treatments")
    today = local_today()

    later = client.post(
        url, headers=headers, json=payload(treated_on=str(today + timedelta(days=7)))
    ).json()
    sooner = client.post(
        url, headers=headers, json=payload(treated_on=str(today), kind="internal")
    ).json()

    listed = client.get(url, headers=headers).json()
    assert [item["id"] for item in listed] == [sooner["id"], later["id"]]
    internal = client.get(url, headers=headers, params={"kind": "internal"}).json()
    assert [item["id"] for item in internal] == [sooner["id"]]


def test_ownership_isolation(client: TestClient) -> None:
    owner = auth_headers(client, "owner@example.com")
    other = auth_headers(client, "other@example.com")
    own_pet = create_pet(client, owner, "Own")
    foreign_pet = create_pet(client, other, "Foreign")

    treatment = client.post(
        pet_url(own_pet, "parasite-treatments"), headers=owner, json=payload()
    ).json()
    foreign = pet_url(foreign_pet, "parasite-treatments")

    assert client.get(foreign, headers=owner).status_code == 404
    assert client.get(f"{foreign}/{treatment['id']}", headers=owner).status_code == 404
    assert client.patch(
        f"{foreign}/{treatment['id']}", headers=owner, json={"product_name": "X"}
    ).status_code == 404
    assert client.delete(f"{foreign}/{treatment['id']}", headers=owner).status_code == 404
    assert client.get(pet_url(own_pet, "parasite-treatments")).status_code == 401


def test_delete_removes_treatment(client: TestClient, db: Session) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "parasite-treatments")
    treatment = client.post(url, headers=headers, json=payload()).json()

    assert client.delete(f"{url}/{treatment['id']}", headers=headers).status_code == 204
    assert client.get(f"{url}/{treatment['id']}", headers=headers).status_code == 404
    assert db.scalar(select(func.count()).select_from(ParasiteTreatment)) == 0


def test_overview_exposes_next_parasite(client: TestClient) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    today = local_today()
    client.post(
        pet_url(pet_id, "parasite-treatments"),
        headers=headers,
        json=payload(treated_on=str(today), interval_days=90),
    )

    overview = client.get(
        pet_url(pet_id, "health"), headers=headers, params={"tz": "Europe/Moscow"}
    ).json()
    assert overview["next_parasite"]["product_name"] == "Стронгхолд"
    assert overview["next_parasite"]["next_due_on"] == str(today + timedelta(days=90))


def test_calendar_includes_parasite_event(client: TestClient) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    today = local_today()
    due = today + timedelta(days=30)
    client.post(
        pet_url(pet_id, "parasite-treatments"),
        headers=headers,
        json=payload(treated_on=str(today), next_due_on=str(due)),
    )

    events = client.get(
        f"{CALENDAR}/events",
        headers=headers,
        params={"from": str(today), "to": str(today + timedelta(days=60))},
    ).json()
    parasite = next(event for event in events if event["type"] == "parasite")
    assert parasite["date"] == str(due)
    assert parasite["title"] == "Стронгхолд (обработка от паразитов)"
    assert parasite["status"] == "planned"


def test_vaccination_next_due_autocalc(client: TestClient) -> None:
    headers = auth_headers(client, "parasite@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "vaccinations")
    today = local_today()

    created = client.post(
        url,
        headers=headers,
        json={"name": "Комплексная", "scheduled_on": str(today), "interval_days": 365},
    ).json()
    assert created["next_due_on"] == str(today + timedelta(days=365))

    updated = client.patch(
        f"{url}/{created['id']}", headers=headers, json={"interval_days": None}
    ).json()
    assert updated["next_due_on"] is None


def test_openapi_documents_parasite_schemas(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    components = schema["components"]["schemas"]
    assert "ParasiteTreatmentCreate" in components
    assert "ParasiteTreatmentPublic" in components
    assert "interval_days" in components["VaccinationPublic"]["properties"]
    assert "next_due_on" in components["VaccinationPublic"]["properties"]
    paths = schema["paths"]
    assert "/api/v1/pets/{pet_id}/parasite-treatments" in paths
