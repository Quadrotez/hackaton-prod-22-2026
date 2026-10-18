"""Minimal RFC 5545 (iCalendar) writer for the pet calendar."""

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.schemas.calendar import CalendarEvent, CalendarEventType

PRODID = "-//PetCare//Pet calendar//RU"
EVENT_LENGTH = {
    CalendarEventType.VISIT: timedelta(hours=1),
    CalendarEventType.MEDICATION: timedelta(minutes=15),
}
TYPE_LABEL = {
    CalendarEventType.VISIT: "Визит",
    CalendarEventType.VACCINATION: "Прививка",
    CalendarEventType.MEDICATION: "Лекарство",
    CalendarEventType.PARASITE: "Обработка от паразитов",
}
# Reminders as RFC 5545 durations relative to DTSTART. All-day events start at local
# midnight, so -PT15H is 09:00 the day before and PT9H is 09:00 on the day.
ALARM_TRIGGERS = {
    CalendarEventType.VISIT: ("-P1D", "-PT1H"),
    CalendarEventType.VACCINATION: ("-PT15H", "PT9H"),
    CalendarEventType.PARASITE: ("-PT15H", "PT9H"),
    CalendarEventType.MEDICATION: ("PT0M",),
}
# Done, taken or skipped events need no reminder.
ALARM_STATUSES = {"planned", "pending"}
MAX_LINE_OCTETS = 75


def escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def fold(line: str) -> list[str]:
    """Split a content line into chunks of at most 75 octets without breaking UTF-8."""
    chunks, current, size = [], "", 0
    for char in line:
        width = len(char.encode())
        limit = MAX_LINE_OCTETS if not chunks else MAX_LINE_OCTETS - 1  # continuation adds " "
        if size + width > limit:
            chunks.append(current)
            current, size = "", 0
        current += char
        size += width
    chunks.append(current)
    return [chunks[0], *(" " + chunk for chunk in chunks[1:])]


def utc_stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def alarm_lines(event: CalendarEvent, summary: str) -> list[str]:
    if event.status not in ALARM_STATUSES:
        return []
    lines = []
    for trigger in ALARM_TRIGGERS[event.type]:
        lines += [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"TRIGGER:{trigger}",
            f"DESCRIPTION:{escape(summary)}",
            "END:VALARM",
        ]
    return lines


def event_lines(event: CalendarEvent, tz: ZoneInfo, stamp: str) -> list[str]:
    lines = [
        "BEGIN:VEVENT",
        f"UID:{event.id}@petcare",
        f"DTSTAMP:{stamp}",
    ]
    if event.time is None:
        lines += [
            f"DTSTART;VALUE=DATE:{event.date:%Y%m%d}",
            f"DTEND;VALUE=DATE:{event.date + timedelta(days=1):%Y%m%d}",
        ]
    else:
        start = datetime.combine(event.date, event.time, tzinfo=tz)
        lines += [
            f"DTSTART:{utc_stamp(start)}",
            f"DTEND:{utc_stamp(start + EVENT_LENGTH[event.type])}",
        ]
    description = f"{TYPE_LABEL[event.type]} · {event.pet_name}"
    if event.detail:
        description += f" · {event.detail}"
    summary = f"{event.pet_name}: {event.title}"
    lines += [
        f"SUMMARY:{escape(summary)}",
        f"DESCRIPTION:{escape(description)}",
        f"CATEGORIES:{TYPE_LABEL[event.type]}",
        *alarm_lines(event, summary),
        "END:VEVENT",
    ]
    return lines


def render_calendar(events: Iterable[CalendarEvent], tz: ZoneInfo, name: str = "PetCare") -> str:
    stamp = utc_stamp(datetime.now(UTC))
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape(name)}",
        f"X-WR-TIMEZONE:{tz.key}",
    ]
    for event in events:
        lines += event_lines(event, tz, stamp)
    lines.append("END:VCALENDAR")
    return "".join(f"{chunk}\r\n" for line in lines for chunk in fold(line))
