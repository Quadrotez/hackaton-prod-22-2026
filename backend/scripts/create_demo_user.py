"""Create (or rebuild) the demo accounts used by the frontend demo-login buttons.

Idempotent: safe to run on every deploy. Each demo account is deleted together
with its data and seeded again, so the published credentials always work and
the dates stay relative to today (vaccinations due soon, a fresh feeding log).

Usage:
    python scripts/create_demo_user.py

Environment overrides:
    DEMO_EMAIL     (default: demo@quadrotez.com) - email of the main demo account
    DEMO_PASSWORD  (default: demo) - password of every demo account
    DEMO_NAME      (default: Демо) - name of the main demo account

Keep DEMO_ACCOUNTS in sync with frontend/lib/demo-accounts.ts.
"""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

# Allow running this file directly (``python scripts/create_demo_user.py``).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, or_, select

import app.models  # noqa: F401  (register all models for relationship resolution)
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.feeding import FeedingRecord
from app.models.food import Food, FoodStock, FoodType
from app.models.health import (
    Allergy,
    IntakeStatus,
    Measurement,
    MeasurementParameter,
    MeasurementProfile,
    Medication,
    MedicationIntake,
    MedicationTime,
    ParasiteKind,
    ParasiteTreatment,
    Pregnancy,
    Symptom,
    Vaccination,
    VaccinationStatus,
    VetVisit,
    VisitStatus,
)
from app.models.pet import Pet, PetSex
from app.models.pet_weight import PetWeight
from app.models.transfer import PetTransfer, TransferDuration, TransferStatus
from app.models.user import User

TZ = ZoneInfo("Europe/Moscow")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "demo")
MAIN_EMAIL = os.environ.get("DEMO_EMAIL", "demo@quadrotez.com").strip().lower()
MAIN_NAME = os.environ.get("DEMO_NAME", "Демо")

# (email, name) of every demo account, in the order the login buttons show them.
DEMO_ACCOUNTS: tuple[tuple[str, str], ...] = (
    (MAIN_EMAIL, MAIN_NAME),
    ("family@quadrotez.com", "Анна Смирнова"),
    ("pregnancy@quadrotez.com", "Иван Петров"),
    ("senior@quadrotez.com", "Ольга Новикова"),
    ("hamster@quadrotez.com", "Сергей Волков"),
)


def at(day: date, hour: int, minute: int = 0) -> datetime:
    """Aware Moscow-time moment on the given day."""
    return datetime.combine(day, time(hour, minute), tzinfo=TZ)


def wall(day: date, hour: int, minute: int = 0) -> datetime:
    """Naive wall-clock moment, as stored for medication intakes."""
    return datetime.combine(day, time(hour, minute))


def days_ago(today: date, days: int) -> date:
    return today - timedelta(days=days)


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year, month = day.year + month_index // 12, month_index % 12 + 1
    return day.replace(year=year, month=month, day=min(day.day, 28))


def reset_user(session, email: str) -> None:
    """Remove a previous demo account with all its data (pets, foods, transfers)."""
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        return
    session.execute(
        delete(PetTransfer).where(
            or_(PetTransfer.owner_id == user.id, PetTransfer.recipient_id == user.id)
        )
    )
    session.delete(user)
    session.flush()


def new_user(session, email: str, name: str) -> User:
    user = User(email=email, name=name, password_hash=hash_password(DEMO_PASSWORD))
    session.add(user)
    session.flush()
    return user


def new_pet(user: User, **fields) -> Pet:
    # Appended explicitly: SQLAlchemy 2.0 does not cascade a backref assignment into the session.
    pet = Pet(**fields)
    user.pets.append(pet)
    return pet


def new_food(user: User, **fields) -> Food:
    food = Food(**fields)
    user.foods.append(food)
    return food


def add_weights(pet: Pet, points: list[tuple[date, int]]) -> None:
    for day, grams in points:
        pet.weight_history.append(PetWeight(weight_g=grams, measured_at=at(day, 9)))


def add_template_measurements(pet: Pet, template: str, today: date) -> None:
    """Body measurements, as the app creates them from the species template."""
    pet.measurement_profile = MeasurementProfile(template=template)
    params = [
        ("Рост в холке", "см", 10, [(-60, 26.0), (-20, 26.5), (0, 27.0)]),
        ("Длина тела", "см", 20, [(-60, 46.0), (0, 47.5)]),
        ("Обхват груди", "см", 30, [(-60, 33.0), (-30, 33.5), (0, 34.0)]),
        ("Температура", "°C", 50, [(-30, 38.6), (-5, 38.9), (0, 38.7)]),
    ]
    for name, unit, order, points in params:
        parameter = MeasurementParameter(name=name, unit=unit, sort_order=order)
        pet.measurement_parameters.append(parameter)
        for offset, value in points:
            parameter.measurements.append(
                Measurement(value=value, measured_at=at(days_ago(today, -offset), 10))
            )


def add_doses(
    medication: Medication, today: date, days: int, hour: int, skipped: tuple[int, ...] = ()
) -> None:
    """Daily intakes for the last `days` days; `skipped` are day offsets missed by the owner."""
    medication.times.append(MedicationTime(time_of_day=time(hour, 0)))
    for offset in range(days, 0, -1):
        day = days_ago(today, offset)
        if day < medication.start_date:
            continue
        status = IntakeStatus.SKIPPED if offset in skipped else IntakeStatus.TAKEN
        medication.intakes.append(
            MedicationIntake(scheduled_for=wall(day, hour), status=status)
        )


def add_feedings(
    pet: Pet,
    today: date,
    foods: list[tuple[Food | None, str, int]],
    days: int,
    hour: int = 8,
    notes: dict[int, str] | None = None,
) -> None:
    """Feeding log: every day one feeding with a rotating food from `foods`."""
    notes = notes or {}
    for offset in range(days, 0, -1):
        food, name, grams = foods[offset % len(foods)]
        pet.feeding_records.append(
            FeedingRecord(
                food=food,
                food_name=name,
                amount_grams=grams,
                fed_at=at(days_ago(today, offset), hour + offset % 3),
                liked=offset % 7 != 0,
                tolerated=True,
                notes=notes.get(offset),
            )
        )


def seed_main(session, user: User, today: date) -> None:
    """Полный набор разделов на одном питомце: кошка Барсик."""
    pet = new_pet(
        user,
        name="Барсик",
        species="cat",
        sex=PetSex.BOY,
        breed="Британская короткошёрстная",
        birth_date=days_ago(today, 365 * 3 + 40),
        weight_g=4200,
    )
    add_weights(
        pet,
        [(days_ago(today, 120), 3900), (days_ago(today, 60), 4050), (days_ago(today, 14), 4150), (today, 4200)],
    )
    add_template_measurements(pet, "cat", today)

    food_dry = new_food(user, name="Royal Canin British Shorthair", type=FoodType.DRY,
                    protein=34, fats=15, carbohydrates=32, calories=3900)
    food_wet = new_food(user, name="Консервы Gourmet Gold, курица", type=FoodType.WET,
                    protein=10, fats=5, carbohydrates=2, calories=1000)
    food_treat = new_food(user, name="Лакомство Dreamies, лосось", type=FoodType.TREAT,
                      protein=32, fats=10, carbohydrates=3, calories=3600)
    food_dry.stock = FoodStock(user=user, total_grams=2000, remaining_grams=640)
    food_wet.stock = FoodStock(user=user, total_grams=4000, remaining_grams=2600)
    food_treat.stock = FoodStock(user=user, total_grams=500, remaining_grams=320)
    add_feedings(
        pet,
        today,
        [(food_dry, "Royal Canin British Shorthair", 60), (food_wet, "Консервы Gourmet Gold, курица", 85),
         (food_dry, "Royal Canin British Shorthair", 60), (food_treat, "Лакомство Dreamies, лосось", 10)],
        days=30,
        notes={3: "Съел всё до последней крошки", 9: "Немного оставил"},
    )
    pet.feeding_records.append(
        FeedingRecord(
            food=food_wet,
            food_name="Консервы Gourmet Gold, ягнёнок",
            amount_grams=85,
            fed_at=at(days_ago(today, 4), 19),
            liked=False,
            tolerated=False,
            digestive_reaction=True,
            reaction_notes="Рвота через час, после ягнёнка",
        )
    )

    pet.vaccinations.extend([
        Vaccination(name="Нобивак Tricat (комплекс)", scheduled_on=days_ago(today, 200),
                    status=VaccinationStatus.DONE, clinic="Ветклиника «Айболит»",
                    interval_days=365, next_due_on=days_ago(today, -165)),
        Vaccination(name="Бешенство", scheduled_on=days_ago(today, 200),
                    status=VaccinationStatus.DONE, clinic="Ветклиника «Айболит»", interval_days=365,
                    next_due_on=days_ago(today, -165)),
        Vaccination(name="Ревакцинация Tricat", scheduled_on=days_ago(today, -20),
                    status=VaccinationStatus.PLANNED, clinic="Ветклиника «Айболит»",
                    notes="Взять паспорт и документы о прошлой прививке"),
        Vaccination(name="Антирабическая вакцина", scheduled_on=days_ago(today, -90),
                    status=VaccinationStatus.PLANNED),
    ])
    pet.parasite_treatments.extend([
        ParasiteTreatment(kind=ParasiteKind.INTERNAL, product_name="Профендер (капли на холке)",
                          treated_on=days_ago(today, 60), interval_days=90,
                          next_due_on=days_ago(today, -30), clinic="Ветклиника «Айболит»"),
        ParasiteTreatment(kind=ParasiteKind.EXTERNAL, product_name="Адвантикс, 1 пипетка",
                          treated_on=days_ago(today, 25), interval_days=30,
                          next_due_on=days_ago(today, -5), notes="Чесался после прогулки"),
    ])
    pet.allergies.extend([
        Allergy(allergen="Курица", reactions="Зуд, покраснение морды", notes="Подтверждено анализом"),
        Allergy(allergen="Пыльца амброзии", reactions="Чихание, слезотечение летом"),
    ])
    pet.symptoms.extend([
        Symptom(description="Вялость после обработки, прошла за сутки",
                observed_at=at(days_ago(today, 25), 20)),
        Symptom(description="Частая чистка шерсти, появился небольшой комочек",
                observed_at=at(days_ago(today, 9), 12)),
        Symptom(description="Аппетит снижен на полдня", observed_at=at(days_ago(today, 2), 18)),
    ])

    pet.vet_visits.extend([
        VetVisit(user=user, title="Плановый осмотр", visit_at=at(days_ago(today, 200), 11),
                 doctor_name="Елена Соколова", doctor_specialty="Терапевт", reason="checkup",
                 visit_price=Decimal("1800.00"), clinic="Ветклиника «Айболит»", status=VisitStatus.COMPLETED,
                 diagnosis="Здоров, зубы в норме", post_visit_instructions="Контроль веса через 3 месяца",
                 topic="Профилактика"),
        VetVisit(user=user, title="Аллергическая реакция на корм", visit_at=at(days_ago(today, 90), 15),
                 doctor_name="Дмитрий Орлов", doctor_specialty="Дерматолог", reason="illness",
                 visit_price=Decimal("2600.00"), clinic="Клиника «Зоостатус»", status=VisitStatus.COMPLETED,
                 diagnosis="Пищевая аллергия на курицу", topic="Аллергия",
                 post_visit_instructions="Исключить курицу, гипоаллергенный корм 8 недель"),
        VetVisit(user=user, title="Контроль после диеты", visit_at=at(days_ago(today, -12), 16),
                 doctor_name="Дмитрий Орлов", doctor_specialty="Дерматолог", reason="checkup",
                 clinic="Клиника «Зоостатус»", status=VisitStatus.PLANNED, topic="Аллергия"),
        VetVisit(user=user, title="Вакцинация", visit_at=at(days_ago(today, -20), 10),
                 doctor_name="Елена Соколова", reason="vaccination", clinic="Ветклиника «Айболит»",
                 status=VisitStatus.PLANNED, topic="Прививки"),
    ])

    pet.medications.append(
        Medication(name="Ундевит", dose="1 таблетка", start_date=days_ago(today, 14), end_date=None,
                   interval_days=1, notes="Курс витаминов, после еды")
    )
    add_doses(pet.medications[-1], today, days=14, hour=9, skipped=(6,))


def seed_family(session, user: User, today: date) -> None:
    """Семья с собакой и щенком-подростком: две записи, много прививок и визитов."""
    rex = new_pet(
        user, name="Рекс", species="dog", sex=PetSex.BOY, breed="Золотистый ретривер",
        birth_date=days_ago(today, 365 * 4 + 120), weight_g=31500,
    )
    add_weights(rex, [(days_ago(today, 150), 30200), (days_ago(today, 75), 30900), (today, 31500)])
    add_template_measurements(rex, "dog", today)
    kiki = new_pet(
        user, name="Кики", species="cat", sex=PetSex.GIRL, breed="Сиамская", approximate_age_years=2,
        weight_g=3300,
    )
    add_weights(kiki, [(days_ago(today, 90), 3000), (today, 3300)])

    food_puppy = new_food(user, name="Purina Pro Plan Adult Large", type=FoodType.DRY,
                      protein=26, fats=16, carbohydrates=40, calories=3800)
    food_cat = new_food(user, name="Whiskas, сухой корм с говядиной", type=FoodType.DRY,
                    protein=32, fats=12, carbohydrates=35, calories=3700)
    food_dry = new_food(user, name="Лакомство для собак Dog Chow", type=FoodType.TREAT,
                    protein=20, fats=8, carbohydrates=50, calories=3500)
    food_puppy.stock = FoodStock(user=user, total_grams=15000, remaining_grams=9400)
    food_cat.stock = FoodStock(user=user, total_grams=3000, remaining_grams=300)
    food_dry.stock = FoodStock(user=user, total_grams=400, remaining_grams=250)
    add_feedings(rex, today, [(food_puppy, "Purina Pro Plan Adult Large", 350),
                              (food_dry, "Лакомство для собак Dog Chow", 30)], days=21, hour=8)
    add_feedings(kiki, today, [(food_cat, "Whiskas, сухой корм с говядиной", 45)], days=21, hour=19)
    rex.feeding_records.append(
        FeedingRecord(food=food_dry, food_name="Лакомство для собак Dog Chow", amount_grams=30,
                      fed_at=at(days_ago(today, 3), 21), liked=True, tolerated=False,
                      digestive_reaction=True, notes="Съел из мусорного ведра?",
                      reaction_notes="Жидкий стул, прошло через сутки")
    )

    rex.vaccinations.extend([
        Vaccination(name="Нобивак DHPPi (комплекс)", scheduled_on=days_ago(today, 300),
                    status=VaccinationStatus.DONE, clinic="Ветцентр «Доктор Пёс»", interval_days=365,
                    next_due_on=days_ago(today, -65)),
        Vaccination(name="Бешенство", scheduled_on=days_ago(today, 300), status=VaccinationStatus.DONE,
                    clinic="Ветцентр «Доктор Пёс»", interval_days=365, next_due_on=days_ago(today, -65)),
        Vaccination(name="Ревакцинация DHPPi", scheduled_on=days_ago(today, -65),
                    status=VaccinationStatus.PLANNED, clinic="Ветцентр «Доктор Пёс»",
                    notes="Не кормить за 2 часа до укола"),
    ])
    kiki.vaccinations.append(
        Vaccination(name="Комплекс для кошек", scheduled_on=days_ago(today, 45),
                    status=VaccinationStatus.DONE, clinic="Ветклиника «Айболит»", interval_days=365,
                    next_due_on=days_ago(today, -320))
    )
    rex.parasite_treatments.extend([
        ParasiteTreatment(kind=ParasiteKind.INTERNAL, product_name="Милбемакс, таблетка",
                          treated_on=days_ago(today, 40), interval_days=90,
                          next_due_on=days_ago(today, -50), clinic="Ветцентр «Доктор Пёс»"),
        ParasiteTreatment(kind=ParasiteKind.EXTERNAL, product_name="Бравекто, таблетка",
                          treated_on=days_ago(today, 12), interval_days=90,
                          next_due_on=days_ago(today, -78)),
    ])
    kiki.parasite_treatments.append(
        ParasiteTreatment(kind=ParasiteKind.EXTERNAL, product_name="Капли Холка",
                          treated_on=days_ago(today, 50), interval_days=30, next_due_on=days_ago(today, -10))
    )

    rex.vet_visits.extend([
        VetVisit(user=user, title="Осмотр после падения", visit_at=at(days_ago(today, 60), 12),
                 doctor_name="Алексей Громов", doctor_specialty="Ортопед", reason="examination",
                 visit_price=Decimal("3200.00"), clinic="Ветцентр «Доктор Пёс»", status=VisitStatus.COMPLETED,
                 diagnosis="Ушиб лапы, без перелома", post_visit_instructions="Ограничить прыжки 10 дней",
                 topic="Травмы"),
        VetVisit(user=user, title="Контроль лапы", visit_at=at(days_ago(today, -7), 13),
                 doctor_name="Алексей Громов", doctor_specialty="Ортопед", reason="checkup",
                 clinic="Ветцентр «Доктор Пёс»", status=VisitStatus.PLANNED, topic="Травмы"),
    ])
    kiki.vet_visits.append(
        VetVisit(user=user, title="Стерилизация", visit_at=at(days_ago(today, -35), 10),
                 doctor_name="Елена Соколова", doctor_specialty="Хирург", reason="examination",
                 visit_price=Decimal("7500.00"), clinic="Ветклиника «Айболит»", status=VisitStatus.PLANNED,
                 notes="Голодание с вечера накануне")
    )
    rex.symptoms.append(Symptom(description="Хромота на заднюю левую лапу, прошла за 2 дня",
                                observed_at=at(days_ago(today, 58), 18)))


def seed_pregnancy(session, user: User, today: date) -> None:
    """Беременная кошка и собака, которую передали другу на месяц."""
    murka = new_pet(
        user, name="Мурка", species="cat", sex=PetSex.GIRL, breed="Русская голубая",
        birth_date=days_ago(today, 365 * 2 + 200), weight_g=3600,
    )
    add_weights(murka, [(days_ago(today, 100), 3300), (days_ago(today, 40), 3500), (today, 3600)])
    murka.pregnancies.append(Pregnancy(started_on=days_ago(today, 75)))
    murka.vaccinations.append(
        Vaccination(name="Нобивак Tricat (комплекс)", scheduled_on=days_ago(today, 160),
                    status=VaccinationStatus.DONE, clinic="Ветклиника «Вет+»", interval_days=365,
                    next_due_on=days_ago(today, -205))
    )
    murka.vet_visits.append(
        VetVisit(user=user, title="УЗИ, подтверждение беременности", visit_at=at(days_ago(today, 60), 14),
                 doctor_name="Марина Лебедева", doctor_specialty="Акушер", reason="examination",
                 visit_price=Decimal("1500.00"), clinic="Ветклиника «Вет+»", status=VisitStatus.COMPLETED,
                 diagnosis="Беременность, 3 плода", topic="Беременность",
                 post_visit_instructions="Витамины для беременных, больше белка")
    )
    murka.vet_visits.append(
        VetVisit(user=user, title="Плановый осмотр беременной", visit_at=at(days_ago(today, -30), 11),
                 doctor_name="Марина Лебедева", doctor_specialty="Акушер", reason="checkup",
                 clinic="Ветклиника «Вет+»", status=VisitStatus.PLANNED, topic="Беременность")
    )
    food = new_food(user, name="Hill's Science Plan, для беременных кошек", type=FoodType.DRY,
                protein=34, fats=20, carbohydrates=28, calories=4100)
    food.stock = FoodStock(user=user, total_grams=1500, remaining_grams=1100)
    add_feedings(murka, today, [(food, "Hill's Science Plan, для беременных кошек", 70)], days=21, hour=9)
    murka.symptoms.append(Symptom(description="Сонливость, аппетит выше обычного",
                                  observed_at=at(days_ago(today, 4), 21)))

    buble = new_pet(
        user, name="Бублик", species="dog", sex=PetSex.BOY, breed="Чихуахуа",
        birth_date=days_ago(today, 365 + 60), weight_g=2800,
    )
    add_weights(buble, [(days_ago(today, 60), 2600), (today, 2800)])
    buble.vaccinations.append(
        Vaccination(name="Нобивак DHPPi", scheduled_on=days_ago(today, 10), status=VaccinationStatus.PLANNED,
                    clinic="Ветклиника «Вет+»")
    )

    # Бублика сейчас держит Ольга Новикова по принятой передаче на месяц.
    session.add(PetTransfer(
        pet=buble, owner=user, recipient_email="senior@quadrotez.com",
        duration=TransferDuration.MONTH, status=TransferStatus.ACCEPTED,
        ends_at=at(add_months(today, 1), 12), responded_at=at(days_ago(today, 10), 18),
    ))

    # Ещё одна передача, ждущая ответа: кошку предлагают hamster-аккаунту.
    session.add(PetTransfer(
        pet=murka, owner=user, recipient_email="hamster@quadrotez.com",
        duration=TransferDuration.WEEK, status=TransferStatus.PENDING,
        ends_at=None,
    ))


def seed_senior(session, user: User, today: date) -> None:
    """Пожилой кот с хроническими темами: лекарства с отметками, аллергии, вес."""
    stepan = new_pet(
        user, name="Степан", species="cat", sex=PetSex.BOY, breed="Сибирская",
        approximate_age_years=12, weight_g=5100,
    )
    add_weights(
        stepan,
        [(days_ago(today, 180), 5800), (days_ago(today, 90), 5450), (days_ago(today, 30), 5200), (today, 5100)],
    )
    add_template_measurements(stepan, "cat", today)

    food = new_food(user, name="Hill's Senior, рыба", type=FoodType.DRY,
                protein=30, fats=14, carbohydrates=34, calories=3800)
    food.stock = FoodStock(user=user, total_grams=3000, remaining_grams=120)
    food_wet.stock = FoodStock(user=user, total_grams=1200, remaining_grams=800)
    food_wet = new_food(user, name="Консервы Felix, паштет с тунцом", type=FoodType.WET,
                    protein=12, fats=6, carbohydrates=1, calories=950)
    add_feedings(stepan, today, [(food, "Hill's Senior, рыба", 55), (food_wet, "Консервы Felix, паштет с тунцом", 70)],
                 days=21, hour=8, notes={5: "Почти не ел, отказался от сухого"})

    stepan.allergies.append(
        Allergy(allergen="Лосось", reactions="Рвота, понос на следующий день", notes="Исключили из рациона")
    )
    stepan.symptoms.extend([
        Symptom(description="Жажда, пьёт больше обычного", observed_at=at(days_ago(today, 14), 20)),
        Symptom(description="Пропустил туалет, быстро прошло", observed_at=at(days_ago(today, 6), 9)),
        Symptom(description="Тошнота после еды, один раз", observed_at=at(days_ago(today, 1), 7)),
    ])

    stepan.medications.append(
        Medication(name="Фортекор (эналаприл)", dose="1/2 таблетки", start_date=days_ago(today, 45),
                   end_date=None, interval_days=1, notes="Давление и сердце, утром")
    )
    add_doses(stepan.medications[-1], today, days=21, hour=8, skipped=(9, 4))
    stepan.medications.append(
        Medication(name="Фуросемид", dose="1 таблетка", start_date=days_ago(today, 10),
                   end_date=days_ago(today, -20), interval_days=2, notes="Через день, по схеме врача")
    )
    add_doses(stepan.medications[-1], today, days=10, hour=20)

    stepan.vet_visits.extend([
        VetVisit(user=user, title="Контроль почек и давления", visit_at=at(days_ago(today, 30), 10),
                 doctor_name="Игорь Левин", doctor_specialty="Терапевт", reason="checkup",
                 visit_price=Decimal("2900.00"), clinic="Клиника «Зоостатус»", status=VisitStatus.COMPLETED,
                 diagnosis="Хроническая болезнь почек, 2 стадия; давление повышено",
                 post_visit_instructions="Фортекор каждый день, вода всегда в доступе, анализ через месяц",
                 topic="Почки"),
        VetVisit(user=user, title="Анализ мочи и крови", visit_at=at(days_ago(today, -14), 9),
                 doctor_name="Игорь Левин", doctor_specialty="Терапевт", reason="checkup",
                 clinic="Клиника «Зоостатус»", status=VisitStatus.PLANNED, topic="Почки"),
        VetVisit(user=user, title="Зубы, чистка", visit_at=at(days_ago(today, 150), 12),
                 doctor_name="Ольга Вишнякова", doctor_specialty="Стоматолог", reason="examination",
                 visit_price=Decimal("5400.00"), clinic="Клиника «Зоостатус»", status=VisitStatus.COMPLETED,
                 diagnosis="Зубной камень, удаление одного резца", topic="Зубы"),
    ])
    stepan.vaccinations.append(
        Vaccination(name="Нобивак Tricat (комплекс)", scheduled_on=days_ago(today, 330),
                    status=VaccinationStatus.DONE, clinic="Клиника «Зоостатус»", interval_days=365,
                    next_due_on=days_ago(today, 35))
    )
    stepan.parasite_treatments.append(
        ParasiteTreatment(kind=ParasiteKind.INTERNAL, product_name="Празицид", treated_on=days_ago(today, 80),
                          interval_days=90, next_due_on=days_ago(today, -10))
    )


def seed_hamster(session, user: User, today: date) -> None:
    """Хомяк (вид «Другой») и кот: много кормов и запасов, мало медицины."""
    pushok = new_pet(user, name="Пушок", species="other", sex=PetSex.BOY, breed="Сирийский",
                     birth_date=days_ago(today, 200), weight_g=130)
    add_weights(pushok, [(days_ago(today, 60), 110), (days_ago(today, 20), 120), (today, 130)])

    kuzya = new_pet(user, name="Кузя", species="cat", sex=PetSex.BOY, breed="Дворовый",
                    birth_date=days_ago(today, 365 * 2 + 30), weight_g=4600)
    add_weights(kuzya, [(days_ago(today, 90), 4300), (today, 4600)])
    add_template_measurements(kuzya, "cat", today)

    hamster_food = new_food(user, name="Вита Смесь для хомяков", type=FoodType.DRY,
                        protein=16, fats=6, carbohydrates=58, calories=3300)
    hamster_food.stock = FoodStock(user=user, total_grams=800, remaining_grams=0)
    fresh = new_food(user, name="Овощи: морковь, огурец", type=FoodType.WET,
                 protein=1, fats=0, carbohydrates=8, calories=40)
    seeds = new_food(user, name="Семена подсолнечника", type=FoodType.TREAT,
                 protein=21, fats=50, carbohydrates=20, calories=580)
    kuzya_food = new_food(user, name="Royal Canin Indoor 27", type=FoodType.DRY,
                      protein=32, fats=14, carbohydrates=34, calories=3700)
    kuzya_food.stock = FoodStock(user=user, total_grams=2000, remaining_grams=1400)
    fresh.stock = FoodStock(user=user, total_grams=500, remaining_grams=300)
    seeds.stock = FoodStock(user=user, total_grams=200, remaining_grams=150)
    add_feedings(pushok, today, [(hamster_food, "Вита Смесь для хомяков", 15), (fresh, "Овощи: морковь, огурец", 10),
                                 (seeds, "Семена подсолнечника", 2)], days=14, hour=10,
                 notes={2: "Прятал семечки за щекой"})
    pushok.feeding_records.append(
        FeedingRecord(food=seeds, food_name="Семена подсолнечника", amount_grams=5,
                      fed_at=at(days_ago(today, 1), 21), liked=True, tolerated=False,
                      digestive_reaction=True, reaction_notes="Мягкий стул, на следующий день прошло")
    )
    add_feedings(kuzya, today, [(kuzya_food, "Royal Canin Indoor 27", 50)], days=14, hour=20)

    kuzya.vaccinations.append(
        Vaccination(name="Нобивак Tricat (комплекс)", scheduled_on=days_ago(today, 140),
                    status=VaccinationStatus.DONE, clinic="Ветклиника «Айболит»", interval_days=365,
                    next_due_on=days_ago(today, -225))
    )
    kuzya.vet_visits.append(
        VetVisit(user=user, title="Осмотр после укуса", visit_at=at(days_ago(today, 21), 17),
                 doctor_name="Елена Соколова", doctor_specialty="Терапевт", reason="illness",
                 visit_price=Decimal("1900.00"), clinic="Ветклиника «Айболит»", status=VisitStatus.COMPLETED,
                 diagnosis="Укус соседского кота, царапина без инфекции", topic="Травмы",
                 post_visit_instructions="Обрабатывать ранку раствором хлоргексидина 3 дня")
    )
    pushok.symptoms.append(Symptom(description="Сидит в углу, мало двигается; через день прошло",
                                   observed_at=at(days_ago(today, 7), 19)))
    pushok.vet_visits.append(
        VetVisit(user=user, title="Осмотр хомяка, экзотика", visit_at=at(days_ago(today, -5), 15),
                 doctor_name="Павел Ким", doctor_specialty="Экзотические животные", reason="checkup",
                 clinic="Клиника «Экзо-Вет»", status=VisitStatus.PLANNED, topic="Профилактика")
    )


SEEDERS = (seed_main, seed_family, seed_pregnancy, seed_senior, seed_hamster)


def main() -> None:
    today = datetime.now(TZ).date()
    with SessionLocal() as session:
        for (email, name), seed in zip(DEMO_ACCOUNTS, SEEDERS, strict=True):
            reset_user(session, email)
            user = new_user(session, email, name)
            seed(session, user, today)
            session.flush()
            print(f"Seeded demo user {email}")
        # Accepted transfers point at the recipient's account, which exists only now.
        for transfer in session.scalars(
            select(PetTransfer).where(PetTransfer.status == TransferStatus.ACCEPTED)
        ):
            transfer.recipient = session.scalar(
                select(User).where(User.email == transfer.recipient_email)
            )
        session.commit()


if __name__ == "__main__":
    main()
