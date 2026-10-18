from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.services.calendar_ics import fold
from tests.health_helpers import auth_headers, create_pet, local_today, pet_url

CALENDAR = "/api/v1/calendar"
OCTOBER = {"from": "2026-10-01", "to": "2026-10-31"}


def post(client: TestClient, headers: dict[str, str], url: str, body: dict) -> dict:
    response = client.post(url, headers=headers, json=body)
    assert response.status_code == 201, response.json()
    return response.json()


@pytest.fixture
def household(client: TestClient) -> dict:
    """Two pets of one owner with visits, vaccinations and medications in October 2026."""
    headers = auth_headers(client, "anna@example.com")
    barsik = create_pet(client, headers, "Барсик", species="cat")
    rex = create_pet(client, headers, "Рекс", species="dog", sex="boy")

    visit = post(client, headers, pet_url(rex, "visits"), {
        "title": "Плановый осмотр", "visit_at": "2026-10-22T08:00:00Z", "reason": "checkup",
        "doctor_name": "Иванова", "doctor_specialty": "терапевт",
    })
    post(client, headers, pet_url(rex, "visits"), {
        "title": "Отменённый", "visit_at": "2026-10-23T08:00:00Z", "reason": "checkup",
        "status": "cancelled",
    })
    # 22:30 UTC on Oct 31 is already Nov 1 in Moscow, so it falls outside October.
    post(client, headers, pet_url(rex, "visits"), {
        "title": "Ночной", "visit_at": "2026-10-31T22:30:00Z", "reason": "illness",
    })
    vaccination = post(client, headers, pet_url(barsik, "vaccinations"), {
        "name": "Комплексная, ревакцинация", "scheduled_on": "2026-10-05", "clinic": "Вет+",
    })
    praziquantel = post(client, headers, pet_url(barsik, "medications"), {
        "name": "Празиквантел", "dose": "1 таблетка", "start_date": "2026-10-16",
        "end_date": "2026-10-16", "times": ["18:00"],
    })
    flea = post(client, headers, pet_url(rex, "medications"), {
        "name": "Обработка от блох", "dose": "1 пипетка", "start_date": "2026-09-28",
        "interval_days": 30, "times": ["10:00"],
    })
    return {
        "headers": headers, "barsik": barsik, "rex": rex, "visit": visit,
        "vaccination": vaccination, "praziquantel": praziquantel, "flea": flea,
    }


def events(client: TestClient, headers: dict[str, str], **params) -> list[dict]:
    response = client.get(f"{CALENDAR}/events", headers=headers, params=OCTOBER | params)
    assert response.status_code == 200, response.json()
    return response.json()


def test_events_of_all_pets_in_month(client: TestClient, household) -> None:
    listed = events(client, household["headers"])
    assert [(item["date"], item["time"], item["title"]) for item in listed] == [
        ("2026-10-05", None, "Комплексная, ревакцинация"),
        ("2026-10-16", "18:00:00", "Празиквантел"),
        ("2026-10-22", "11:00:00", "Плановый осмотр"),
        ("2026-10-28", "10:00:00", "Обработка от блох"),
    ]
    visit = listed[2]
    assert visit == {
        "id": f"visit-{household['visit']['id']}",
        "type": "visit",
        "pet_id": household["rex"],
        "pet_name": "Рекс",
        "title": "Плановый осмотр",
        "detail": "Иванова · терапевт",
        "date": "2026-10-22",
        "time": "11:00:00",
        "status": "planned",
        "source_id": household["visit"]["id"],
    }
    assert listed[0]["type"] == "vaccination"
    assert listed[0]["detail"] == "Вет+"
    assert listed[1]["detail"] == "1 таблетка"
    assert listed[1]["status"] == "pending"
    assert listed[1]["id"] == f"dose-{household['praziquantel']['id']}-20261016T1800"


def test_timezone_shifts_dates_and_times(client: TestClient, household) -> None:
    utc = events(client, household["headers"], tz="UTC")
    assert ("2026-10-22", "08:00:00") in [(item["date"], item["time"]) for item in utc]
    # In UTC the night visit is still on Oct 31.
    assert "Ночной" in [item["title"] for item in utc]
    november = events(client, household["headers"], **{"from": "2026-11-01", "to": "2026-11-30"})
    assert ("Ночной", "2026-11-01", "01:30:00") in [
        (item["title"], item["date"], item["time"]) for item in november
    ]


def test_filters(client: TestClient, household) -> None:
    headers = household["headers"]
    only_barsik = events(client, headers, pet_id=household["barsik"])
    assert {item["pet_name"] for item in only_barsik} == {"Барсик"}
    response = client.get(f"{CALENDAR}/events", headers=headers, params=OCTOBER | {"type": ["visit", "vaccination"]})
    assert {item["type"] for item in response.json()} == {"visit", "vaccination"}
    assert client.get(f"{CALENDAR}/events", headers=headers, params={"type": "walk"}).status_code == 422


def test_dose_status_follows_intake_marks(client: TestClient, household) -> None:
    headers = household["headers"]
    client.put(
        pet_url(household["barsik"], f"medications/{household['praziquantel']['id']}/intakes"),
        headers=headers,
        json={"scheduled_for": "2026-10-16T18:00:00", "status": "taken"},
    )
    dose = next(item for item in events(client, headers) if item["title"] == "Празиквантел")
    assert dose["status"] == "taken"


def test_range_validation_and_isolation(client: TestClient, household) -> None:
    headers = household["headers"]
    for params in ({"from": "2026-10-10", "to": "2026-10-01"}, {"from": "2026-01-01", "to": "2027-12-31"}):
        assert client.get(f"{CALENDAR}/events", headers=headers, params=params).status_code == 422
    assert client.get(f"{CALENDAR}/events", headers=headers, params={"tz": "Mars/Base"}).status_code == 422

    stranger = auth_headers(client, "eve@example.com")
    assert events(client, stranger) == []
    foreign = client.get(f"{CALENDAR}/events", headers=stranger, params={"pet_id": household["rex"]})
    assert foreign.status_code == 404
    assert client.get(f"{CALENDAR}/events").status_code == 401


def test_default_range_is_six_weeks_from_today(client: TestClient) -> None:
    headers = auth_headers(client, "anna@example.com")
    pet_id = create_pet(client, headers)
    today = local_today()
    for days in (0, 41, 42):
        post(client, headers, pet_url(pet_id, "vaccinations"), {
            "name": f"+{days}", "scheduled_on": str(today + timedelta(days=days)),
        })
    listed = client.get(f"{CALENDAR}/events", headers=headers).json()
    assert [item["title"] for item in listed] == ["+0", "+41"]


def test_upcoming_lists_only_what_is_still_ahead(client: TestClient) -> None:
    headers = auth_headers(client, "anna@example.com")
    pet_id = create_pet(client, headers)
    today = local_today()
    tomorrow, yesterday = today + timedelta(days=1), today - timedelta(days=1)

    for title, day, visit_status in (
        ("Завтра", tomorrow, "planned"),
        ("Вчера", yesterday, "planned"),
        ("Уже был", tomorrow, "completed"),
    ):
        post(client, headers, pet_url(pet_id, "visits"), {
            "title": title, "visit_at": f"{day}T09:00:00Z", "reason": "checkup", "status": visit_status,
        })
    post(client, headers, pet_url(pet_id, "vaccinations"), {"name": "Сегодня", "scheduled_on": str(today)})
    post(client, headers, pet_url(pet_id, "vaccinations"), {
        "name": "Сделана", "scheduled_on": str(tomorrow), "status": "done",
    })
    medication = post(client, headers, pet_url(pet_id, "medications"), {
        "name": "Витамины", "dose": "1 мл", "start_date": str(tomorrow), "end_date": str(tomorrow + timedelta(days=1)),
        "times": ["08:00"],
    })
    client.put(
        pet_url(pet_id, f"medications/{medication['id']}/intakes"),
        headers=headers,
        json={"scheduled_for": f"{tomorrow}T08:00:00", "status": "taken"},
    )

    upcoming = client.get(f"{CALENDAR}/upcoming", headers=headers).json()
    titles = [item["title"] for item in upcoming]
    assert titles[0] == "Сегодня"
    assert set(titles) == {"Сегодня", "Завтра", "Витамины"}
    assert [item["date"] for item in upcoming if item["title"] == "Витамины"] == [
        str(tomorrow + timedelta(days=1))
    ]
    assert len(client.get(f"{CALENDAR}/upcoming", headers=headers, params={"limit": 1}).json()) == 1


def test_ics_export(client: TestClient, household) -> None:
    response = client.get(f"{CALENDAR}/export.ics", headers=household["headers"], params=OCTOBER)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    assert 'filename="petcare.ics"' in response.headers["content-disposition"]

    body = response.text
    assert body.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
    assert body.endswith("END:VCALENDAR\r\n")
    assert body.count("BEGIN:VEVENT") == 4
    # Visit at 11:00 Moscow is exported in UTC, one hour long.
    assert "DTSTART:20261022T080000Z\r\nDTEND:20261022T090000Z" in body
    # Vaccinations are all-day events.
    assert "DTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261006" in body
    # Commas are escaped in text values.
    assert "SUMMARY:Барсик: Комплексная\\, ревакцинация" in body
    assert f"UID:visit-{household['visit']['id']}@petcare" in body
    assert all(len(line.encode()) <= 75 for line in body.split("\r\n"))
    assert client.get(f"{CALENDAR}/export.ics").status_code == 401


def vevent(body: str, uid: str) -> str:
    start = body.index(f"UID:{uid}@petcare")
    return body[start:body.index("END:VEVENT", start)]


def test_ics_reminders(client: TestClient, household) -> None:
    headers = household["headers"]
    body = client.get(f"{CALENDAR}/export.ics", headers=headers, params=OCTOBER).text

    # Visit: a day before and an hour before.
    visit = vevent(body, f"visit-{household['visit']['id']}")
    assert visit.count("BEGIN:VALARM") == 2
    assert "TRIGGER:-P1D" in visit and "TRIGGER:-PT1H" in visit
    assert "ACTION:DISPLAY\r\nTRIGGER:-PT1H\r\nDESCRIPTION:Рекс: Плановый осмотр" in visit
    # All-day vaccination: 09:00 the day before and 09:00 on the day.
    vaccination = vevent(body, f"vaccination-{household['vaccination']['id']}")
    assert "TRIGGER:-PT15H" in vaccination and "TRIGGER:PT9H" in vaccination
    # Medication dose: right at dose time.
    assert "TRIGGER:PT0M" in body

    # A dose already taken gets no reminder.
    medication = household["praziquantel"]["id"]
    intake = {"scheduled_for": "2026-10-16T18:00:00", "status": "taken"}
    intakes = pet_url(household["barsik"], f"medications/{medication}/intakes")
    response = client.put(intakes, headers=headers, json=intake)
    assert response.status_code == 200, response.json()
    body = client.get(f"{CALENDAR}/export.ics", headers=headers, params=OCTOBER).text
    assert "TRIGGER:PT0M" in body  # the flea dose is still pending
    dose = body[body.index("SUMMARY:Барсик: Празиквантел"):]
    assert "BEGIN:VALARM" not in dose[:dose.index("END:VEVENT")]


def test_ics_parasite_treatment(client: TestClient, household) -> None:
    headers = household["headers"]
    treatment = post(client, headers, pet_url(household["rex"], "parasite-treatments"), {
        "kind": "external", "product_name": "Бравекто", "treated_on": "2026-07-20",
        "interval_days": 90,
    })
    response = client.get(f"{CALENDAR}/export.ics", headers=headers, params=OCTOBER)
    assert response.status_code == 200
    event = vevent(response.text, f"parasite-{treatment['id']}")
    assert "DTSTART;VALUE=DATE:20261018" in event
    assert "CATEGORIES:Обработка от паразитов" in event
    assert "TRIGGER:-PT15H" in event and "TRIGGER:PT9H" in event


def test_long_lines_are_folded_on_character_boundaries() -> None:
    line = "DESCRIPTION:" + "Празиквантел " * 20
    chunks = fold(line)
    assert len(chunks) > 1
    assert all(len(chunk.encode()) <= 75 for chunk in chunks)
    assert all(chunk.startswith(" ") for chunk in chunks[1:])
    assert "".join([chunks[0], *(chunk[1:] for chunk in chunks[1:])]) == line


def test_subscription_feed(client: TestClient, household) -> None:
    headers = household["headers"]
    assert client.get(f"{CALENDAR}/feed", headers=headers).json() == {
        "active": False, "timezone": None, "created_at": None,
    }

    created = client.post(f"{CALENDAR}/feed", headers=headers, json={"timezone": "Europe/Moscow"})
    assert created.status_code == 200
    path = created.json()["path"]
    assert path.startswith("/api/v1/calendar/feed/") and path.endswith(".ics")
    status = client.get(f"{CALENDAR}/feed", headers=headers).json()
    assert status["active"] is True
    assert status["timezone"] == "Europe/Moscow"

    # Readable without signing in; the token is the secret.
    feed = client.get(path)
    assert feed.status_code == 200
    assert feed.headers["content-type"].startswith("text/calendar")
    assert "BEGIN:VCALENDAR" in feed.text

    rotated = client.post(f"{CALENDAR}/feed", headers=headers, json={}).json()["path"]
    assert rotated != path
    assert client.get(path).status_code == 404
    assert client.get(rotated).status_code == 200

    assert client.delete(f"{CALENDAR}/feed", headers=headers).status_code == 204
    assert client.get(rotated).status_code == 404
    assert client.delete(f"{CALENDAR}/feed", headers=headers).status_code == 404
    assert client.post(f"{CALENDAR}/feed", headers=headers, json={"timezone": "Nowhere/City"}).status_code == 422
    assert client.get(f"{CALENDAR}/feed/not-a-token.ics").status_code == 404
