"""Create (or update) the demo account used by the frontend demo-login button.

Idempotent: safe to run on every deploy. The password is always reset to the
configured value so the published demo credentials keep working.

Usage:
    python scripts/create_demo_user.py

Environment overrides:
    DEMO_EMAIL     (default: demo@quadrotez.com)
    DEMO_PASSWORD  (default: demo)
    DEMO_NAME      (default: Демо)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow running this file directly (``python scripts/create_demo_user.py``).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

import app.models  # noqa: F401  (register all models for relationship resolution)
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.pet import Pet, PetSex
from app.models.user import User

DEMO_EMAIL = os.environ.get("DEMO_EMAIL", "demo@quadrotez.com").strip().lower()
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "demo")
DEMO_NAME = os.environ.get("DEMO_NAME", "Демо")


def main() -> None:
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(
                email=DEMO_EMAIL,
                name=DEMO_NAME,
                password_hash=hash_password(DEMO_PASSWORD),
            )
            session.add(user)
            session.flush()
            print(f"Created demo user {DEMO_EMAIL}")
        else:
            user.name = user.name or DEMO_NAME
            user.password_hash = hash_password(DEMO_PASSWORD)
            print(f"Updated demo user {DEMO_EMAIL}")

        pet = session.scalar(select(Pet).where(Pet.user_id == user.id).limit(1))
        if pet is None:
            session.add(
                Pet(
                    user_id=user.id,
                    name="Барсик",
                    species="cat",
                    sex=PetSex.BOY,
                    breed="Британская короткошёрстная",
                    weight_g=4200,
                )
            )
            print("Seeded a sample pet for the demo user")

        session.commit()


if __name__ == "__main__":
    main()
