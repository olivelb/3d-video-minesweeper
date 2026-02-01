# Changelog

All notable changes to the 3D Video Minesweeper project will be documented in this file.

## [2.0.0] - 2025-01-21

### 🔒 Security Improvements

#### Server-Side
- **URL Validation Middleware**: Added `validateUrlInput` middleware to sanitize incoming URLs
- **Platform Allowlist**: Only YouTube and Vimeo URLs are now accepted
- **Request Body Limits**: Added 1KB body size limit to prevent payload attacks
- **CORS Hardening**: Tightened CORS policy with explicit allowlist via `ALLOWED_ORIGINS` env var
- **URL Sanitization**: Added `sanitizeUrl()` and `isAllowedPlatform()` in urlParser.js

#### Client-Side
- **No Hardcoded Secrets**: Removed all hardcoded IP addresses and server URLs from source code
- **Dynamic Configuration**: Server URLs now loaded from external config or auto-detected

### 🧹 Code Cleanup

#### Removed Unused Code
- **Deleted**: `server/services/youtubeService.js` - Unused legacy YouTube service
- **Removed Dependency**: `@distube/ytdl-core` from package.json (was unused)
- **Removed 370+ Lines**: Duplicate/legacy methods from MinesweeperSolver.js:
  - `applyBasicRules` (legacy duplicate)
  - `applySubsetLogic` (legacy duplicate)
  - `checkDeepContradiction`
  - `tankSolver` (legacy duplicate)
  - `evaluateBoardDifficulty`
  - `generateAllBinaryStrings`
  - `evaluateGuessForOpening`
  - `findOptimalOpening`
  - Redundant helper methods

### 🏗️ Architecture Improvements

#### New Modular Components
Created three new ES6 modules extracted from the monolithic Renderer.js:

1. **VideoTextureManager.js** (302 lines)
   - Manages video and image texture loading
   - YouTube thumbnail integration
   - Texture caching and lifecycle management
   - Video playback control

2. **FlagRenderer.js** (242 lines)
   - Flag visualization in both particle and 3D modes
   - 3D flag pole and cloth rendering
   - Animation handling for flag placement/removal

3. **GridRenderer.js** (218 lines)
   - Instanced mesh grid rendering
   - Efficient cell state management
   - Color and material handling

#### Configuration System Overhaul
- **Environment Auto-Detection**: Automatically detects:
  - `local` - localhost, 127.0.0.1, or file:// protocol
  - `github-pages` - *.github.io domains
  - `hosted` - Other hosted environments
  
- **Smart Server Discovery**: 
  - Local: Tries localhost → mDNS (raspberrol) → LAN IP → Cloud
  - GitHub Pages: Only attempts Cloudflare tunnel
  
- **Configuration Hierarchy**:
  1. `window.MINESWEEPER_SERVERS` (runtime override)
  2. `localStorage` (user persisted settings)  
  3. `servers-local.json` (local dev file, gitignored)
  4. Built-in defaults

### 📁 File Changes Summary

| File | Change | Lines |
|------|--------|-------|
| `javascripts/config.js` | Rewritten | ~120 → ~250 |
| `javascripts/MinesweeperSolver.js` | Cleaned | -370 lines |
| `javascripts/VideoTextureManager.js` | New | +302 lines |
| `javascripts/FlagRenderer.js` | New | +242 lines |
| `javascripts/GridRenderer.js` | New | +218 lines |
| `server/services/youtubeService.js` | Deleted | -100 lines |
| `server/routes/youtube.js` | Enhanced | +15 lines |
| `server/utils/urlParser.js` | Enhanced | +35 lines |
| `server/middleware/cors.js` | Hardened | +10 lines |
| `server/index.js` | Body limits | +5 lines |
| `server/package.json` | Cleaned | -1 dep |

### 🚀 Deployment Notes

#### For Local Development
1. Copy `servers-local.json.example` to `servers-local.json`
2. Update with your server addresses
3. This file is gitignored and will never be pushed

#### For GitHub Pages
The application auto-detects GitHub Pages and expects:
- `raspberryCloud` URL set via `window.MINESWEEPER_SERVERS` in index.html, OR
- Manual configuration in browser localStorage

#### For Raspberry Pi Server
```bash
# Set allowed origins
export ALLOWED_ORIGINS="https://yourusername.github.io,http://localhost:8080"

# Or add to .env file
echo 'ALLOWED_ORIGINS=https://yourusername.github.io' >> .env
```

---

## [1.x.x] - Previous Versions

See git history for changes prior to the optimization refactor.
