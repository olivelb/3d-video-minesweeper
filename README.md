# 💣 3D Minesweeper

A modern, immersive, and social take on the classic Minesweeper. Built with **Three.js** for stunning 3D visuals, and **Socket.io** for intense competitive multiplayer.

![Project Status](https://img.shields.io/badge/status-active-brightgreen)
![Tech Stack](https://img.shields.io/badge/tech-Three.js%20%7C%20Node.js%20%7C%20Socket.io-blue)

## ✨ Features

- **Immersive 3D Grid**: Navigate a floating minefield in a 3D space with smooth camera, animations and lighting.
- **Custom Media Backgrounds**: Play with uploaded images or videos as dynamic backgrounds.
- **No-Guess Mode**: Gaussian elimination + multi-strategy solver guarantees every board is solvable without guessing. Enabled by default.
- **Explain Hint**: In No-Guess mode, an "Explain" button shows *why* a hinted move is safe, with strategy-specific reasoning (basic counting, subset logic, Gaussian elimination, contradiction, exhaustive analysis) and constraint cell highlighting.
- **WASM Solver Acceleration**: Rust-compiled WebAssembly solver with automatic JS fallback via `SolverBridge`. Accelerates board generation on both client and server.
- **Live Generation Feedback**: Calculating overlay with real-time attempt counter in both solo and multiplayer modes.
- **Chord Clicking**: Double-click a numbered cell with the correct adjacent flags to auto-reveal its neighbors.
- **Competitive Multiplayer**:
    - **Lobby System**: Support for up to 8 players.
    - **Host Control**: Configure grid size, bomb count, player limits, and No-Guess mode.
    - **Elimination Mode**: Click a bomb? You're out! But the game continues for the rest.
    - **Spectator Mode**: Eliminated players enter ghost mode and can continue watching.
    - **Chord in Multiplayer**: Chord clicks are server-validated with full state sync.
    - **Real-time Sync**: Watch your friends' cursors and actions in real-time.
    - **Leaderboard & Scoring**: Points for reveals, flags, time bonus, and win bonus.
- **Bilingual (FR/EN)**: Full internationalization with live language switching (~190 translation keys).
- **Premium UI**: Sleek, modern interface with glassmorphism aesthetic and toast notifications.
- **First-Click Safety**: Never lose on your first move.
- **Headless Server**: Authoritative server logic with input validation, rate limiting, and name sanitization.
- **Sensitivity Analysis**: Behavioural analytics detects emotional impact of custom media backgrounds.

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v20 or higher)

### Quick Start (Local)

1. Clone the repository:
   ```bash
   git clone https://github.com/olivelb/3d-video-minesweeper.git
   cd 3d-video-minesweeper
   ```

2. Install and start the multiplayer server:
   ```bash
   cd server-multiplayer
   npm install
   npm start
   ```

3. Open `index.html` in your browser (via a local server like Live Server or `npx serve .`).

## 🛠 Project Structure

- `javascripts/`: Core frontend logic, Three.js rendering, and UI components.
- `shared/`: Solver algorithms shared between client and server (GaussianElimination, MinesweeperSolver, SolverBridge, solver-wasm/).
- `server-multiplayer/`: Node.js authoritative game server.
- `css/`: Modern styling and animations.
- `docs/`: Technical documentation and implementation plans.

## 📖 Documentation

- [Multiplayer Status](./docs/MULTIPLAYER_STATUS.md): Current features and dev progress.
- [Architecture Guide](./docs/ARCHITECTURE.md): Technical module hierarchy and data flow.
- [Sensitivity Analysis](./docs/SENSITIVITY_ANALYSIS.md): Behavioural analysis system details.
- [Deployment Guide](./DEPLOYMENT.md): Instructions for Raspberry Pi and Cloudflare deployment.
- [Changelog](./docs/CHANGELOG.md): Version history and release notes.

## 🐞 Debugging

- **Console Logs**: By default, the game runs quietly. To enable detailed verbose logs:
    - Add `?debug=true` to your URL (e.g., `http://localhost:3000/?debug=true`).
    - Or run `localStorage.setItem('minesweeper_debug', 'true')` in the DevTools console and reload.

## 🤝 Contributing

This is a personal project, but feedback and contributions are always welcome! Feel free to open an issue or submit a pull request.

---
*Created with ❤️ by the 3D Minesweeper Team*
