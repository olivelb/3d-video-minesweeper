export default `
uniform sampler2D uTexture;
varying vec3 vColor;
varying float vLifeRatio;

void main() {
    if (vLifeRatio >= 1.0) discard;
    vec4 texColor = texture2D(uTexture, gl_PointCoord);
    gl_FragColor = vec4(vColor * texColor.rgb, texColor.a);
}
`;
