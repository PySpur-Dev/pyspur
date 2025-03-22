#!/bin/bash
set -e

# Docker CLI installation script
# This installs only the Docker CLI (not the daemon) for use with a mounted Docker socket

# Update and install dependencies
apt-get update
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up the Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(lsb_release -cs) stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker CLI only (not the full engine)
apt-get update
apt-get install -y docker-ce-cli

# Verify installation
docker --version

# Clean up
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "Docker CLI installation complete"