import * as THREE from 'three';

const BLACKHOLE_FRAGMENT = `
uniform sampler2D uImage;
uniform float uTime;
varying vec2 vUv;
void main() {
  const vec2 center = vec2(0.503, 0.493);
  vec2 p = (vUv - center) * 2.0;
  float r = length(p);
  float angle = atan(p.y, p.x);
  vec4 image = texture2D(uImage, vUv);
  float core = 1.0 - smoothstep(0.27, 0.294, r);
  float alpha = max(image.a, core);
  if (alpha < 0.001) discard;

  // The outline and tilted disk stay fixed; different radii carry filaments at different speeds.
  float along = dot(p, vec2(0.94, -0.342));
  float across = dot(p, vec2(0.342, 0.94));
  float disk = 1.0 - smoothstep(0.035, 0.085, abs(across));
  float ring = smoothstep(0.29, 0.36, r) * (1.0 - smoothstep(0.83, 0.98, r));
  float flowMask = ring * (1.0 - disk);
  float orbit = angle - uTime * (0.24 + 0.16 / max(r, 0.3));
  vec2 orbitUv = center + vec2(cos(orbit), sin(orbit)) * r * 0.5;
  vec4 flowing = texture2D(uImage, orbitUv);
  vec3 color = mix(image.rgb, flowing.rgb, flowMask * flowing.a * 0.76);

  // Logarithmic bands travel inward while their bright heads orbit the event horizon.
  float spiral = angle * 3.0 + log(max(r, 0.29)) * 13.0 + uTime * 3.6;
  float arc = pow(0.5 + 0.5 * sin(spiral), 12.0);
  float threads = pow(0.5 + 0.5 * sin(angle * 11.0 + r * 55.0 + uTime * 5.4), 18.0);
  color *= 1.0 - flowMask * (0.28 - arc * 0.55);
  color += vec3(0.24, 0.42, 0.68) * (arc * 0.34 + threads * 0.15) * flowMask * image.a;

  // Both sides converge on the central gap instead of a stationary painted light tear.
  float infall = pow(0.5 + 0.5 * sin(abs(along) * 65.0 + uTime * 7.0), 6.0);
  float tear = (1.0 - smoothstep(0.025, 0.06, abs(across)))
    * smoothstep(0.018, 0.10, abs(along));
  color = mix(color, image.rgb * (0.45 + infall * 0.95), disk * ring);
  color *= 1.0 - core;
  color += image.rgb * core * tear * (0.22 + infall * 1.1);
  float strand = exp(-pow(across * 155.0, 2.0)) * tear * infall;
  color += vec3(0.48, 0.64, 0.88) * strand * 0.28 * image.a;

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** A single authored silhouette with independent accretion and inward light flow. */
export function createFortressBlackhole(texture: THREE.Texture) {
  const time = { value: 0 };
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uImage: { value: texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: BLACKHOLE_FRAGMENT,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  material.userData.noLightMap = true;
  material.userData.noCloudShadow = true;
  material.userData.noPrecip = true;
  const geometry = new THREE.PlaneGeometry(24, 24);
  const root = new THREE.Mesh(geometry, material);
  root.name = 'fortress-black-hole';
  root.position.set(4, 29, -5);
  return {
    root,
    update(value: number): void { time.value = value; },
    dispose(): void {
      root.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
