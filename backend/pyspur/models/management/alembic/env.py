# ruff: noqa: F401
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Import database URL
from pyspur.database import database_url
from pyspur.models.base_model import BaseModel
from pyspur.models.dataset_model import DatasetModel  # type: ignore
from pyspur.models.dc_and_vi_model import (
    DocumentCollectionModel,  # type: ignore
    VectorIndexModel,  # type: ignore
)
from pyspur.models.eval_run_model import EvalRunModel  # type: ignore
from pyspur.models.output_file_model import OutputFileModel  # type: ignore
from pyspur.models.run_model import RunModel  # type: ignore
from pyspur.models.task_model import TaskModel  # type: ignore
from pyspur.models.user_session_model import MessageModel, SessionModel, UserModel  # type: ignore
from pyspur.models.workflow_model import WorkflowModel  # type: ignore
from pyspur.models.workflow_version_model import WorkflowVersionModel  # type: ignore

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the database URL in the config
config.set_main_option("sqlalchemy.url", database_url)

# add your model's MetaData object here
target_metadata = BaseModel.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    # use render_as_batch=True for SQLite
    url = config.get_main_option("sqlalchemy.url")
    if url is not None and url.startswith("sqlite"):
        render_as_batch = True
    else:
        render_as_batch = False
    print("#" * 50)
    print(f"Using render_as_batch={render_as_batch}, url={url}")
    print("#" * 50)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=render_as_batch,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
