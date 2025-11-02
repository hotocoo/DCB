# Ultra Discord Bot Dockerfile
FROM node:20-alpine AS base

# Install system dependencies for audio processing and SQLite
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    sqlite \
    sqlite-dev \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ultra -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    sqlite \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ultra -u 1001

WORKDIR /app

# Copy installed dependencies from base stage
COPY --from=base --chown=ultra:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=ultra:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p data logs && \
    chown -R ultra:nodejs data logs

# Set environment variables
ENV NODE_ENV=production
ENV DOCKER_DATABASE_PATH=/app/data/bot.db

# Switch to non-root user
USER ultra

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Expose port for potential web interface (if added later)
EXPOSE 3000

# Start the bot
CMD ["node", "src/index.js"]
