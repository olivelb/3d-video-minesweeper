export const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);
    
    // Always add CORS headers on errors
    const origin = req.get('origin');
    if (origin && (origin.endsWith('.github.io') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
        res.set('Access-Control-Allow-Origin', origin);
    } else {
        res.set('Access-Control-Allow-Origin', '*');
    }
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    
    // Handle specific YouTube errors
    if (err.message.includes('Video unavailable') || err.message.includes('video is unavailable')) {
        return res.status(404).json({
            error: 'Video not found or unavailable',
            code: 'VIDEO_UNAVAILABLE'
        });
    }
    
    if (err.message.includes('age-restricted') || err.message.includes('Sign in to confirm your age')) {
        return res.status(403).json({
            error: 'This video is age-restricted and cannot be streamed',
            code: 'AGE_RESTRICTED'
        });
    }
    
    if (err.message.includes('private video') || err.message.includes('Video is private')) {
        return res.status(403).json({
            error: 'This video is private',
            code: 'PRIVATE_VIDEO'
        });
    }
    
    if (err.message.includes('copyright') || err.message.includes('blocked')) {
        return res.status(403).json({
            error: 'This video is blocked or has copyright restrictions',
            code: 'BLOCKED'
        });
    }

    if (err.message.includes('CORS')) {
        return res.status(403).json({
            error: 'Cross-origin request blocked',
            code: 'CORS_ERROR'
        });
    }
    
    // YouTube bot detection / datacenter IP blocking
    if (err.message.includes('Sign in to confirm') || err.message.includes('bot') || 
        err.message.includes('unusual traffic') || err.message.includes('HTTP Error 403')) {
        return res.status(503).json({
            error: 'YouTube a détecté notre serveur comme un bot. Essayez avec Internet Archive ou une URL directe.',
            code: 'YOUTUBE_BLOCKED',
            suggestion: 'https://archive.org/details/BigBuckBunny_124'
        });
    }
    
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        code: 'INTERNAL_ERROR'
    });
};
