import * as THREE from 'three';

/** 固定容量的软粒子；尺寸与角色一起缩放，并使用当前离屏预览的像素高度。 */
export function createParticleCloud(count: number, color: THREE.ColorRepresentation) {
  const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sizes = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  const alphas = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setAttribute('size', sizes);
  geometry.setAttribute('alpha', alphas);
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, viewportHeight: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float size;
      attribute float alpha;
      uniform float viewportHeight;
      varying float vAlpha;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float scale = max(length(modelMatrix[0].xyz), length(modelMatrix[2].xyz));
        gl_PointSize = size * scale * viewportHeight * projectionMatrix[1][1] * 0.5 / gl_Position.w;
        vAlpha = alpha;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float edge = 1.0 - smoothstep(0.15, 1.0, radius);
        float core = 1.0 - smoothstep(0.0, 0.5, radius);
        float opacity = vAlpha * edge * edge;
        if (opacity < 0.003) discard;
        gl_FragColor = vec4(mix(color, vec3(2.0, 2.8, 3.4), core * 0.88), opacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const viewport = new THREE.Vector4();
  points.onBeforeRender = renderer => {
    renderer.getCurrentViewport(viewport);
    material.uniforms.viewportHeight!.value = viewport.w;
  };
  return { points, positions, sizes, alphas };
}

export function createThruster(socket: THREE.Object3D) {
  const root = new THREE.Group();
  root.name = `${socket.name}-plume`;
  const nozzleWidth = socket.name.startsWith('fx_wrist') ? 0.36 : 0.42;
  const beamGeometry = new THREE.PlaneGeometry(nozzleWidth, 1.2);
  beamGeometry.translate(0, -0.6, 0);
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: { phase: { value: 0 }, strength: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float phase;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        float age = 1.0 - vUv.y;
        float bend = sin(age * 15.0 - phase * 2.0) * age * 0.07;
        float x = abs(vUv.x * 2.0 - 1.0 - bend);
        float width = 0.64 + age * 0.25;
        float outerDistance = x / width;
        float innerDistance = x / (width * 0.18);
        float sheath = exp(-outerDistance * outerDistance * 1.8);
        float core = exp(-innerDistance * innerDistance * 2.0);
        float pulse = sin(age * 34.0 - phase * 4.0);
        float flow = 0.78 + 0.22 * pulse * pulse;
        float fade = pow(max(0.0, 1.0 - age), 1.35);
        float hotCore = core * exp(-age * 4.0);
        float alpha = min(1.0, (sheath * 0.36 + hotCore) * fade * flow * strength);
        if (alpha < 0.003) discard;
        vec3 blue = mix(vec3(0.012, 0.22, 0.9), vec3(0.04, 0.5, 1.8), sheath);
        gl_FragColor = vec4(mix(blue, vec3(2.8, 3.8, 4.8), hotCore), alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: THREE.NormalBlending,
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  const crossBeam = new THREE.Mesh(beamGeometry, beamMaterial);
  crossBeam.rotation.y = Math.PI / 2;
  const cloud = createParticleCloud(128, '#299cfa');
  cloud.points.name = `${socket.name}-jet-particles`;
  root.add(beam, crossBeam, cloud.points);
  socket.add(root);
  return {
    root,
    update(time: number, strength: number) {
      root.visible = strength > 0;
      const width = 0.7 + strength * 0.3;
      root.scale.set(width, Math.sqrt(strength), width);
      // 1.2 秒也是 2.4 秒悬停的公周期；从绝对时间求相位，暂停或重播不会积累粒子状态。
      const phase = time / 1.2 * Math.PI * 2;
      beamMaterial.uniforms.phase!.value = phase;
      beamMaterial.uniforms.strength!.value = strength;
      for (let i = 0; i < 128; i++) {
        const stream = Math.floor(i / 4);
        const segment = i % 4;
        const age = (time / 0.3 + stream * 0.61803398875 + segment * 0.014) % 1;
        const angle = stream * 2.399963 + Math.sin(phase + stream) * age * 0.3;
        const spread = (0.018 + age * 0.13) * (0.45 + (stream % 5) / 8);
        cloud.positions.setXYZ(i, Math.cos(angle) * spread, -0.012 - age * 1.2, Math.sin(angle) * spread);
        cloud.sizes.setX(i, (0.03 + (stream % 4) * 0.006) * (1 - age * 0.4));
        cloud.alphas.setX(i, Math.sin(age * Math.PI) ** 0.4 * (1 - age) * (1.2 - segment * 0.14) * strength);
      }
      cloud.positions.needsUpdate = cloud.sizes.needsUpdate = cloud.alphas.needsUpdate = true;
    },
  };
}
