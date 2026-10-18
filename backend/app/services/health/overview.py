from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feeding import FeedingRecord
from app.models.health import (
    Allergy,
    ParasiteTreatment,
    Symptom,
    Vaccination,
    VaccinationStatus,
    VisitStatus,
)
from app.models.pet import Pet
from app.schemas.health import (
    AllergyPublic,
    FeedingBrief,
    HealthOverview,
    HealthSummary,
    MedicationPublic,
    ParasiteTreatmentPublic,
    PetBrief,
    SymptomPublic,
    VaccinationPublic,
    VetVisitPublic,
    VisitTopic,
)
from app.services.health.common import local_now, local_today
from app.services.health.measurements import ensure_initialized, summarize
from app.services.health.pregnancy import active_pregnancy, to_public
from app.services.health.schedule import build_schedule, load_medications
from app.services.health.visits import list_topics, load_visits

OVERVIEW_SYMPTOMS = 5
UPCOMING_DAYS = 14
UPCOMING_DOSES = 20
SUMMARY_ITEMS = 5


async def recent_symptoms(db: AsyncSession, pet_id: int, limit: int) -> list[SymptomPublic]:
    symptoms = await db.scalars(
        select(Symptom)
        .where(Symptom.pet_id == pet_id)
        .order_by(Symptom.observed_at.desc(), Symptom.id.desc())
        .limit(limit)
    )
    return [SymptomPublic.model_validate(symptom) for symptom in symptoms]


async def all_allergies(db: AsyncSession, pet_id: int) -> list[AllergyPublic]:
    allergies = await db.scalars(
        select(Allergy).where(Allergy.pet_id == pet_id).order_by(Allergy.id)
    )
    return [AllergyPublic.model_validate(allergy) for allergy in allergies]


async def vaccinations_by_status(
    db: AsyncSession, pet_id: int, status: VaccinationStatus, limit: int | None = None
) -> list[VaccinationPublic]:
    # Planned ones soonest first, done ones latest first.
    order = Vaccination.scheduled_on.asc() if status is VaccinationStatus.PLANNED else (
        Vaccination.scheduled_on.desc()
    )
    query = (
        select(Vaccination)
        .where(Vaccination.pet_id == pet_id, Vaccination.status == status)
        .order_by(order, Vaccination.id)
        .limit(limit)
    )
    return [VaccinationPublic.model_validate(item) for item in await db.scalars(query)]


async def split_visits(
    db: AsyncSession, pet_id: int
) -> tuple[list[VetVisitPublic], list[VetVisitPublic], list[VisitTopic]]:
    visits = await load_visits(db, pet_id)
    planned = [visit for visit in reversed(visits) if visit.status is VisitStatus.PLANNED]
    past = [visit for visit in visits if visit.status is not VisitStatus.PLANNED]
    return (
        [VetVisitPublic.model_validate(visit) for visit in planned],
        [VetVisitPublic.model_validate(visit) for visit in past],
        list_topics(visits),
    )


async def next_vaccination(db: AsyncSession, pet_id: int, today: date) -> VaccinationPublic | None:
    """Soonest vaccination still ahead: explicit next date or the scheduled date."""
    vaccinations = await db.scalars(select(Vaccination).where(Vaccination.pet_id == pet_id))
    upcoming = [
        vaccination
        for vaccination in vaccinations
        if (vaccination.next_due_on or vaccination.scheduled_on) >= today
    ]
    if not upcoming:
        return None
    soonest = min(upcoming, key=lambda item: (item.next_due_on or item.scheduled_on, item.id))
    return VaccinationPublic.model_validate(soonest)


async def next_parasite(db: AsyncSession, pet_id: int, today: date) -> ParasiteTreatmentPublic | None:
    """Soonest parasite treatment repeat due on or after today."""
    treatment = await db.scalar(
        select(ParasiteTreatment)
        .where(
            ParasiteTreatment.pet_id == pet_id,
            ParasiteTreatment.next_due_on.is_not(None),
            ParasiteTreatment.next_due_on >= today,
        )
        .order_by(ParasiteTreatment.next_due_on, ParasiteTreatment.id)
        .limit(1)
    )
    return ParasiteTreatmentPublic.model_validate(treatment) if treatment else None


async def build_overview(db: AsyncSession, pet: Pet, tz: ZoneInfo) -> HealthOverview:
    today, now = local_today(tz), local_now(tz)
    await ensure_initialized(db, pet)
    pregnancy = await active_pregnancy(db, pet.id)
    schedule = await build_schedule(db, pet.id, today, today + timedelta(days=UPCOMING_DAYS - 1))
    planned_visits, past_visits, topics = await split_visits(db, pet.id)

    return HealthOverview(
        symptoms=await recent_symptoms(db, pet.id, OVERVIEW_SYMPTOMS),
        symptoms_total=await db.scalar(
            select(func.count()).select_from(Symptom).where(Symptom.pet_id == pet.id)
        ),
        pregnancy=to_public(pregnancy, today) if pregnancy else None,
        allergies=await all_allergies(db, pet.id),
        medications_today=[dose for dose in schedule if dose.scheduled_for.date() == today],
        upcoming_doses=[
            dose
            for dose in schedule
            if dose.status == "pending" and dose.scheduled_for >= now
        ][:UPCOMING_DOSES],
        planned_vaccinations=await vaccinations_by_status(db, pet.id, VaccinationStatus.PLANNED),
        planned_visits=planned_visits,
        past_visits=past_visits,
        top_topic=topics[0] if topics else None,
        measurements=await summarize(db, pet.id),
        next_vaccination=await next_vaccination(db, pet.id, today),
        next_parasite=await next_parasite(db, pet.id, today),
    )


async def build_summary(
    db: AsyncSession, pet: Pet, owner_email: str, tz: ZoneInfo
) -> HealthSummary:
    today = local_today(tz)
    now = datetime.now(UTC)
    pregnancy = await active_pregnancy(db, pet.id)
    planned_visits, past_visits, _ = await split_visits(db, pet.id)

    feedings = select(FeedingRecord).where(FeedingRecord.pet_id == pet.id)
    last_feeding = await db.scalar(
        feedings.order_by(FeedingRecord.fed_at.desc(), FeedingRecord.id.desc()).limit(1)
    )
    recent_foods = await db.scalars(
        select(FeedingRecord.food_name)
        .where(
            FeedingRecord.pet_id == pet.id,
            FeedingRecord.fed_at >= now - timedelta(days=30),
        )
        .order_by(FeedingRecord.fed_at.desc())
    )
    reactions = await db.scalars(
        feedings.where(
            FeedingRecord.fed_at >= now - timedelta(days=7),
            or_(FeedingRecord.tolerated.is_(False), FeedingRecord.reaction_notes.is_not(None)),
        ).order_by(FeedingRecord.fed_at.desc())
    )

    return HealthSummary(
        generated_on=today,
        pet=PetBrief.model_validate(pet),
        owner_email=owner_email,
        recent_symptoms=await recent_symptoms(db, pet.id, SUMMARY_ITEMS),
        last_feeding=FeedingBrief.model_validate(last_feeding) if last_feeding else None,
        foods_in_diet=list(dict.fromkeys(recent_foods)),
        feeding_reactions_last_week=[FeedingBrief.model_validate(item) for item in reactions],
        allergies=await all_allergies(db, pet.id),
        pregnancy=to_public(pregnancy, today) if pregnancy else None,
        past_visits=past_visits[:SUMMARY_ITEMS],
        planned_visits=planned_visits[:SUMMARY_ITEMS],
        done_vaccinations=await vaccinations_by_status(
            db, pet.id, VaccinationStatus.DONE, SUMMARY_ITEMS
        ),
        planned_vaccinations=await vaccinations_by_status(
            db, pet.id, VaccinationStatus.PLANNED, SUMMARY_ITEMS
        ),
        current_medications=[
            MedicationPublic.model_validate(medication)
            for medication in await load_medications(db, pet.id, today, today)
        ],
    )
