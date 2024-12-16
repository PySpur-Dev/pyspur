#!/bin/bash
set -e

echo "Running database migrations..."
python -m app.db.init_db

echo "Starting application..."
exec python -m uvicorn app.api.main:app --host 0.0.0.0 --port 8000 --reload
