#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_message() {
    echo -e "${2}${1}${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to download a file from GitHub
download_file() {
    local file=$1
    local url="https://raw.githubusercontent.com/pyspur-dev/pyspur/main/${file}"
    
    if curl -fsSL "$url" -o "$file"; then
        print_message "Downloaded ${file} successfully" "$GREEN"
        return 0
    else
        print_message "Failed to download ${file}" "$RED"
        return 1
    fi
}

# Check if Docker is installed
if ! command_exists "docker"; then
    print_message "Docker is not installed. Please install Docker first:" "$RED"
    print_message "https://docs.docker.com/engine/install/" "$YELLOW"
    exit 1
fi

# Check if curl is installed
if ! command_exists "curl"; then
    print_message "curl is not installed. Please install curl first." "$RED"
    exit 1
fi

# Get project name from argument or use default
PROJECT_NAME=${1:-"pyspur-project"}

# Check if directory already exists
if [ -d "$PROJECT_NAME" ]; then
    print_message "Directory '$PROJECT_NAME' already exists. Please choose a different name or remove the existing directory." "$RED"
    exit 1
fi

print_message "Creating new PySpur project: $PROJECT_NAME..." "$GREEN"

# Create and enter project directory
mkdir -p "$PROJECT_NAME"
cd "$PROJECT_NAME"

# Download docker-compose.yml (production version)
if ! download_file "docker-compose.yml"; then
    exit 1
fi

# Download and copy .env.example to .env 
if ! download_file ".env.example"; then
    exit 1
fi
cp .env.example .env

# Start the services
print_message "Launching PySpur services..." "$GREEN"
if docker compose up -d; then
    print_message "\n🎉 PySpur is now running!" "$GREEN"
    print_message "\nProject created in: $(pwd)" "$GREEN"
    print_message "Access PySpur at: http://localhost:6080" "$GREEN"
    print_message "\nTo customize your deployment:" "$YELLOW"
    print_message "1. Configure API keys through the portal's API Keys tab, or" "$YELLOW"
    print_message "2. Manually edit .env and restart with:" "$YELLOW"
    print_message "   docker compose up -d" "$NC"
    exit 0
else
    print_message "\nFailed to start PySpur services. Please check the error messages above." "$RED"
    exit 1
fi 