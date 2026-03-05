/**
 * SocketEvents — Single source of truth for Socket.IO wire-level event names.
 *
 * Used by both server (GameServerNode.ts, GameServer.ts) and
 * client (NetworkManager.ts) to prevent typos and ensure consistency.
 */

export const SocketEvents = {
    // ─── Client → Server ────────────────────────────────────────────────
    JOIN: 'join',
    CREATE_GAME: 'createGame',
    JOIN_GAME: 'joinGame',
    START_GAME: 'startGame',
    ACTION: 'action',
    CURSOR: 'cursor',

    // ─── Server → Client ────────────────────────────────────────────────
    WELCOME: 'welcome',
    LOBBY_UPDATE: 'lobbyUpdate',
    GAME_CREATED: 'gameCreated',
    GAME_START: 'gameStart',
    GAME_READY: 'gameReady',
    GAME_UPDATE: 'gameUpdate',
    GAME_OVER: 'gameOver',
    GAME_ENDED: 'gameEnded',
    GENERATING_GRID: 'generatingGrid',
    STATE_SYNC: 'stateSync',
    MINES_PLACED: 'minesPlaced',
    CURSOR_UPDATE: 'cursorUpdate',

    // ─── Player Events ──────────────────────────────────────────────────
    PLAYER_JOINED: 'playerJoined',
    PLAYER_LEFT: 'playerLeft',
    PLAYER_ELIMINATED: 'playerEliminated',
    HOST_LEFT: 'hostLeft',

    // ─── System ─────────────────────────────────────────────────────────
    ERROR: 'error',
} as const;
