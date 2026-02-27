export default /* glsl */ `
uniform float uTime;
uniform float uLifeTime;
uniform float uSizeStart;
uniform float uStopTime;
uniform float uScale;
uniform vec3 uColorStart;
uniform vec3 uColorEnd;

uniform float uGravity;
uniform float uDrag;

attribute vec3 aVelocity;
attribute float aDelay;

varying vec3 vColor;
varying float vLifeRatio;

void main() {
    float elapsed = uTime / uLifeTime;
    
    // Not yet spawned
    if (elapsed + aDelay < 1.0) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vLifeRatio = 1.0;
        return;
    }
    
    float ageFract = fract(elapsed + aDelay);
    float cycleStartTime = uTime - (ageFract * uLifeTime);
    
    // Check if it should be stopped (cycle started after stop time)
    if (uStopTime >= 0.0 && cycleStartTime > uStopTime + 0.0001) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vLifeRatio = 1.0;
        return;
    }
    
    vLifeRatio = ageFract;
    
    float age = ageFract * uLifeTime;
    
    // Apply drag to velocity if uDrag > 0 (realistic explosion burst)
    float dragAge = uDrag > 0.0 ? (age / (1.0 + age * uDrag)) : age;
    vec3 currentPos = position + aVelocity * dragAge;
    
    // Apply gravity
    currentPos.y -= uGravity * age * age;
    
    vColor = mix(uColorStart, uColorEnd, ageFract);
    
    vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    gl_PointSize = uSizeStart * (uScale / -mvPosition.z);
}
`;
