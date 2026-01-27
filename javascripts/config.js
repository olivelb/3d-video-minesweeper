/**
 * Application configuration
 * Tries local server first, falls back to Koyeb if unavailable
 */

// Server URLs
const SERVERS = {
    // Local development server (priority)
    local: 'http://localhost:3001',
    
    // Production server on Koyeb (fallback)
    production: 'https://flaky-caroline-visionova-sas-d785f85f.koyeb.app'
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
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
        
        const response = await fetch(`${url}/health`, {
            method: 'GET',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        return false;
    }
}

/**
 * Detect the best available server (local first, then Koyeb)
 * @returns {Promise<string>} The URL of the available server
 */
async function detectServer() {
    // Try local server first
    const localAvailable = await checkServer(SERVERS.local);
    
    if (localAvailable) {
        return SERVERS.local;
    }
    
    // Fall back to Koyeb
    const koyebAvailable = await checkServer(SERVERS.production);
    
    if (koyebAvailable) {
        return SERVERS.production;
    }
    
    // Both unavailable - return Koyeb anyway (might come online later)
    return SERVERS.production;
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

