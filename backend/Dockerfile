# Build stage
FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .

# Install build dependencies and create virtual environment
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc python3-dev && \
    python -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.12-slim

WORKDIR /pyspur

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Make sure we use the virtualenv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY . .

# Make entrypoint script executable
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run the application using the entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]
