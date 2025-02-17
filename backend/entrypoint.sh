#!/bin/bash

# First test Ollama connection if URL is provided
if [ -f "test_ollama.sh" ]; then
    chmod +x test_ollama.sh
    ./test_ollama.sh
fi

set -e 
mkdir -p /pyspur/backend/pyspur/models/management/alembic/versions/
start_server() {
    cd /pyspur/backend
    uvicorn "pyspur.api.main:app" --reload --reload-include ./log_conf.yaml --reload-include "**/*.py" --log-config=log_conf.yaml --host 0.0.0.0 --port 8000
}

main() {
    alembic upgrade head
    start_server
}

main