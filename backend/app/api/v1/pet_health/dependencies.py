from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, Query

from app.services.health.common import DEFAULT_TIMEZONE, unprocessable


def get_timezone(
    tz: str = Query(
        default=DEFAULT_TIMEZONE,
        description="IANA timezone of the owner; defines 'today' and local dose times.",
    ),
) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise unprocessable("Unknown timezone") from None


LocalTimezone = Annotated[ZoneInfo, Depends(get_timezone)]
