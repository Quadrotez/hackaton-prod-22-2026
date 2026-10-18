"""Auto-calculation of the next due date for repeated procedures.

Vaccinations and parasite treatments may have an optional repeat interval. When
the interval is set and the user did not pick an explicit next date, the server
derives ``next_due_on`` from the procedure date. An explicit date always wins.
"""

from datetime import date, timedelta


def compute_next_due(
    anchor: date, interval_days: int | None, explicit: date | None
) -> date | None:
    """Return the next due date: explicit wins, else anchor + interval, else None."""
    if explicit is not None:
        return explicit
    if interval_days is None:
        return None
    return anchor + timedelta(days=interval_days)
