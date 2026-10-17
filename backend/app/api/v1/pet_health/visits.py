from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncDbSession, OwnedPet
from app.models.health import VetVisit, VisitStatus
from app.schemas.health import (
    VetVisitCreate,
    VetVisitPublic,
    VetVisitUpdate,
    VisitTopic,
    VisitTopicGraph,
)
from app.services.health.common import clean_label, get_pet_child, patch_changes, save
from app.services.health.visits import (
    detach_referrals,
    list_topics,
    load_visits,
    topic_graph,
    validate_referral,
)


router = APIRouter(prefix="/pets/{pet_id}/visits", tags=["pet health: vet visits"])
NOT_FOUND = "Visit not found"


@router.post("", response_model=VetVisitPublic, status_code=status.HTTP_201_CREATED)
async def create_visit(pet: OwnedPet, payload: VetVisitCreate, db: AsyncDbSession) -> VetVisit:
    await validate_referral(db, pet.id, None, payload.referred_by_visit_id)
    fields = payload.model_dump()
    if fields["topic"] is not None:
        fields["topic"] = clean_label(fields["topic"])
    return await save(db, VetVisit(pet_id=pet.id, **fields))


@router.get(
    "",
    response_model=list[VetVisitPublic],
    summary="List visits",
    description="Planned visits are ordered soonest first, all others latest first.",
)
async def list_visits(
    pet: OwnedPet,
    db: AsyncDbSession,
    status_filter: VisitStatus | None = Query(default=None, alias="status"),
) -> list[VetVisit]:
    query = select(VetVisit).where(VetVisit.pet_id == pet.id)
    if status_filter is not None:
        query = query.where(VetVisit.status == status_filter)
    if status_filter is VisitStatus.PLANNED:
        query = query.order_by(VetVisit.visit_at, VetVisit.id)
    else:
        query = query.order_by(VetVisit.visit_at.desc(), VetVisit.id.desc())
    return list(await db.scalars(query))


@router.get(
    "/topics",
    response_model=list[VisitTopic],
    summary="Visit topics with counts",
    description="Topics are matched case-insensitively; the most frequent comes first.",
)
async def get_topics(pet: OwnedPet, db: AsyncDbSession) -> list[VisitTopic]:
    return list_topics(await load_visits(db, pet.id))


@router.get(
    "/topics/graph",
    response_model=VisitTopicGraph,
    summary="Visits of one topic and who referred whom",
)
async def get_topic_graph(
    pet: OwnedPet, db: AsyncDbSession, topic: str = Query(min_length=1, max_length=255)
) -> VisitTopicGraph:
    graph = topic_graph(await load_visits(db, pet.id), topic)
    if graph is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
    return graph


@router.get("/{visit_id}", response_model=VetVisitPublic)
async def get_visit(pet: OwnedPet, visit_id: int, db: AsyncDbSession) -> VetVisit:
    return await get_pet_child(db, VetVisit, pet.id, visit_id, NOT_FOUND)


@router.patch("/{visit_id}", response_model=VetVisitPublic)
async def update_visit(
    pet: OwnedPet, visit_id: int, payload: VetVisitUpdate, db: AsyncDbSession
) -> VetVisit:
    visit = await get_pet_child(db, VetVisit, pet.id, visit_id, NOT_FOUND)
    changes = patch_changes(payload, {"title", "visit_at", "reason", "status"})
    if "referred_by_visit_id" in changes:
        await validate_referral(db, pet.id, visit.id, changes["referred_by_visit_id"])
    if changes.get("topic") is not None:
        changes["topic"] = clean_label(changes["topic"])
    for field, value in changes.items():
        setattr(visit, field, value)
    return await save(db, visit)


@router.delete(
    "/{visit_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    description="Visits referred by this one keep existing with referred_by_visit_id cleared.",
)
async def delete_visit(pet: OwnedPet, visit_id: int, db: AsyncDbSession) -> None:
    visit = await get_pet_child(db, VetVisit, pet.id, visit_id, NOT_FOUND)
    await detach_referrals(db, visit.id)
    await db.delete(visit)
    await db.commit()
