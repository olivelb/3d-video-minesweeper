/**
 * Application configuration
 * Tries local server first, falls back to Koyeb if unavailable
 */

// Server URLs
const SERVERS = {
    // Local development server (PC)
    local: 'http://localhost:3001',

    // Raspberry Pi on LAN (Fastest at home)
    raspberryLocal: 'http://192.168.1.232:3001',

    // Raspberry Pi via Cloudflare (Works from anywhere)
    raspberryCloud: 'https://clearly-exhaust-cove-sword.trycloudflare.com'
};

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
 * Detect the best available server (local first, then Koyeb)
 * @returns {Promise<string>} The URL of the available server
 */
async function detectServer() {
    console.log('[Config] Detecting best server...');

    // 1. Try localhost
    if (await checkServer(SERVERS.local)) {
        console.log('[Config] ✅ Using Localhost');
        return SERVERS.local;
    }

    // 2. Try Raspberry Pi LAN
    if (await checkServer(SERVERS.raspberryLocal)) {
        console.log('[Config] ✅ Using Raspberry Pi (LAN)');
        return SERVERS.raspberryLocal;
    }

    // 3. Try Raspberry Pi Cloud
    // Even if check fails (e.g. CORS on options), we might want to fall back to it
    // But let's try to verify it first.
    if (await checkServer(SERVERS.raspberryCloud)) {
        console.log('[Config] ✅ Using Raspberry Pi (Cloudflare)');
        return SERVERS.raspberryCloud;
    }

    // 4. Fallback - Default to Cloudflare Pi if everything else fails
    console.warn('[Config] ⚠️ No reachable server found. Defaulting to Raspberry Pi (Cloudflare).');
    return SERVERS.raspberryCloud;
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

// Start detection immediately
serverCheckPromise = detectServer().then(url => {
    activeServerUrl = url;
    return url;
});

// For backwards compatibility - will be set after detection
// Initially try local, update async
export let YOUTUBE_SERVER_URL = SERVERS.local;

// Update the exported value when detection completes
serverCheckPromise.then(url => {
    YOUTUBE_SERVER_URL = url;
});

// Export config object for flexibility
export const config = {
    servers: SERVERS,
    getServerUrl
};

