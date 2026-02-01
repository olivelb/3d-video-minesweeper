/**
 * Application configuration
 * Auto-detects environment and selects appropriate server:
 * - Local development (localhost/127.0.0.1/file://) → tries localhost first, then LAN Pi
 * - GitHub Pages (*.github.io) → uses Cloudflare tunnel only
 * 
 * Server URLs are configurable via:
 * - window.MINESWEEPER_SERVERS (runtime override)
 * - localStorage 'minesweeper_servers' (persisted settings)
 * - servers-local.json (local dev file, gitignored)
 */

/**
 * Detect current environment
 */
function detectEnvironment() {
    if (typeof window === 'undefined') return 'node';
    
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // GitHub Pages
    if (hostname.endsWith('.github.io')) {
        return 'github-pages';
    }
    
    // Local development
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname === '' ||
        protocol === 'file:') {
        return 'local';
    }
    
    // Other hosted environment
    return 'hosted';
}

const ENVIRONMENT = detectEnvironment();
console.log(`[Config] Environment: ${ENVIRONMENT}`);

// Default server configuration per environment
const DEFAULT_SERVERS = {
    'local': {
        local: 'http://localhost:3001',
        raspberryLocal: 'http://raspberrol:3001',  // mDNS name
        raspberryLAN: 'http://192.168.1.232:3001'  // Fallback IP
    },
    'github-pages': {
        // Only Cloudflare tunnel works from GitHub Pages
        // URL is fetched from tunnel.log on the Pi or set via MINESWEEPER_SERVERS
        raspberryCloud: null  // Will be set dynamically or via config
    },
    'hosted': {
        local: 'http://localhost:3001'
    },
    'node': {
        local: 'http://localhost:3001'
    }
};

// Try to load local server configuration (for development)
async function loadLocalConfig() {
    if (ENVIRONMENT !== 'local') return null;
    
    try {
        const response = await fetch('./servers-local.json');
        if (response.ok) {
            const config = await response.json();
            console.log('[Config] Loaded servers-local.json');
            return config;
        }
    } catch (e) {
        // File doesn't exist or can't be loaded - that's fine
    }
    return null;
}

// Load server configuration from multiple sources
async function loadServerConfig() {
    // 1. Check for window-level config (highest priority - set by hosting page)
    if (typeof window !== 'undefined' && window.MINESWEEPER_SERVERS) {
        console.log('[Config] Using window.MINESWEEPER_SERVERS');
        return { ...DEFAULT_SERVERS[ENVIRONMENT], ...window.MINESWEEPER_SERVERS };
    }
    
    // 2. Check localStorage (user persisted settings)
    if (typeof localStorage !== 'undefined') {
        try {
            const stored = localStorage.getItem('minesweeper_servers');
            if (stored) {
                const parsed = JSON.parse(stored);
                console.log('[Config] Using localStorage configuration');
                return { ...DEFAULT_SERVERS[ENVIRONMENT], ...parsed };
            }
        } catch (e) {
            console.warn('[Config] Failed to parse localStorage servers:', e);
        }
    }
    
    // 3. Try loading servers-local.json (local development only)
    const localConfig = await loadLocalConfig();
    if (localConfig) {
        return { ...DEFAULT_SERVERS[ENVIRONMENT], ...localConfig };
    }
    
    // 4. Use defaults for environment
    console.log(`[Config] Using default servers for ${ENVIRONMENT}`);
    return DEFAULT_SERVERS[ENVIRONMENT];
}

let SERVERS = DEFAULT_SERVERS[ENVIRONMENT];

// Will be set after detecting available server
let activeServerUrl = null;
let serverCheckPromise = null;

/**
 * Check if a server is available
 * @param {string} url - Server URL to check
 * @returns {Promise<boolean>}
 */
async function checkServer(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        // Simple health check
        const response = await fetch(`${url}/health`, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        // console.warn(`[Config] Connection failed to ${url}`);
        return false;
    }
}

/**
 * Detect the best available server based on environment
 * @returns {Promise<string>} The URL of the available server
 */
async function detectServer() {
    // Reload config if needed (supports async loading)
    SERVERS = await loadServerConfig();
    
    console.log('[Config] Detecting best server for environment:', ENVIRONMENT);
    
    // Define check order based on environment
    let checkOrder;
    if (ENVIRONMENT === 'github-pages') {
        // GitHub Pages can only reach cloud endpoints
        checkOrder = ['raspberryCloud'];
    } else if (ENVIRONMENT === 'local') {
        // Local dev: try localhost first, then LAN options
        checkOrder = ['local', 'raspberryLocal', 'raspberryLAN', 'raspberryCloud'];
    } else {
        // Generic: try everything
        checkOrder = Object.keys(SERVERS);
    }
    
    for (const key of checkOrder) {
        const url = SERVERS[key];
        if (!url) continue;
        
        if (await checkServer(url)) {
            console.log(`[Config] ✅ Using ${key}: ${url}`);
            return url;
        } else {
            console.log(`[Config] ❌ ${key} unreachable: ${url}`);
        }
    }

    // Fallback
    const fallbackUrl = SERVERS.local || Object.values(SERVERS).find(v => v) || 'http://localhost:3001';
    console.warn(`[Config] ⚠️ No server reachable. Fallback: ${fallbackUrl}`);
    return fallbackUrl;
}

/**
 * Get the active server URL (async, waits for detection)
 * @returns {Promise<string>}
 */
export async function getServerUrl() {
    if (activeServerUrl) {
        return activeServerUrl;
    }

    if (!serverCheckPromise) {
        serverCheckPromise = detectServer().then(url => {
            activeServerUrl = url;
            return url;
        });
    }

    return serverCheckPromise;
}

/**
 * Configure custom server URLs (call before any server operations)
 * @param {Object} servers - Server configuration object
 * @param {string} [servers.local] - Local development server URL
 * @param {string} [servers.raspberryLocal] - Raspberry Pi LAN URL  
 * @param {string} [servers.raspberryCloud] - Raspberry Pi Cloudflare URL
 * @param {boolean} [persist=false] - Save to localStorage for future sessions
 */
export function configureServers(servers, persist = false) {
    Object.assign(SERVERS, servers);
    
    if (persist && typeof localStorage !== 'undefined') {
        localStorage.setItem('minesweeper_servers', JSON.stringify(SERVERS));
    }
    
    // Reset detection to use new servers
    activeServerUrl = null;
    serverCheckPromise = null;
    
    console.log('[Config] Server configuration updated:', Object.keys(SERVERS));
}

/**
 * Wait for server detection to complete
 * Use this at application startup to ensure server is ready
 * @returns {Promise<string>} The detected server URL
 */
export async function waitForServer() {
    return getServerUrl();
}

// Start detection immediately
serverCheckPromise = detectServer().then(url => {
    activeServerUrl = url;
    return url;
});

// For backwards compatibility - use getter to always return current value
// DEPRECATED: Use getServerUrl() instead for async-safe access
let _youtubeServerUrl = SERVERS.local || 'http://localhost:3001';

// Update when detection completes
serverCheckPromise.then(url => {
    _youtubeServerUrl = url;
});

// Export as getter to always return latest value
export { _youtubeServerUrl as YOUTUBE_SERVER_URL };

// Export config object for flexibility
export const config = {
    environment: ENVIRONMENT,
    servers: SERVERS,
    getServerUrl,
    configureServers,
    waitForServer
};

// Export environment for external checks
export { ENVIRONMENT };
