export const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);
    
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
    
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
        code: 'INTERNAL_ERROR'
    });
};
