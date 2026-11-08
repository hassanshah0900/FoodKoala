"""Alembic environment: the schema and its version table both live in `payments`."""

from alembic import context
from sqlalchemy import create_engine, text

from app.db import SCHEMA, Base
from app.models import Payment, ProcessedEvent  # noqa: F401  (registers the tables)
from app.settings import get_settings

engine = create_engine(get_settings().database_url)

with engine.connect() as connection:
    connection.execute(text(f"create schema if not exists {SCHEMA}"))
    connection.commit()
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        include_name=lambda name, type_, _: type_ != "schema" or name == SCHEMA,
    )
    with context.begin_transaction():
        context.run_migrations()
