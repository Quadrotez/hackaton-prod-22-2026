from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.services.birthdays import birthday_in, birthdays, years_word
from tests.health_helpers import auth_headers, local_today

CALENDAR = "/api/v1/calendar"


def create_pet(client: TestClient, headers: dict[str, str], name: str, **fields) -> int:
    body = {"name": name, "species": "cat", "sex": "girl", "weight_g": 4000} | fields
    response = client.post("/api/v1/pets/", headers=headers, json=body)
    assert response.status_code == 201, response.json()
    return response.json()["id"]


def events(client: TestClient, headers: dict[str, str], start: str, end: str, **params) -> list[dict]:
    response = client.get(
        f"{CALENDAR}/events", headers=headers, params={"from": start, "to": end} | params
    )
    assert response.status_code == 200, response.json()
    return [item for item in response.json() if item["type"] == "birthday"]


@pytest.mark.parametrize(
    ("age", "word"),
    [(1, "год"), (2, "года"), (4, "года"), (5, "лет"), (11, "лет"), (12, "лет"),
     (14, "лет"), (21, "год"), (22, "года"), (25, "лет"), (101, "год"), (111, "лет")],
)
def test_years_word(age: int, word: str) -> None:
    assert years_word(age) == word


def test_leap_day_birthday_falls_on_feb_28_in_common_years() -> None:
    birth = date(2020, 2, 29)
    assert birthday_in(birth, 2023) == date(2023, 2, 28)
    assert birthday_in(birth, 2024) == date(2024, 2, 29)
    assert list(birthdays(birth, date(2021, 1, 1), date(2024, 12, 31))) == [
        (date(2021, 2, 28), 1), (date(2022, 2, 28), 2), (date(2023, 2, 28), 3), (date(2024, 2, 29), 4),
    ]


def test_first_birthday_is_a_year_after_birth() -> None:
    birth = date(2026, 3, 12)
    assert list(birthdays(birth, date(2026, 1, 1), date(2027, 12, 31))) == [(date(2027, 3, 12), 1)]


def test_birthdays_in_calendar(client: TestClient) -> None:
    headers = auth_headers(client, "anna@example.com")
    barsik = create_pet(client, headers, "Барсик", birth_date="2023-03-12")
    create_pet(client, headers, "Кеша", approximate_age_years=2)
    create_pet(client, headers, "Без даты")

    listed = events(client, headers, "2026-03-01", "2027-03-31")
    assert [(item["date"], item["title"], item["pet_name"]) for item in listed] == [
        ("2026-03-12", "День рождения, 3 года", "Барсик"),
        ("2027-03-12", "День рождения, 4 года", "Барсик"),
    ]
    first = listed[0]
    assert first["id"] == f"birthday-{barsik}-2026"
    assert (first["time"], first["detail"], first["source_id"]) == (None, None, barsik)

    # Only events within the range, and none before the first birthday.
    assert events(client, headers, "2026-03-13", "2027-03-11") == []
    assert events(client, headers, "2023-01-01", "2023-12-31") == []


def test_status_and_upcoming(client: TestClient) -> None:
    headers = auth_headers(client, "anna@example.com")
    today = local_today()
    if (today.month, today.day) in ((2, 29), (3, 1)):
        pytest.skip("leap-day dates are covered by test_leap_day_birthday_falls_on_feb_28_in_common_years")
    # Born three years ago today, and one born three years ago yesterday.
    create_pet(client, headers, "Сегодня", birth_date=str(today.replace(year=today.year - 3)))
    yesterday = today - timedelta(days=1)
    create_pet(client, headers, "Вчера", birth_date=str(yesterday.replace(year=yesterday.year - 3)))

    listed = {item["pet_name"]: item for item in events(client, headers, str(yesterday), str(today))}
    assert listed["Сегодня"]["status"] == "planned"
    assert listed["Вчера"]["status"] == "past"

    upcoming = client.get(f"{CALENDAR}/upcoming", headers=headers).json()
    names = [item["pet_name"] for item in upcoming if item["type"] == "birthday"]
    assert names == ["Сегодня"]


def test_future_birth_date_and_type_filter(client: TestClient) -> None:
    headers = auth_headers(client, "anna@example.com")
    create_pet(client, headers, "Будущий", birth_date=str(local_today() + timedelta(days=30)))
    create_pet(client, headers, "Барсик", birth_date="2023-03-12")

    only_birthdays = client.get(
        f"{CALENDAR}/events", headers=headers,
        params={"from": "2026-01-01", "to": "2026-12-31", "type": "birthday"},
    ).json()
    assert [(item["type"], item["pet_name"]) for item in only_birthdays] == [("birthday", "Барсик")]
    without = client.get(
        f"{CALENDAR}/events", headers=headers,
        params={"from": "2026-01-01", "to": "2026-12-31", "type": "visit"},
    ).json()
    assert without == []


def test_birthday_in_ics(client: TestClient) -> None:
    headers = auth_headers(client, "anna@example.com")
    today = local_today()
    # Next birthday in 30 days (turning 3), the previous one about 11 months ago.
    upcoming = today + timedelta(days=30)
    if upcoming.month == 2 and upcoming.day == 29:
        upcoming += timedelta(days=1)
    pet_id = create_pet(client, headers, "Барсик", birth_date=str(upcoming.replace(year=upcoming.year - 3)))
    body = client.get(
        f"{CALENDAR}/export.ics",
        headers=headers,
        params={"from": str(today - timedelta(days=340)), "to": str(today + timedelta(days=40))},
    ).text
    chunks = {
        chunk.split("UID:", 1)[1].split("\r\n", 1)[0]: chunk for chunk in body.split("BEGIN:VEVENT")[1:]
    }
    future = chunks[f"birthday-{pet_id}-{upcoming.year}@petcare"]
    next_day = upcoming + timedelta(days=1)
    assert f"DTSTART;VALUE=DATE:{upcoming:%Y%m%d}\r\nDTEND;VALUE=DATE:{next_day:%Y%m%d}" in future
    assert "SUMMARY:Барсик: День рождения\\, 3 года" in future
    assert "CATEGORIES:День рождения" in future
    # Only on the day, at 09:00; no reminder the day before.
    assert future.count("BEGIN:VALARM") == 1
    assert "TRIGGER:PT9H" in future
    # The previous birthday is past and carries no reminder.
    past = chunks[f"birthday-{pet_id}-{upcoming.year - 1}@petcare"]
    assert "BEGIN:VALARM" not in past


def test_birthdays_are_isolated(client: TestClient) -> None:
    owner = auth_headers(client, "anna@example.com")
    stranger = auth_headers(client, "eve@example.com")
    pet_id = create_pet(client, owner, "Барсик", birth_date="2023-03-12")
    assert events(client, stranger, "2026-01-01", "2026-12-31") == []
    foreign = client.get(f"{CALENDAR}/events", headers=stranger, params={"pet_id": pet_id})
    assert foreign.status_code == 404
