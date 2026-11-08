"""create payments and processed events

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("customer_id", sa.UUID(), nullable=False),
        sa.Column("restaurant_id", sa.UUID(), nullable=False),
        sa.Column(
            "method",
            sa.Enum(
                "cod", "card", "jazzcash", "easypaisa", name="payment_method", schema="payments"
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "collected", "cancelled", name="payment_status", schema="payments"),
            nullable=False,
        ),
        sa.Column("amount_paisa", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount_paisa >= 0", name="payments_amount_not_negative"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id"),
        schema="payments",
    )
    op.create_index(
        "payments_customer_id_idx", "payments", ["customer_id"], unique=False, schema="payments"
    )
    op.create_index(
        "payments_status_created_at_idx",
        "payments",
        ["status", "created_at"],
        unique=False,
        schema="payments",
    )
    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("event_id"),
        schema="payments",
    )


def downgrade() -> None:
    op.drop_table("processed_events", schema="payments")
    op.drop_index("payments_status_created_at_idx", table_name="payments", schema="payments")
    op.drop_index("payments_customer_id_idx", table_name="payments", schema="payments")
    op.drop_table("payments", schema="payments")
    op.execute("drop type payments.payment_status")
    op.execute("drop type payments.payment_method")
