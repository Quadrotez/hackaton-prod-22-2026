import hashlib
import logging
import secrets
from datetime import date, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncCurrentUser, AsyncDbSession
from app.api.v1.pet_health.dependencies import LocalTimezone
from app.core.log import annotate_request, bind_user
from app.models.calendar import CalendarFeed
from app.models.pet import Pet
from app.schemas.calendar import (
    CalendarEvent,
    CalendarEventType,
    CalendarFeedCreate,
    CalendarFeedLink,
    CalendarFeedStatus,
)
from app.services.calendar import MAX_RANGE_DAYS, collect_events, load_pets, upcoming_events
from app.services.calendar_ics import render_calendar
from app.services.health.common import local_today, unprocessable

router = APIRouter(prefix="/calendar", tags=["calendar"])
logger = logging.getLogger(__name__)

DEFAULT_GRID_DAYS = 42  # six weeks, a full month grid
EXPORT_PAST_DAYS = 30
EXPORT_FUTURE_DAYS = 365
ICS_MEDIA_TYPE = "text/calendar; charset=utf-8"
FEED_PREFIX = "/api/v1/calendar/feed"


def check_range(start: date, end: date) -> None:
    if end < start:
        raise unprocessable("to must not be before from")
    if (end - start).days >= MAX_RANGE_DAYS:
        raise unprocessable(f"The range must not exceed {MAX_RANGE_DAYS} days")


async def pets_for(db: AsyncDbSession, user_id: int, pet_id: int | None) -> list[Pet]:
    pets = await load_pets(db, user_id, pet_id)
    if pet_id is not None and not pets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found")
    return pets


def ics_response(body: str, filename: str | None = None) -> Response:
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'} if filename else {}
    return Response(content=body, media_type=ICS_MEDIA_TYPE, headers=headers)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def export_range(tz: ZoneInfo) -> tuple[date, date]:
    today = local_today(tz)
    return today - timedelta(days=EXPORT_PAST_DAYS), today + timedelta(days=EXPORT_FUTURE_DAYS)


@router.get(
    "/events",
    response_model=list[CalendarEvent],
    summary="Events of all the caller's pets in a date range",
    description=(
        "Vet visits (cancelled ones are left out), vaccinations as all-day events and "
        "medication doses with their intake status. Dates and times are local to tz. "
        f"Defaults to {DEFAULT_GRID_DAYS} days from today; at most {MAX_RANGE_DAYS} days."
    ),
)
async def list_events(
    current_user: AsyncCurrentUser,
    db: AsyncDbSession,
    tz: LocalTimezone,
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    pet_id: int | None = None,
    types: list[CalendarEventType] | None = Query(default=None, alias="type"),
) -> list[CalendarEvent]:
    start = start or local_today(tz)
    end = end or start + timedelta(days=DEFAULT_GRID_DAYS - 1)
    check_range(start, end)
    pets = await pets_for(db, current_user.id, pet_id)
    return await collect_events(db, pets, start, end, tz, types or tuple(CalendarEventType))


@router.get(
    "/upcoming",
    response_model=list[CalendarEvent],
    summary="Nearest events still to happen",
    description="Planned visits and vaccinations and pending doses, soonest first.",
)
async def list_upcoming(
    current_user: AsyncCurrentUser,
    db: AsyncDbSession,
    tz: LocalTimezone,
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=10, ge=1, le=100),
    pet_id: int | None = None,
) -> list[CalendarEvent]:
    pets = await pets_for(db, current_user.id, pet_id)
    return await upcoming_events(db, pets, tz, days, limit)


@router.get(
    "/export.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}},
    summary="Download events as an .ics file",
    description=(
        f"Defaults to {EXPORT_PAST_DAYS} days back and {EXPORT_FUTURE_DAYS} days ahead. "
        "Opens in Google Calendar, Apple Calendar and Outlook."
    ),
)
async def export_ics(
    current_user: AsyncCurrentUser,
    db: AsyncDbSession,
    tz: LocalTimezone,
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    pet_id: int | None = None,
) -> Response:
    default_start, default_end = export_range(tz)
    start, end = start or default_start, end or default_end
    check_range(start, end)
    pets = await pets_for(db, current_user.id, pet_id)
    events = await collect_events(db, pets, start, end, tz)
    annotate_request(events=len(events))
    return ics_response(render_calendar(events, tz), filename="petcare.ics")


# --- Subscription feed --------------------------------------------------------------------


@router.get("/feed", response_model=CalendarFeedStatus, summary="Is a subscription link active")
async def get_feed(current_user: AsyncCurrentUser, db: AsyncDbSession) -> CalendarFeedStatus:
    feed = await db.scalar(select(CalendarFeed).where(CalendarFeed.user_id == current_user.id))
    if feed is None:
        return CalendarFeedStatus(active=False, timezone=None, created_at=None)
    return CalendarFeedStatus(active=True, timezone=feed.timezone, created_at=feed.created_at)


@router.post(
    "/feed",
    response_model=CalendarFeedLink,
    summary="Create or replace the subscription link",
    description=(
        "Returns a secret .ics path that calendars can subscribe to without signing in. "
        "Creating a new link revokes the previous one. The token is not stored, so it "
        "cannot be shown again."
    ),
)
async def create_feed(
    payload: CalendarFeedCreate,
    current_user: AsyncCurrentUser,
    db: AsyncDbSession,
    tz: LocalTimezone,
) -> CalendarFeedLink:
    timezone = tz.key
    if payload.timezone is not None:
        try:
            timezone = ZoneInfo(payload.timezone).key
        except (ZoneInfoNotFoundError, ValueError):
            raise unprocessable("Unknown timezone") from None

    token = secrets.token_urlsafe(32)
    feed = await db.scalar(select(CalendarFeed).where(CalendarFeed.user_id == current_user.id))
    rotated = feed is not None
    if feed is None:
        feed = CalendarFeed(user_id=current_user.id)
        db.add(feed)
    feed.token_hash, feed.timezone = hash_token(token), timezone
    await db.commit()
    await db.refresh(feed)
    logger.info(
        "Calendar feed link %s",
        "rotated" if rotated else "created",
        extra={"event": "calendar.feed_issued", "rotated": rotated, "timezone": timezone},
    )
    return CalendarFeedLink(
        active=True,
        timezone=feed.timezone,
        created_at=feed.created_at,
        path=f"{FEED_PREFIX}/{token}.ics",
    )


@router.delete("/feed", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke the link")
async def delete_feed(current_user: AsyncCurrentUser, db: AsyncDbSession) -> None:
    feed = await db.scalar(select(CalendarFeed).where(CalendarFeed.user_id == current_user.id))
    if feed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active feed")
    await db.delete(feed)
    await db.commit()
    logger.info("Calendar feed link revoked", extra={"event": "calendar.feed_revoked"})


@router.get(
    "/feed/{token}.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}},
    summary="Subscription feed (no sign-in, the token is the secret)",
)
async def read_feed(token: str, db: AsyncDbSession) -> Response:
    feed = await db.scalar(select(CalendarFeed).where(CalendarFeed.token_hash == hash_token(token)))
    if feed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")
    bind_user(feed.user_id)
    tz = ZoneInfo(feed.timezone)
    start, end = export_range(tz)
    events = await collect_events(db, await load_pets(db, feed.user_id), start, end, tz)
    annotate_request(events=len(events))
    return ics_response(render_calendar(events, tz))
