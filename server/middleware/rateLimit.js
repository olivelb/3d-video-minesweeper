import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 500,                   // 500 requests per window (more permissive for dev)
    message: {
        error: 'Too many requests, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// More permissive limit for stream endpoint during development
export const streamLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 60,              // 60 streams per minute (1 per second average)
    message: { error: 'Stream rate limit exceeded' }
});
