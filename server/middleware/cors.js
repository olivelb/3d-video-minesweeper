import cors from 'cors';

const allowedOrigins = [
    'http://localhost:5500',      // Live Server
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:5173',      // Vite
    'null'                         // For file:// protocol
];

// Add GitHub Pages domains from environment or default
// Set ALLOWED_ORIGINS env var to comma-separated list of allowed origins
// Example: ALLOWED_ORIGINS=https://yourname.github.io,https://anotherdomain.com
const GITHUB_PAGES_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

// Specific GitHub Pages domains that are allowed (security-focused allowlist)
// Add your GitHub Pages URL here instead of allowing all *.github.io
const ALLOWED_GITHUB_PAGES = [
    // Add your specific GitHub Pages domain here, e.g.:
    // 'https://yourusername.github.io'
    ...GITHUB_PAGES_ORIGINS
];

export const corsMiddleware = cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        // Check localhost
        if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }
        
        // Check explicitly allowed GitHub Pages origins
        if (ALLOWED_GITHUB_PAGES.includes(origin)) {
            return callback(null, true);
        }
        
        // For development: allow any *.github.io if ALLOW_ALL_GITHUB_IO=true
        // WARNING: Only enable this in development environments
        if (process.env.ALLOW_ALL_GITHUB_IO === 'true' && origin.endsWith('.github.io')) {
            console.warn(`[CORS] Allowing github.io origin (dev mode): ${origin}`);
            return callback(null, true);
        }
        
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'X-Video-Title'],
    credentials: false
});
