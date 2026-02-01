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

## ☁️ Déploiement Cloud & Blocage YouTube (Erreur 503)

Les hébergeurs Cloud (Koyeb, Heroku, AWS...) sont souvent bloqués par YouTube qui détecte leurs IPs comme des bots.

### Solution : Utiliser des Cookies
Pour contourner cela, vous pouvez fournir vos cookies YouTube au serveur via une variable d'environnement.

1. Installez l'extension **"Get cookies.txt LOCALLY"** (Chrome/Firefox).
2. Connectez-vous à YouTube.
3. Exportez les cookies (format Netscape).
4. Sur votre hébergeur (ex: Koyeb), ajoutez une Variable d'Environnement :
   - **Nom** : `YOUTUBE_COOKIES`
   - **Valeur** : Collez tout le contenu du fichier `cookies.txt`

Le serveur détectera automatiquement cette variable au démarrage et l'utilisera pour authentifier les requêtes `yt-dlp`.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check - returns server status |
| `GET /api/youtube/validate?url=...` | Validate a YouTube URL |
| `GET /api/youtube/info?url=...` | Get video metadata (title, duration, etc.) + pre-caches stream URL |
| `GET /api/youtube/stream?v=VIDEO_ID&q=QUALITY` | Stream video content (instant if URL pre-cached) |
| `GET /api/youtube/direct?v=VIDEO_ID&q=QUALITY` | Get direct CDN URL (for advanced use) |
| `GET /api/youtube/thumbnail?v=VIDEO_ID` | Get video thumbnail |
| `GET /api/youtube/formats?v=VIDEO_ID` | List available video formats |

### Quality Options

- `auto` - 480p (default, good balance of quality and speed)
- `low` - 360p
- `medium` - 480p  
- `high` - 720p
- `highest` - 1080p
- `lowest` - Smallest available

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
├── routes/
│   └── youtube.js        # API routes
├── services/
│   ├── ytdlpService.js   # yt-dlp streaming & URL extraction
│   └── youtubeService.js # Legacy YouTube service
├── middleware/
│   ├── cors.js           # CORS configuration
│   ├── rateLimit.js      # Rate limiting
│   └── errorHandler.js   # Error handling
└── utils/
    └── urlParser.js      # URL parsing utilities
```

## Performance Optimizations

The server implements several optimizations for faster video loading:

### URL Pre-caching
When `/api/youtube/info` is called, the server extracts and caches the direct video URL from the same yt-dlp call. This means subsequent `/api/youtube/stream` requests can start instantly without waiting for URL extraction.

### Fast Stream Mode
`createFastVideoStream()` uses cached direct URLs to stream video via HTTP instead of spawning a new yt-dlp process. This reduces stream start time from ~11s to <1s for cached videos.

### Timing Breakdown
| Phase | Duration | Notes |
|-------|----------|-------|
| URL extraction (yt-dlp) | ~11s | YouTube's anti-bot measures, unavoidable |
| Stream start (cached) | <1s | Uses pre-cached direct URL |
| Stream start (uncached) | ~11s | Falls back to yt-dlp |

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
