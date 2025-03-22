# Base stage
FROM python:3.12 as base
WORKDIR /pyspur

# Install bash completion and development tools
RUN apt-get update && apt-get install -y \
    bash-completion \
    nano \
    vim \
    libpq-dev \
    gcc \
    curl \
    make \
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

# Install Docker CLI using shared script
COPY docker-install.sh /tmp/
RUN bash /tmp/docker-install.sh && rm /tmp/docker-install.sh