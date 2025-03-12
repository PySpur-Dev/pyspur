#!/bin/bash

# Install pre-commit hooks
uv pip install --system pre-commit==4.1.0
pre-commit install

# Check if package.json has changed and reinstall if needed
if [ -f /pyspur/frontend/package.json ]; then
    cd /pyspur/frontend && npm install
fi

# Add source command to main bashrc
echo '
# Source custom settings
# Source custom bashrc settings if the file exists
if [ -f /pyspur/.devcontainer/.bashrc ]; then
    source /pyspur/.devcontainer/.bashrc
fi' >> ~/.bashrc 