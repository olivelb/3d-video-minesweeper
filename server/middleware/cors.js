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
const GITHUB_PAGES_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .filter(Boolean);

export const corsMiddleware = cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        // Check localhost
        if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }
        
        // Check GitHub Pages origins
        if (GITHUB_PAGES_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        
        // Allow any *.github.io origin (for flexibility)
        if (origin.endsWith('.github.io')) {
            return callback(null, true);
        }
        
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'X-Video-Title'],
    credentials: false
});
