# Dockerfile for Koyeb deployment
# Builds only the server component from the /server directory

FROM node:20-slim

# Install Python and yt-dlp dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally
RUN pip3 install --break-system-packages yt-dlp

# Create app directory
WORKDIR /app

# Copy only server files
COPY server/package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy server source code
COPY server/ ./

# Koyeb sets PORT environment variable (usually 8000)
ENV PORT=8000

# Expose the port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the server
CMD ["node", "index.js"]
