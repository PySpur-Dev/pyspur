#!/bin/bash

# This script automates the process of generating Alembic database migrations.
# Use this to create a new migration file with the provided revision ID and title.
# The script should be run from the root directory of the project, preferably in the devcontainer.
# The convention for the revision ID is to use 3 digit numbers. For example: 001, 002, 003, etc.
# The revision title should be a short descriptive name for the migration without spaces.
#
# It performs the following steps:
# 1. Validates command line arguments (rev-id and revision title)
# 2. Starts required Docker services (database and backend)
# 3. Waits for the database to be ready
# 4. Generates an Alembic migration file with the provided parameters
#
# Usage:
#   ./generate_migrations.sh <rev-id> <rev-title>
#
# Arguments:
#   rev-id:     Unique identifier for the migration revision
#   rev-title:  Descriptive title for the migration
#
# Example:
#   ./generate_migrations.sh 1234abcd "add_user_table"


# Ensure the script exits on any error
set -e

# Check if the correct number of arguments is provided
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <rev-id> <rev-title>"
    exit 1
fi

REV_ID=$1
REV_TITLE=$2

# Start the necessary Docker services
echo "Starting Docker services..."
docker compose -f docker-compose.dev.yml up -d db backend

# Wait for the database to be healthy
echo "Waiting for the database to be healthy..."
until docker compose -f docker-compose.dev.yml exec db pg_isready -U pyspur; do
  sleep 1
done

# Run Alembic commands to generate migrations
echo "Generating Alembic migration with rev-id: $REV_ID and rev-title: $REV_TITLE..."
docker compose -f docker-compose.dev.yml exec backend alembic revision --autogenerate -m "$REV_TITLE" --rev-id "$REV_ID"

# Optionally, you can apply the migration immediately
# echo "Applying migrations..."
# docker compose exec backend alembic upgrade head

echo "Migration generation complete."