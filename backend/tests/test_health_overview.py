from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from tests.health_helpers import auth_headers, create_pet, local_today, pet_url


def test_overview_of_pet_without_records(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers, species="hamster")

    response = client.get(pet_url(pet_id, "health"), headers=headers)
    assert response.status_code == 200
    assert response.json() == {
        "symptoms": [],
        "symptoms_total": 0,
        "pregnancy": None,
        "allergies": [],
        "medications_today": [],
        "upcoming_doses": [],
        "planned_vaccinations": [],
        "planned_visits": [],
        "past_visits": [],
        "top_topic": None,
        "measurements": [],
    }


def test_overview_collects_every_section(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    today = local_today()

    for day in range(7):
        client.post(
            pet_url(pet_id, "symptoms"),
            headers=headers,
            json={"description": f"Day {day}", "observed_at": f"2026-10-0{day + 1}T10:00:00Z"},
        )
    client.put(pet_url(pet_id, "pregnancy"), headers=headers, json={"month": 2})
    client.post(pet_url(pet_id, "allergies"), headers=headers, json={"allergen": "Pollen"})
    client.post(
        pet_url(pet_id, "medications"),
        headers=headers,
        json={
            "name": "Vitamins",
            "dose": "1 ml",
            "start_date": str(today - timedelta(days=3)),
            "times": ["00:00", "23:59"],
        },
    )
    client.post(
        pet_url(pet_id, "vaccinations"),
        headers=headers,
        json={"name": "Complex", "scheduled_on": str(today + timedelta(days=16))},
    )
    client.post(
        pet_url(pet_id, "vaccinations"),
        headers=headers,
        json={"name": "Rabies", "scheduled_on": "2025-12-14", "status": "done"},
    )
    visit = {"title": "Check", "visit_at": "2026-10-22T11:00:00Z", "reason": "checkup", "topic": "Allergy"}
    client.post(pet_url(pet_id, "visits"), headers=headers, json=visit)
    client.post(pet_url(pet_id, "visits"), headers=headers, json=visit | {"status": "completed"})

    body = client.get(pet_url(pet_id, "health"), headers=headers).json()
    assert body["symptoms_total"] == 7
    assert [symptom["description"] for symptom in body["symptoms"]] == [
        "Day 6", "Day 5", "Day 4", "Day 3", "Day 2"
    ]
    assert body["pregnancy"]["month"] == 2
    assert [allergy["allergen"] for allergy in body["allergies"]] == ["Pollen"]
    assert [dose["scheduled_for"] for dose in body["medications_today"]] == [
        f"{today}T00:00:00",
        f"{today}T23:59:00",
    ]
    assert body["upcoming_doses"]
    assert all(dose["status"] == "pending" for dose in body["upcoming_doses"])
    assert body["upcoming_doses"][0]["scheduled_for"] >= f"{today}T00:00:00"
    assert [item["name"] for item in body["planned_vaccinations"]] == ["Complex"]
    assert len(body["planned_visits"]) == 1
    assert len(body["past_visits"]) == 1
    assert body["top_topic"] == {
        "topic": "Allergy", "total": 2, "planned": 1, "completed": 1, "cancelled": 0
    }
    # A cat gets the template parameters, still without values.
    assert [item["name"] for item in body["measurements"]][0] == "Рост в холке"
    assert all(item["latest"] is None for item in body["measurements"])


def test_summary_includes_feeding_and_owner(client: TestClient) -> None:
    headers = auth_headers(client, "anna@example.com")
    pet_id = create_pet(client, headers)
    today = local_today()
    recent = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    old = (datetime.now(UTC) - timedelta(days=45)).isoformat()

    feeding = pet_url(pet_id, "feeding-records")
    for food, fed_at, tolerated in (
        ("Old food", old, True),
        ("Dry chicken", recent, True),
        ("Wet beef", recent, False),
    ):
        client.post(
            feeding,
            headers=headers,
            json={"food_name": food, "fed_at": fed_at, "liked": True, "tolerated": tolerated},
        )
    client.post(
        pet_url(pet_id, "medications"),
        headers=headers,
        json={"name": "Omega-3", "dose": "2 drops", "start_date": str(today), "times": ["09:00"]},
    )
    client.post(
        pet_url(pet_id, "medications"),
        headers=headers,
        json={
            "name": "Finished course",
            "dose": "1 tablet",
            "start_date": "2026-01-01",
            "end_date": "2026-01-10",
            "times": ["09:00"],
        },
    )

    response = client.get(pet_url(pet_id, "health/summary"), headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["generated_on"] == str(today)
    assert body["owner_email"] == "anna@example.com"
    assert body["pet"]["name"] == "Barsik"
    assert body["pet"]["weight_g"] == 4600
    assert body["last_feeding"]["food_name"] in {"Dry chicken", "Wet beef"}
    assert sorted(body["foods_in_diet"]) == ["Dry chicken", "Wet beef"]
    assert [item["food_name"] for item in body["feeding_reactions_last_week"]] == ["Wet beef"]
    assert [item["name"] for item in body["current_medications"]] == ["Omega-3"]


def test_overview_is_isolated(client: TestClient) -> None:
    owner = auth_headers(client, "owner@example.com")
    other = auth_headers(client, "other@example.com")
    pet_id = create_pet(client, owner)
    assert client.get(pet_url(pet_id, "health"), headers=other).status_code == 404
    assert client.get(pet_url(pet_id, "health/summary"), headers=other).status_code == 404
    assert client.get(pet_url(pet_id, "health")).status_code == 401
