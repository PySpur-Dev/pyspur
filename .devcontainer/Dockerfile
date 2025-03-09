# Base stage
FROM python:3.12 as base
WORKDIR /pyspur

# Install bash completion
RUN apt-get update && apt-get install -y \
    bash-completion \
    nano \
    vim \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --system uv

COPY backend/ backend/
RUN uv pip install --system -e "/pyspur/backend/[dev]"

# Install Node.js for frontend development
RUN curl -fsSL https://deb.nodesource.com/setup_23.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Development stage
FROM base as development
WORKDIR /pyspur/frontend
COPY frontend/package*.json ./
RUN npm install

WORKDIR /pyspur