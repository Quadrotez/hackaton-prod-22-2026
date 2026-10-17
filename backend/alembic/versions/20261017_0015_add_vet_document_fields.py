"""Add analyzed veterinary-document fields and visit ownership.

Revision ID: 20261017_0015
Revises: 20261017_0014
Create Date: 2026-10-17
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0015"
down_revision: str | None = "20261017_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("vet_visits") as batch:
        batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("clinic", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("visit_price", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("post_visit_instructions", sa.Text(), nullable=True))
        batch.create_foreign_key(
            "fk_vet_visits_user_id_users", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )

    # Pet ownership is the only trusted historical source for visit ownership.
    op.execute(
        sa.text(
            "UPDATE vet_visits SET user_id = "
            "(SELECT user_id FROM pets WHERE pets.id = vet_visits.pet_id) "
            "WHERE user_id IS NULL"
        )
    )
    with op.batch_alter_table("vet_visits", recreate="always") as batch:
        batch.alter_column("user_id", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("vet_visits") as batch:
        batch.drop_constraint("fk_vet_visits_user_id_users", type_="foreignkey")
        batch.drop_column("post_visit_instructions")
        batch.drop_column("visit_price")
        batch.drop_column("clinic")
        batch.drop_column("user_id")
