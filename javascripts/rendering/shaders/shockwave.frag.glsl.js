export default `
uniform sampler2D tDiffuse;
uniform vec2 uCenter;
uniform float uAspect;
uniform float uTime;
uniform float uLifeTime;
uniform float uActive;
uniform float uSpeed;
uniform float uFrequency;
uniform float uStrength;
varying vec2 vUv;

void main() {
    if (uActive < 0.5) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
    }

    float progress = uTime / uLifeTime;
    
    // Correct for aspect ratio to keep the ripple perfectly circular
    vec2 p = vUv - uCenter;
    p.x *= uAspect;
    
    float dist = length(p);
    
    // Create an expanding ring for the ripple
    // -----------------------------------------
    // distance-based dampening (closer to center = stronger, further = weaker)
    // progress-based dampening (fades out as it ages)
    float dampening = smoothstep(0.0, 0.1, dist) * smoothstep(1.0, 0.8, progress);
    
    // The core ripple math: multiple concentric waves radiating outward
    // dist * frequency - uTime * speed
    // Higher frequency = more rings
    float frequency = uFrequency;
    float speed = uSpeed; 
    
    // Only show ripple where the "wavefront" has reached
    // The wave expands at roughly 1.5 radius over 1.0 lifeTime
    float waveFront = progress * 1.5;
    float waveMask = smoothstep(waveFront + 0.1, waveFront - 0.1, dist);
    
    // Calculate raw sine wave distortion
    // Decays by 1/dist to simulate energy spread
    float rawWave = sin(dist * frequency - uTime * speed) / (dist + 0.1);
    
    // Base strength of the refraction (very low for realistic glass/water)
    // Apply exponential time-damping so amplitude drops from STRENGTH to 0 over LIFETIME
    float timeDamping = pow(1.0 - progress, 2.0); // quadratic decay
    float strength = uStrength * timeDamping;
    
    // Final distortion amount
    float waveEffect = rawWave * dampening * waveMask * strength;
    
    // Distort UV radially
    vec2 dir = normalize(p);
    dir.x /= uAspect; // Re-adjust aspect ratio for the UV distortion addition
    
    // Calculate distorted UV
    vec2 distortedUv = vUv + dir * waveEffect;
    
    // Handle edges smoothly (mirroring instead of clamping to avoid black bars)
    if(distortedUv.x < 0.0) distortedUv.x = -distortedUv.x;
    if(distortedUv.x > 1.0) distortedUv.x = 2.0 - distortedUv.x;
    if(distortedUv.y < 0.0) distortedUv.y = -distortedUv.y;
    if(distortedUv.y > 1.0) distortedUv.y = 2.0 - distortedUv.y;
    
    // Sample the scene texture at the distorted UV
    // We output PURE texture color, NO added highlights to prevent grey/white bands
    vec4 texColor = texture2D(tDiffuse, distortedUv);
    
    gl_FragColor = texColor;
}
`;
