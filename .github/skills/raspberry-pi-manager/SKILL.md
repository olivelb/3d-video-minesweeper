---
name: raspberry-pi-manager
description: Manage the Raspberry Pi 'raspberrol' on the local network. Use when Gemini CLI needs to deploy code, restart the minesweeper server, check logs, or manage the Cloudflare tunnel on the Pi.
---

# Raspberry Pi Manager

Procedural guide for managing the Raspberry Pi development environment.

## Environment Details

- **Hostname:** `raspberrol`
- **User:** `olivier`
- **IP Address (LAN):** `192.168.1.232`
- **Operating System:** Raspberry Pi OS Lite (64-bit) / Debian Trixie
- **App Directory:** `/home/olivier/3d-video-minesweeper`

## Connection Instructions

Connect using SSH with the project-specific key:

```bash
ssh -i ~/.ssh/id_minesweeper olivier@raspberrol
```

The key is configured for passwordless access. If `raspberrol` hostname fails to resolve, use the LAN IP.

## Server Management (Node.js)

The backend server is managed by **PM2**.

- **App Path:** `~/3d-video-minesweeper/server`
- **Process Name:** `minesweeper-server`
- **Port:** `3001` (Bound to `0.0.0.0`)

### Common Commands

- **Restart Server:** `ssh -i ~/.ssh/id_minesweeper olivier@raspberrol "pm2 restart minesweeper-server"`
- **View Logs:** `ssh -i ~/.ssh/id_minesweeper olivier@raspberrol "pm2 logs minesweeper-server --lines 50"`
- **Check Status:** `ssh -i ~/.ssh/id_minesweeper olivier@raspberrol "pm2 status"`

## Cloudflare Tunnel

The server is exposed globally via a Cloudflare Quick Tunnel.

- **Status Log:** `~/3d-video-minesweeper/tunnel.log`
- **Identify URL:** `grep -o 'https://.*\.trycloudflare.com' ~/3d-video-minesweeper/tunnel.log`
- **Restart Tunnel:**
  ```bash
  ssh -i ~/.ssh/id_minesweeper olivier@raspberrol "pkill cloudflared; nohup cloudflared tunnel --url http://localhost:3001 > ~/3d-video-minesweeper/tunnel.log 2>&1 &"
  ```

## Deployment Workflow

To deploy code changes from the local machine to the Pi:

1. **Compress:** `tar --exclude="node_modules" -czf deploy.tar.gz server/`
2. **Transfer:** `scp -i ~/.ssh/id_minesweeper deploy.tar.gz olivier@raspberrol:~`
3. **Extract & Restart:** 
   ```bash
   ssh -i ~/.ssh/id_minesweeper olivier@raspberrol "tar -xzf deploy.tar.gz -C ~/3d-video-minesweeper && cd ~/3d-video-minesweeper/server && npm install && pm2 restart minesweeper-server"
   ```

## System Tools

- **Node.js:** v20 (LTS)
- **yt-dlp:** `/usr/local/bin/yt-dlp` (Updated manually via curl)
- **ffmpeg:** Installed via apt
- **Python:** v3.13
