from collections.abc import Sequence
from datetime import UTC, datetime, time

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.health import VetVisit, VisitStatus
from app.schemas.health import VetVisitPublic, VisitEdge, VisitTopic, VisitTopicGraph
from app.services.health.common import label_key, unprocessable


def is_date_only(visit_at: datetime) -> bool:
    """A visit at exactly 00:00:00 UTC has a known date but no time. The document analyzer
    writes this when a document has no time; the frontend sends it for "time not set"
    (a real time that lands on 00:00:00 UTC is sent as 00:00:01)."""
    # SQLite hands timezone-aware columns back naive; values are written in UTC.
    moment = visit_at if visit_at.tzinfo is not None else visit_at.replace(tzinfo=UTC)
    return moment.astimezone(UTC).time() == time.min


async def load_visits(db: AsyncSession, pet_id: int) -> Sequence[VetVisit]:
    """All visits of a pet, most recent first."""
    return (
        await db.scalars(
            select(VetVisit)
            .where(VetVisit.pet_id == pet_id)
            .order_by(VetVisit.visit_at.desc(), VetVisit.id.desc())
        )
    ).all()


async def validate_referral(
    db: AsyncSession, pet_id: int, visit_id: int | None, referred_by_visit_id: int | None
) -> None:
    if referred_by_visit_id is None:
        return
    if referred_by_visit_id == visit_id:
        raise unprocessable("A visit cannot refer to itself")

    rows = await db.execute(
        select(VetVisit.id, VetVisit.referred_by_visit_id).where(VetVisit.pet_id == pet_id)
    )
    parents = {row_id: parent_id for row_id, parent_id in rows}
    if referred_by_visit_id not in parents:
        raise unprocessable("referred_by_visit_id must reference a visit of the same pet")

    # Walk up the referral chain from the new parent; reaching this visit means a cycle.
    current, seen = referred_by_visit_id, set()
    while current is not None and current not in seen:
        if current == visit_id:
            raise unprocessable("Referral chain must not form a cycle")
        seen.add(current)
        current = parents.get(current)


async def detach_referrals(db: AsyncSession, visit_id: int) -> None:
    # Mirrors ON DELETE SET NULL for databases that do not enforce foreign keys (SQLite).
    await db.execute(
        update(VetVisit)
        .where(VetVisit.referred_by_visit_id == visit_id)
        .values(referred_by_visit_id=None)
    )


def count_topic(topic: str, visits: Sequence[VetVisit]) -> VisitTopic:
    statuses = [visit.status for visit in visits]
    return VisitTopic(
        topic=topic,
        total=len(visits),
        planned=statuses.count(VisitStatus.PLANNED),
        completed=statuses.count(VisitStatus.COMPLETED),
        cancelled=statuses.count(VisitStatus.CANCELLED),
    )


def group_by_topic(visits: Sequence[VetVisit]) -> dict[str, tuple[str, list[VetVisit]]]:
    """key -> (display label, visits); the label is the spelling of the latest visit."""
    groups: dict[str, tuple[str, list[VetVisit]]] = {}
    for visit in visits:  # expected most recent first
        if visit.topic is None:
            continue
        label, members = groups.setdefault(label_key(visit.topic), (visit.topic, []))
        members.append(visit)
    return groups


def list_topics(visits: Sequence[VetVisit]) -> list[VisitTopic]:
    topics = [count_topic(label, members) for label, members in group_by_topic(visits).values()]
    return sorted(topics, key=lambda topic: (-topic.total, label_key(topic.topic)))


def topic_graph(visits: Sequence[VetVisit], topic: str) -> VisitTopicGraph | None:
    group = group_by_topic(visits).get(label_key(topic))
    if group is None:
        return None
    label, members = group
    ids = {visit.id for visit in members}
    ordered = sorted(members, key=lambda visit: (visit.visit_at, visit.id))
    return VisitTopicGraph(
        **count_topic(label, members).model_dump(),
        visits=[VetVisitPublic.model_validate(visit) for visit in ordered],
        edges=[
            VisitEdge(from_visit_id=visit.referred_by_visit_id, to_visit_id=visit.id)
            for visit in ordered
            if visit.referred_by_visit_id in ids
        ],
    )
