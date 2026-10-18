"""Yearly pet birthdays, derived from pets.birth_date (nothing is stored per year).
A pet known only by an approximate age has no date and gets no birthday events."""

import calendar
from collections.abc import Iterable, Iterator
from datetime import date

from app.models.pet import Pet
from app.schemas.calendar import CalendarEvent, CalendarEventType

UPCOMING = "planned"
PAST = "past"


def birthday_in(birth: date, year: int) -> date:
    """The birthday in a given year; Feb 29 falls on Feb 28 in common years."""
    if birth.month == 2 and birth.day == 29 and not calendar.isleap(year):
        return date(year, 2, 28)
    return birth.replace(year=year)


def years_word(age: int) -> str:
    if age % 10 == 1 and age % 100 != 11:
        return "год"
    if 2 <= age % 10 <= 4 and not 12 <= age % 100 <= 14:
        return "года"
    return "лет"


def birthdays(birth: date, start: date, end: date) -> Iterator[tuple[date, int]]:
    """(date, age) of every birthday within [start, end], from the first one on."""
    for year in range(max(start.year, birth.year + 1), end.year + 1):
        day = birthday_in(birth, year)
        if start <= day <= end:
            yield day, year - birth.year


def birthday_events(
    pets: Iterable[Pet], start: date, end: date, today: date
) -> list[CalendarEvent]:
    events = []
    for pet in pets:
        if pet.birth_date is None:
            continue
        for day, age in birthdays(pet.birth_date, start, end):
            events.append(
                CalendarEvent(
                    id=f"birthday-{pet.id}-{day.year}",
                    type=CalendarEventType.BIRTHDAY,
                    pet_id=pet.id,
                    pet_name=pet.name,
                    title=f"День рождения, {age} {years_word(age)}",
                    detail=None,
                    date=day,
                    time=None,
                    status=UPCOMING if day >= today else PAST,
                    source_id=pet.id,
                )
            )
    return events
