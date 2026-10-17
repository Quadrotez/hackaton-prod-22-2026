"""Replace username with optional name on users.

Revision ID: 20261017_0009
Revises: 20261017_0008
Create Date: 2026-10-17
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0009"
down_revision: str | None = "20261017_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


USERNAME_INDEX = "ix_users_username"


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index(USERNAME_INDEX)
        batch_op.drop_column("username")
        batch_op.add_column(sa.Column("name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("username", sa.String(length=30), nullable=True))

    connection = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("email", sa.String(length=320)),
        sa.column("username", sa.String(length=30)),
    )
    existing_users = connection.execute(
        sa.select(users.c.id, users.c.email).order_by(users.c.id)
    ).all()
    for user_id, email in existing_users:
        local_part = email.split("@", 1)[0].lower()
        base_username = "".join(char if char.isalnum() else "_" for char in local_part)
        base_username = (base_username.strip("_") or "user")[:24]
        username = base_username
        suffix = 1
        while connection.execute(
            sa.select(users.c.id).where(users.c.username == username)
        ).first() is not None:
            suffix_text = f"_{suffix}"
            username = f"{base_username[:30 - len(suffix_text)]}{suffix_text}"
            suffix += 1
        connection.execute(
            users.update().where(users.c.id == user_id).values(username=username)
        )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "username",
            existing_type=sa.String(length=30),
            nullable=False,
        )
        batch_op.create_index(USERNAME_INDEX, ["username"], unique=True)
        batch_op.drop_column("name")
