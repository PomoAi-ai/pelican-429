import * as THREE from 'three';

/** 连续的光核与冲击前沿，避免爆炸在远景里碎成点阵。 */
export function createLumaBurst() {
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, charge: { value: 0 }, released: { value: false } },
    vertexShader: /* glsl */`
      varying vec2 vPoint;
      void main() {
        vPoint = position.xy;
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        gl_Position = projectionMatrix * (center + vec4(position.xy, 0.0, 0.0));
      }
    `,
    fragmentShader: /* glsl */`
      uniform float time;
      uniform float charge;
      uniform bool released;
      varying vec2 vPoint;
      float gaussian(float distance) { return exp(-distance * distance); }
      void main() {
        vec2 p = vPoint;
        float r = length(p);
        float a = atan(p.y, p.x);
        float hot;
        float energy;
        float fringe;
        float brightness;
        if (!released) {
          float coreRadius = mix(0.42, 0.16, charge);
          hot = exp(-r * r / (coreRadius * coreRadius)) * (0.6 + charge);
          float gather = gaussian((r - (1.5 - charge * 1.3)) / 0.035);
          energy = gather * pow(max(0.0, cos(a * 2.0 + time * 14.0)), 6.0) * charge * 0.5;
          fringe = exp(-r * 4.0) * charge;
          brightness = hot;
        } else {
          float fade = 1.0 - smoothstep(0.1, 0.55, time);
          float reach = 0.25 + 4.8 * (1.0 - exp(-time * 6.5));
          float ripple = sin(a * 31.0 + time * 8.0) * 0.012
            + sin(a * 47.0 - time * 11.0) * 0.008;
          float edge = reach * (1.0 + ripple);
          float shell = gaussian((r - edge) / 0.055);
          float wake = gaussian((r - edge * 0.975) / 0.12);
          float tears = smoothstep(-0.15, 0.6, sin(a * 3.0 + 0.8) + sin(a * 7.0) * 0.35);
          float rays = pow(max(0.0, cos(a * 11.0 + 0.6)), 90.0 + r * 25.0);
          float rayLength = reach * (0.85 + 0.25 * sin(a * 7.0));
          float rayBody = smoothstep(reach * 0.12, reach * 0.4, r)
            * (1.0 - smoothstep(rayLength * 0.45, rayLength, r));
          float flash = exp(-time * 10.0);
          float nucleus = exp(-r * r / (0.14 + time * 0.8));
          float crown = 0.55 + 0.45 * pow(max(0.0, cos(a * 8.0 + 0.3)), 8.0);
          float coreRadius = (0.35 + 1.6 * (1.0 - exp(-time * 23.0))) * exp(-time * 4.5);
          float impact = 1.0 - smoothstep(coreRadius * crown * 0.45, coreRadius * crown, r);
          float cross = exp(-abs(p.y) * 28.0 - abs(p.x) * 0.7)
            + exp(-abs(p.x) * 35.0 - abs(p.y) * 1.3);
          hot = nucleus * exp(-time * 7.0) * 2.8 + impact * 2.2 + cross * flash;
          energy = (shell * tears + rays * rayBody * 1.8) * fade;
          fringe = wake * tears * fade * 0.5;
          brightness = max(shell * tears, rays * rayBody);
        }
        float alpha = min(1.0, hot + energy * 0.85 + fringe * 0.3);
        if (alpha < 0.004) discard;
        vec3 blue = vec3(0.025, 0.65, 1.6);
        vec3 cyan = vec3(0.6, 2.4, 3.2);
        vec3 color = mix(blue, cyan, clamp(brightness, 0.0, 1.0));
        color = mix(color, vec3(2.8, 3.2, 3.6), clamp(hot, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), material);
  mesh.renderOrder = 4;
  return mesh;
}
