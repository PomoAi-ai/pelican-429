import * as THREE from 'three';

function createPlume(parent: THREE.Object3D, width: number, merged: boolean) {
  const root = new THREE.Group();
  root.name = merged ? 'combined high pressure engine plume' : 'short individual nozzle jet';
  parent.add(root);
  const geometry = new THREE.PlaneGeometry(width, 1);
  geometry.translate(0, -.5, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uLength: { value: 1 },
      uWidth: { value: width }, uMerged: { value: Number(merged) } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vWorldY;
      void main() {
        vUv = uv;
        vWorldY = (modelMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uPower;
      uniform float uLength;
      uniform float uWidth;
      uniform float uMerged;
      varying vec2 vUv;
      varying float vWorldY;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        if (vWorldY < .08) discard;
        float t = 1.0 - vUv.y;
        float axial = t * uLength;
        float lateral = (vUv.x - .5) * uWidth;
        float coarse = noise(vec2(lateral * 1.8, axial * .72 - uTime * 9.0));
        float medium = noise(vec2(lateral * 4.8 + 21.3, axial * 2.1 - uTime * 18.0));
        float fine = noise(vec2(lateral * 12.0 - 8.2, axial * 5.1 - uTime * 31.0));
        float flow = coarse * .5 + medium * .33 + fine * .17;
        float mixing = smoothstep(.12, .85, t);
        float drift = (noise(vec2(axial * .37 - uTime * 2.0, 17.1)) - .5) * mixing * .12;
        float x = abs(lateral + drift);

        float cell = axial / (1.45 + t * .72);
        float cellIndex = floor(cell);
        float cellOffset = (hash(vec2(cellIndex, 4.7)) - .5) * .16;
        float cellPhase = fract(cell) - .5 + cellOffset;
        float compression = exp(-cellPhase * cellPhase * 95.0) * (.72 + .28 * hash(vec2(cellIndex, 9.3)));
        float coreRadius = mix(.3 + t * .26, 1.65 + .2 * smoothstep(.05, .55, t), uMerged);
        coreRadius += ((medium - .5) * .27 + (fine - .5) * .16) * uMerged;
        coreRadius *= 1.0 - compression * mix(.16, .055, uMerged);
        float core = 1.0 - smoothstep(coreRadius * .8, coreRadius, x);
        float coreBreakup = mix(1.0, .72 + .28 * smoothstep(.24, .66, flow), mixing * uMerged);
        core *= coreBreakup * (1.0 - smoothstep(mix(.45, .6, uMerged), .97, t + (medium - .5) * mixing * .13));
        core *= .85 + compression * .15;

        // Only the short throat jets remain separate; the downstream flow has one shared axis.
        float radius = mix(.49 + t * .66, 2.05 + 1.35 * smoothstep(.1, .96, t), uMerged);
        float raggedRadius = radius + ((coarse - .5) * .86 + (fine - .5) * .22) * mixing;
        float sheath = 1.0 - smoothstep(raggedRadius * .64, raggedRadius + .07, x);
        float breakup = mix(1.0, smoothstep(.2, .68, flow), mixing);
        float tail = 1.0 - smoothstep(mix(.45, .74, uMerged) + coarse * .15, 1.0, t);
        float combustion = sheath * breakup * tail * (.42 + flow * .38);
        float join = mix(1.0, smoothstep(0.0, .85, axial), uMerged);
        float alpha = min(.97, (core * .92 + combustion * .72) * min(1.0, uPower * 1.8)) * join;
        if (alpha < .004) discard;
        #ifdef PLUME_CORE
          if (core < .65 || alpha < .94) discard;
        #endif
        vec3 mixedFire = mix(vec3(2.5, .6, .08), vec3(3.7, 1.7, .37), flow);
        float coolThroat = (1.0 - smoothstep(.25, 1.8, axial)) * (1.0 - uMerged);
        vec3 flame = mix(mixedFire, vec3(.65, 1.5, 2.4), coolThroat * .55);
        float whiteHeat = smoothstep(.14, .72, core);
        flame = mix(flame, vec3(4.8, 4.65, 4.1), whiteHeat);
        flame += vec3(.4, .5, .65) * compression * core;
        gl_FragColor = vec4(flame, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    toneMapped: false, blending: THREE.NormalBlending,
  });
  // The dense core supplies its own depth so background AO and reflections cannot stain the flame.
  const coreMaterial = material.clone();
  coreMaterial.uniforms = material.uniforms;
  coreMaterial.defines = { PLUME_CORE: true };
  coreMaterial.transparent = false;
  coreMaterial.depthWrite = true;
  coreMaterial.colorWrite = false;
  for (let i = 0; i < 3; i++) {
    const sheet = new THREE.Mesh(geometry, material);
    sheet.name = merged ? 'unified white hot core and fragmented mixing layer' : 'nozzle exit pressure core';
    sheet.rotation.y = i * Math.PI / 3;
    sheet.frustumCulled = false;
    root.add(sheet);
    const coreSheet = new THREE.Mesh(geometry, coreMaterial);
    coreSheet.rotation.copy(sheet.rotation);
    coreSheet.frustumCulled = false;
    root.add(coreSheet);
  }
  return {
    root,
    update(time: number, power: number, length: number): void {
      root.visible = power > .002;
      const widthScale = .82 + power * .18;
      root.scale.set(widthScale, length, widthScale);
      material.uniforms.uTime!.value = time;
      material.uniforms.uPower!.value = power;
      material.uniforms.uLength!.value = length;
    },
  };
}

/** Short nozzle jets overlap one combined plume before the flow reaches three units below the bells. */
export function createRocketExhaust(rocket: THREE.Group, emitters: readonly THREE.Object3D[]) {
  const throats = emitters.map(emitter => createPlume(emitter, 2.6, false));
  const main = createPlume(rocket, 8.4, true);
  const outlet = emitters.reduce((sum, emitter) => sum.add(emitter.position), new THREE.Vector3()).divideScalar(emitters.length);
  main.root.position.copy(outlet);
  main.root.position.y -= 1.5;
  return {
    update(time: number, power: number, speed: number): void {
      throats.forEach((throat, index) => throat.update(time + index * .19, power, 3.2));
      const pulse = 1 + .008 * Math.sin(time * 53) + .005 * Math.sin(time * 97);
      const length = (3 + 11 * Math.sqrt(power) + Math.min(13, speed * .9)) * pulse;
      main.update(time, power, length - 1.5);
    },
  };
}
