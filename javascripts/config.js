/**
 * Application configuration
 * Automatically detects environment and uses appropriate server URL
 */

// Detect if running on GitHub Pages or locally
const isProduction = window.location.hostname.endsWith('.github.io') || 
                     window.location.hostname.includes('koyeb') ||
                     !window.location.hostname.includes('localhost');

// Server URLs
const SERVERS = {
    // Local development server
    local: 'http://localhost:3001',
    
    // Production server on Koyeb (UPDATE THIS after deployment!)
    // Format: https://your-app-name-your-username.koyeb.app
    production: 'https://minesweeper-youtube-proxy.koyeb.app'
};

// Export the active server URL
export const YOUTUBE_SERVER_URL = isProduction ? SERVERS.production : SERVERS.local;

// Export config object for flexibility
export const config = {
    isProduction,
    serverUrl: YOUTUBE_SERVER_URL,
    servers: SERVERS
};

console.log(`[Config] Environment: ${isProduction ? 'production' : 'development'}`);
console.log(`[Config] YouTube Server: ${YOUTUBE_SERVER_URL}`);
