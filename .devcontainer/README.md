# Development Container Configuration

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/pyspur-dev/pyspur)

This directory contains configuration files for Visual Studio Code Dev Containers / GitHub Codespaces. Dev containers provide a consistent, isolated development environment for this project.

## Contents

- `devcontainer.json` - The main configuration file that defines the development container settings
- `Dockerfile` - Defines the container image and development environment

## Usage

### Prerequisites

- Visual Studio Code
- Docker installation:
  - Docker Desktop (Windows/macOS)
  - Docker Engine (Linux)
- [Remote - Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension for VS Code

### Getting Started

1. Open this project in Visual Studio Code
2. When prompted, click "Reopen in Container"
   - Alternatively, press `F1` and select "Remote-Containers: Reopen in Container"
3. Wait for the container to build and initialize
4. Launch the application using:
   ```bash
   dcup
   ```
5. Access the application (assuming the ports are forwarded as is to the host machine)
   - Main application: http://localhost:6080
   - Frontend development server: http://localhost:3000
   - Backend API: http://localhost:8000

The development environment will be automatically configured with all necessary tools and extensions.

### Viewing Logs

You can monitor the application logs using these commands:

- View all container logs:
  ```bash
  dlogs
  ```
- View backend logs only:
  ```bash
  dlogb
  ```
- View frontend logs only:
  ```bash
  dlogf
  ```
- View nginx logs only:
  ```bash
  dlogn
  ```

All log commands show the last 5 minutes of logs and continue to tail new entries.

### Modifying the database schemas


1. **Stop Containers**
   ```bash
   docker compose down
   ```

2. **Generate a Migration**
   ```bash
   ./generate_migrations.sh 002 <short_description_in_snake_case>
   ```
   - Migration file appears in `./backend/app/models/management/alembic/versions/` with prefix `002_...`.

3. **Review the Generated Script**
   - Open the file to ensure it has the intended changes.

4. **Apply the Migration**
   ```bash
   docker compose down
   docker compose up --build
   ```
   - Alembic applies the new migration automatically on startup.

5. **Test the App**
   - Confirm new tables/columns work as expected.

6. **Commit & Push**
   ```bash
   git add .
   git commit -m "Add migration 002 <description>"
   git push origin <branch>
   ```

### Troubleshooting DBs issues

When modifying the DB models, one needs to be careful to not destroy the local DB due to lacking migrations.

Sometimes the local dev DB gets corrupted. In such cases, assuming it does not contain production data, the quickest fix is to simply delete it and let the backend rebuild it the next time you run `docker compose up` (or `dcup`).

You can do so via running

```bash
docker volume rm pyspur_postgres_data
```

## Customization

You can customize the development environment by:

- Modifying `devcontainer.json` to:
  - Add VS Code extensions
  - Set container-specific settings
  - Configure environment variables
- Updating the `Dockerfile` to:
  - Install additional packages
  - Configure system settings
  - Add development tools

## Troubleshooting

If you encounter issues:

1. Rebuild the container: `F1` → "Remote-Containers: Rebuild Container"
2. Check Docker logs for build errors
3. Verify Docker Desktop is running
4. Ensure all prerequisites are installed

For more information, see the [VS Code Remote Development documentation](https://code.visualstudio.com/docs/remote/containers).