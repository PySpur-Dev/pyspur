FROM node:18.19.0

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Set environment variables
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Start the development server with host binding
CMD ["npm", "run", "dev", "--", "--port", "3000", "--hostname", "0.0.0.0"]
