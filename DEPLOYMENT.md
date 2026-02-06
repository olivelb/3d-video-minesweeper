# Deployment Guide

This guide covers deploying the 3D Video Minesweeper project for both local development and production (GitHub Pages + Raspberry Pi).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Pages                                │
│              https://username.github.io/3d-video-minesweeper    │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Cloudflare Quick Tunnel                       │
│              https://abc123.trycloudflare.com                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Tunnel
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Raspberry Pi Server                         │
│                     raspberrol:3001                             │
│              ┌─────────────────────────────────┐                │
│              │   Node.js + Express + yt-dlp    │                │
│              │   PM2 process manager           │                │
│              └─────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Local Development Setup

### Prerequisites

- Node.js v20+
- yt-dlp installed and in PATH
- Git

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/3d-video-minesweeper.git
   cd 3d-video-minesweeper
   ```

2. **Create local server configuration**
   ```bash
   cp servers-local.json.example servers-local.json
   ```
   
   Edit `servers-local.json` with your server addresses:
   ```json
   {
       "local": "http://localhost:3001",
       "raspberryLocal": "http://raspberrol:3001",
       "raspberryLAN": "http://192.168.1.232:3001",
       "raspberryCloud": null
   }
   ```
   
   > ⚠️ This file is gitignored and will never be pushed.

3. **Start the proxy server** (Option A: Local)
   ```bash
   cd server
   npm install
   npm start
   ```

4. **Serve the frontend**
   ```bash
   # From project root, use any static server:
   npx serve .
   # or
   python -m http.server 8080
   ```

5. **Open in browser**
   - Navigate to `http://localhost:8080`
   - The app auto-detects local environment and tries localhost:3001 first

---

## Raspberry Pi Server Setup

### Initial Setup

1. **SSH to the Pi**
   ```bash
   ssh olivier@raspberrol
   # or
   ssh olivier@192.168.1.232
   ```

2. **Clone/update the server code**
   ```bash
   cd ~/3d-video-minesweeper/server-multiplayer
   git pull origin main
   npm install --omit=dev
   ```

3. **Install yt-dlp**
   ```bash
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   sudo chmod a+rx /usr/local/bin/yt-dlp
   ```

4. **Configure environment**
   ```bash
   cat > .env << EOF
   PORT=3001
   ALLOWED_ORIGINS=https://yourusername.github.io,http://localhost:8080,http://localhost:3000
   NODE_ENV=production
   EOF
   ```

5. **Setup PM2**
   ```bash
   npm install -g pm2
   pm2 start server.js --name minesweeper-multiplayer
   pm2 save
   pm2 startup  # Follow instructions to enable on boot
   ```

### Cloudflare Tunnel Setup

For external access from GitHub Pages, use Cloudflare Quick Tunnel:

1. **Start the tunnel**
   ```bash
   cloudflared tunnel --url http://localhost:3001 > ~/3d-video-minesweeper/tunnel.log 2>&1 &
   ```

2. **Get the tunnel URL**
   ```bash
   grep -o 'https://[^"]*\.trycloudflare\.com' ~/3d-video-minesweeper/tunnel.log | head -1
   ```

3. **Note**: Quick tunnels change URL on restart. For persistent URLs, create a named tunnel (requires Cloudflare account).

---

## GitHub Pages Deployment

### Repository Setup

1. Enable GitHub Pages in repository settings
2. Set source to main branch / root folder
3. Wait for initial deployment

### Configure Cloud Server URL

**Option A: In index.html (Recommended for public)**

Add before other scripts in `index.html`:
```html
<script>
  window.MINESWEEPER_SERVERS = {
    raspberryCloud: 'https://your-tunnel-id.trycloudflare.com'
  };
</script>
```

**Option B: User localStorage (Per-browser)**

Users can configure manually in browser console:
```javascript
localStorage.setItem('minesweeper_servers', JSON.stringify({
  raspberryCloud: 'https://your-tunnel-id.trycloudflare.com'
}));
location.reload();
```

---

## Deployment Scripts

### Quick Deploy to Pi (from local machine)

The project includes a PowerShell script to automate deployment:

```powershell
.\.github\skills\raspberry-pi-manager\deploy.ps1
```

This script:
1. Compresses the `server-multiplayer` folder (excluding node_modules).
2. Transfers the archive to the Pi via SCP.
3. Extracts, installs dependencies, and restarts the PM2 process.

### Restart Cloudflare Tunnel

```bash
# On Pi
pkill cloudflared
cloudflared tunnel --url http://localhost:3001 > ~/3d-video-minesweeper/tunnel.log 2>&1 &
sleep 5
grep -o 'https://[^"]*\.trycloudflare\.com' ~/3d-video-minesweeper/tunnel.log | head -1
```

---

## Environment Configuration Reference

### Frontend (`config.js`)

| Environment | Hostname Pattern | Server Check Order |
|-------------|------------------|-------------------|
| `local` | localhost, 127.0.0.1, file:// | localhost → mDNS → LAN → Cloud |
| `github-pages` | *.github.io | Cloud only |
| `hosted` | Other | All |

### Server Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `ALLOWED_ORIGINS` | * | Comma-separated CORS origins |
| `NODE_ENV` | development | production enables security features |

---

## Troubleshooting

### "No server found" in browser

1. Check server is running: `pm2 status`
2. Verify tunnel is active: Check tunnel.log
3. Test server directly: `curl http://localhost:3001/health`
4. Check CORS: Ensure your origin is in ALLOWED_ORIGINS

### Video not loading

1. Verify yt-dlp is installed: `yt-dlp --version`
2. Update yt-dlp: `sudo yt-dlp -U`
3. Check server logs: `pm2 logs minesweeper-server`

### Tunnel URL changed

Quick tunnels get new URLs on restart. Either:
- Update `window.MINESWEEPER_SERVERS` in index.html
- Use a named Cloudflare tunnel (persistent URL)

---

## Security Checklist

- [ ] `servers-local.json` is in `.gitignore`
- [ ] No hardcoded IPs in committed code
- [ ] `ALLOWED_ORIGINS` is set to specific domains
- [ ] Server running behind firewall (only tunnel exposed)
- [ ] yt-dlp regularly updated
