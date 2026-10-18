import * as THREE from 'three';

/** The corridor owns no clock: replay, cancellation and reduced motion all follow travel progress. */
export function createTransitTimeCorridor(root: THREE.Group) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const material = new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uAspect: { value: 1 }, uPixel: { value: 1 / 360 },
      uReducedMotion: { value: Number(reducedMotion.matches) } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, -.999, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uProgress;
      uniform float uAspect;
      uniform float uPixel;
      uniform float uReducedMotion;
      const float TAU = 6.28318530718;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        float motion = mix(1.0, .08, uReducedMotion);
        float time = uProgress * 4.6 * motion;
        vec2 turn = vec2(sin(uProgress * 4.1) * .055, sin(uProgress * 2.8) * .025);
        turn *= 1.0 - uReducedMotion;
        vec2 p = (vUv - .5) * vec2(2.0 * uAspect, 2.0) - vec2(0.0, .14) - turn;
        float radius = length(p);
        float angle = atan(p.y, p.x + step(radius, .00001) * .00002);
        float depth = log(radius + .075);

        vec3 cyan = vec3(.035, .38, .9);
        vec3 violet = vec3(.37, .075, .68);
        vec3 gold = vec3(.82, .35, .075);
        vec3 curtainColor = mix(cyan, violet, .5 + .5 * sin(time * .82 - .8));
        curtainColor = mix(curtainColor, gold, smoothstep(.3, .95, uProgress) * .5);
        float sweep = .5 + .5 * sin(angle * 3.0 + depth * 2.5 - time * .8);
        float folds = .5 + .5 * sin(angle * 8.0 + depth * 5.4 - time * 1.15);
        float veil = sweep * sweep * (.11 + folds * .2);
        veil *= smoothstep(.04, .4, radius) * (1.0 - smoothstep(1.3, 3.0, radius));
        vec3 color = vec3(.003, .008, .027) + curtainColor * veil;
        color += cyan * .04 * exp(-radius * 1.8);

        // Twelve projected depth layers supply continuous outward motion without ray marching.
        for (int i = 0; i < 12; i++) {
          float layer = float(i);
          float sectorCount = 62.0 + mod(layer, 3.0) * 11.0;
          float angular = fract(angle / TAU + .5 + layer * .137) * sectorCount;
          float sector = floor(angular);
          float seed = hash(vec2(sector + 3.7, layer + 11.3));
          float phase = fract(layer * .618034 + time * (.54 + seed * .16));
          float z = 1.1 - phase;
          float head = (.14 + seed * .28) / z;
          float streak = (.009 + head * head * .25 * motion) * (.65 + seed * .6);
          float tail = max(.025, head - streak);
          float center = .16 + hash(vec2(sector + 17.1, layer + 2.8)) * .68;
          float across = abs(fract(angular) - center) * TAU * radius / sectorCount;
          float width = uPixel * (.55 + phase * .65);
          float line = exp(-across * across / (width * width));
          float ends = smoothstep(tail - uPixel * 2.0, tail + uPixel * 2.0, radius)
            * (1.0 - smoothstep(head, head + uPixel * 2.0, radius));
          float along = clamp((radius - tail) / max(.001, streak), 0.0, 1.0);
          float fade = smoothstep(.015, .11, phase) * (1.0 - smoothstep(.94, 1.0, phase));
          float brightness = line * ends * (.12 + .88 * along) * fade * step(.47, seed);
          vec3 starColor = mix(vec3(.26, .85, 1.5), vec3(1.4, .68, .24), step(.82, seed));
          starColor = mix(starColor, vec3(1.8, 2.1, 2.3), along * .62);
          color += starColor * brightness;
        }

        // The small light ahead is the travelling player, kept readable through every color change.
        float coreRadius = length(p * vec2(1.0, 1.35));
        color += vec3(.12, .78, 1.5) * exp(-coreRadius * 22.0) * 1.2;
        color += vec3(3.0, 4.0, 4.6) * exp(-coreRadius * coreRadius * 2100.0);
        float vignette = 1.0 - smoothstep(.65, 2.0, radius) * .42;
        color *= vignette;
        float entry = 1.0 - smoothstep(0.0, .12, uProgress);
        float exit = smoothstep(.88, 1.0, uProgress);
        color = mix(color, vec3(1.85, 1.98, 2.08), max(entry, exit));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    // ALWAYS keeps depth writes enabled while replacing every pixel, including scene transparency.
    depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, toneMapped: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  plane.name = 'following the player through the time corridor';
  plane.frustumCulled = false;
  plane.renderOrder = 100_000;
  plane.visible = false;
  const viewport = new THREE.Vector4();
  plane.onBeforeRender = (renderer, _scene, camera) => {
    material.uniforms.uAspect!.value = (camera as THREE.PerspectiveCamera).aspect;
    renderer.getCurrentViewport(viewport);
    material.uniforms.uPixel!.value = 2 / viewport.w;
  };
  root.add(plane);
  return {
    update(progress: number): void {
      plane.visible = progress >= 0;
      material.uniforms.uProgress!.value = progress;
      material.uniforms.uReducedMotion!.value = Number(reducedMotion.matches);
    },
  };
}
