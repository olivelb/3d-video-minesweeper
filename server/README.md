# YouTube & Media Proxy Server for 3D Minesweeper

This server provides a high-performance proxy for streaming content from YouTube, Dailymotion, Archive.org, and more as WebGL textures.

## ⚠️ Legal Notice

This tool is for **educational and personal use only**. Using it may violate YouTube's Terms of Service. Please ensure you:
- Only use videos you own or have permission to use
- Do not use this for commercial purposes
- Respect content creators' rights

## Prerequisites

- Node.js 18.0.0 or higher
- npm (comes with Node.js)

## Installation

```bash
# Navigate to the server directory
cd server

# Install dependencies
npm install
```

## Usage

### Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3001` by default.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check - returns server status |
| `GET /api/youtube/validate?url=...` | Validate a YouTube URL |
| `GET /api/youtube/info?url=...` | Get video metadata (title, duration, etc.) |
| `GET /api/youtube/stream?v=VIDEO_ID&q=QUALITY` | Stream video content |
| `GET /api/youtube/thumbnail?v=VIDEO_ID` | Get video thumbnail |
| `GET /api/youtube/formats?v=VIDEO_ID` | List available video formats |

### Quality Options

- `auto` - Lowest quality (best for performance, default)
- `low` - 360p
- `medium` - 480p  
- `high` - 720p

### Example URLs

```
# Health check
http://localhost:3001/health

# Validate a video
http://localhost:3001/api/youtube/validate?url=https://youtube.com/watch?v=dQw4w9WgXcQ

# Get video info
http://localhost:3001/api/youtube/info?url=https://youtube.com/watch?v=dQw4w9WgXcQ

# Stream video (use in <video> src)
http://localhost:3001/api/youtube/stream?v=dQw4w9WgXcQ&q=auto
```

## Configuration

Edit `.env` file to customize:

```env
PORT=3001              # Server port
NODE_ENV=development   # Environment mode
```

## CORS

The server allows requests from:
- `localhost` (any port)
- `127.0.0.1` (any port)
- `null` (for file:// protocol)

## Rate Limiting

- General endpoints: 100 requests per 15 minutes
- Stream endpoint: 10 requests per minute

## Troubleshooting

### "Video unavailable" error
- The video might be private, deleted, or region-restricted

### "Age-restricted" error  
- Age-restricted videos cannot be streamed without authentication

### CORS errors
- Make sure you're running the frontend from localhost
- Check that the server is running

### Stream stuttering
- Try a lower quality setting
- Check your network connection

## Project Structure

```
server/
├── index.js              # Entry point
├── package.json          # Dependencies
├── .env                  # Configuration
├── routes/
│   └── youtube.js        # API routes
├── services/
│   └── youtubeService.js # YouTube streaming logic
├── middleware/
│   ├── cors.js           # CORS configuration
│   ├── rateLimit.js      # Rate limiting
│   └── errorHandler.js   # Error handling
└── utils/
    └── urlParser.js      # URL parsing utilities
```

## Running with the Game

1. Start the proxy server:
   ```bash
   cd server && npm start
   ```

2. Start the game (in another terminal):
   ```bash
   # Use VS Code Live Server, or:
   npx serve .
   # or
   python -m http.server 5500
   ```

3. Open the game in your browser
4. Paste a YouTube URL in the YouTube section
5. Click the load button and start playing!
