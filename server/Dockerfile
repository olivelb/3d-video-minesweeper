# Use Node.js LTS with Debian for yt-dlp compatibility
FROM node:20-slim

# Install Python and yt-dlp dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --break-system-packages yt-dlp

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy server source code
COPY . .

# Expose port (Koyeb will set PORT env variable)
EXPOSE 8000

# Start the server
CMD ["node", "index.js"]
