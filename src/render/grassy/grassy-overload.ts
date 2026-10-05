import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HUMAN_SKILLS } from '../../config/human-combat.ts';
import { createParticleCloud } from './grassy-particles.ts';

const clamp = THREE.MathUtils.clamp;
const ease = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const noise = (index: number) => { const value = Math.sin(index * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
const RELEASE = HUMAN_SKILLS.server_overload.release / HUMAN_SKILLS.server_overload.ticks;
const CORE_Y = 4.05;

function light(color: string, opacity = 1) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
  // 能量核心与状态灯自发光，不随地下的环境光照图熄灭。
  material.userData.noLightMap = true;
  return material;
}

function createServerArray(root: THREE.Group) {
  const shell = new THREE.MeshStandardMaterial({ color: '#243b55', metalness: 0.65, roughness: 0.32 });
  const rim = new THREE.MeshStandardMaterial({ color: '#abc4d4', metalness: 0.68, roughness: 0.25 });
  const inset = new THREE.MeshStandardMaterial({ color: '#101d30', metalness: 0.5, roughness: 0.4 });
  const cyan = light('#45d6ff');
  const amber = light('#ff9e36');
  const body = new RoundedBoxGeometry(1.65, 0.54, 0.67, 2, 0.075);
  const lid = new RoundedBoxGeometry(1.72, 0.07, 0.71, 2, 0.025);
  const face = new THREE.BoxGeometry(1.35, 0.35, 0.04);
  const slot = new THREE.BoxGeometry(1.05, 0.035, 0.025);
  const vent = new THREE.BoxGeometry(0.17, 0.027, 0.025);
  const rail = new THREE.BoxGeometry(0.07, 0.43, 0.045);
  const port = new THREE.BoxGeometry(0.04, 0.045, 0.025);
  const servers = Array.from({ length: 4 }, (_, i) => {
    const rack = new THREE.Group();
    rack.add(new THREE.Mesh(body, shell));
    for (const y of [-0.29, 0.29]) {
      const panel = new THREE.Mesh(lid, rim);
      panel.position.y = y;
      rack.add(panel);
    }
    const front = new THREE.Mesh(face, inset);
    front.position.z = 0.35;
    rack.add(front);
    for (let j = 0; j < 3; j++) {
      const strip = new THREE.Mesh(slot, cyan);
      strip.position.set(-0.08, (j - 1) * 0.1, 0.38);
      rack.add(strip);
    }
    for (let j = 0; j < 7; j++) {
      const grille = new THREE.Mesh(vent, amber);
      grille.position.set(0.57, (j - 3) * 0.048, 0.38);
      rack.add(grille);
    }
    for (const x of [-0.74, 0.74]) {
      const handle = new THREE.Mesh(rail, rim);
      handle.position.set(x, 0, 0.38);
      rack.add(handle);
    }
    for (let j = 0; j < 8; j++) {
      const socket = new THREE.Mesh(port, cyan);
      socket.position.set(-0.48 + j * 0.11, -0.225, 0.37);
      rack.add(socket);
    }
    const side = i < 2 ? -1 : 1;
    root.add(rack);
    return { rack, x: side * (i % 2 ? 2.55 : 2.35), y: i % 2 ? 3.35 : 1.95, side };
  });
  return { servers, cyan, amber };
}

function createShockwave(root: THREE.Group) {
  const group = new THREE.Group();
  // 微倾的实体波面在横版镜头中仍有宽度，避免水平圆环只剩一条线。
  group.rotation.x = Math.PI / 2 - 0.3;
  const material = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 }, phase: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 point;
      void main() {
        point = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float opacity;
      uniform float phase;
      varying vec2 point;
      void main() {
        float radius = length(point);
        float angle = atan(point.y, point.x);
        float rim = exp(-pow((radius - 0.97) * 95.0, 2.0));
        float wake = smoothstep(0.67, 0.88, radius) * (1.0 - smoothstep(0.98, 1.0, radius));
        float striae = 0.55 + 0.45 * pow(sin(radius * 180.0 - angle * 6.0 + phase * 40.0), 2.0);
        float alpha = (rim + wake * striae * 0.58) * opacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(mix(vec3(0.005, 0.16, 0.85), vec3(1.8, 2.6, 3.0), rim), alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    toneMapped: false,
  });
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.965, 0.008, 6, 128), light('#bcf9ff'));
  group.add(new THREE.Mesh(new THREE.RingGeometry(0.65, 1, 128, 1), material), lip);
  root.add(group);
  return { group, material, lip };
}

function createCore(root: THREE.Group) {
  const group = new THREE.Group();
  group.position.set(0, CORE_Y, -0.7);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), light('#edffff'));
  const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.57, 2), light('#29bfff', 0.15));
  const arcs = Array.from({ length: 3 }, (_, i) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.6 + i * 0.12, 0.018, 6, 64, Math.PI * 1.45), light(i === 2 ? '#ffb95d' : '#58dfff'));
    arc.rotation.set(i * 0.8, i * 0.9, i * 2.1);
    group.add(arc);
    return arc;
  });
  const fragments = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshStandardMaterial({
    color: '#adcadd', metalness: 0.7, roughness: 0.3, emissive: '#1684ad', emissiveIntensity: 0.5,
  }), 12);
  fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fragments.frustumCulled = false;
  group.add(crystal, glow, fragments);
  root.add(group);
  return { group, crystal, glow, arcs, fragments };
}

function createElectricLinks(root: THREE.Group) {
  const positions = new THREE.Float32BufferAttribute(new Float32Array(4 * 20 * 6), 3).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  const material = new THREE.LineBasicMaterial({ color: '#329fff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.frustumCulled = false;
  root.add(mesh);
  return { positions, material };
}

/** 所有相位按绝对进度重建；实体波面与逻辑伤害在同一帧释放。 */
export function createServerOverload(parent: THREE.Group) {
  const root = new THREE.Group();
  root.name = 'grassy-server-overload';
  parent.add(root);
  const { servers, cyan, amber } = createServerArray(root);
  const core = createCore(root);
  const links = createElectricLinks(root);
  const waves = [createShockwave(root), createShockwave(root)];
  const data = createParticleCloud(240, '#39caff');
  const sparks = createParticleCloud(80, '#ffad4a');
  const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.065, 0.025), light('#5bdcff'), 40);
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chips.frustumCulled = false;
  root.add(data.points, sparks.points, chips);
  const transform = new THREE.Object3D();

  return {
    root,
    update(progress: number) {
      root.visible = progress > 0.18 && progress < 1;
      const rise = ease((progress - 0.18) / 0.15);
      const charge = ease((progress - 0.34) / (RELEASE - 0.34));
      const released = progress >= RELEASE;
      const blast = clamp((progress - RELEASE) / (1 - RELEASE), 0, 1);
      const fade = 1 - ease((progress - 0.9) / 0.1);
      const impact = released ? Math.exp(-blast * 18) : 0;
      cyan.opacity = rise * fade * (0.7 + charge * 0.3);
      amber.opacity = charge * fade * (0.45 + Math.sin(progress * 140) ** 2 * 0.55);
      for (let i = 0; i < servers.length; i++) {
        const { rack, x, y, side } = servers[i]!;
        rack.position.set(x * rise * (1 + blast * 0.2), y - (1 - rise) * 0.65 + Math.sin(progress * 12 + i) * 0.045, -0.95);
        rack.rotation.set(-0.1, side * -0.18, side * (i % 2 ? -0.16 : 0.12) + side * impact * 0.1);
        rack.scale.setScalar(rise * (1 - ease((progress - 0.92) / 0.08)));
      }
      core.group.scale.setScalar(rise * fade);
      core.crystal.rotation.set(progress * 4, progress * 7, 0.2);
      core.crystal.scale.setScalar(0.45 + charge * 0.7 + impact * 0.75);
      core.crystal.material.opacity = (released ? (1 - blast) ** 2 : 0.7 + charge * 0.3) * fade;
      core.glow.scale.setScalar(0.7 + charge * 0.4 + impact * 1.8);
      core.glow.material.opacity = (0.06 + charge * 0.06 + impact * 0.28) * fade;
      for (let i = 0; i < core.arcs.length; i++) {
        const arc = core.arcs[i]!;
        arc.rotation.z = i * 2.1 + progress * (i % 2 ? -5 : 5);
        arc.scale.setScalar(0.65 + charge * 0.35 + blast * 0.4);
        arc.material.opacity = rise * (1 - blast) * fade;
      }
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2 + progress * 1.8;
        const radius = 0.57 + blast * (0.75 + noise(i) * 0.65);
        transform.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.75, Math.sin(i * 2.4) * radius * 0.35);
        transform.rotation.set(angle, progress * 6 + i, angle * 0.4);
        transform.scale.set(0.5, 1.1, 0.6);
        transform.updateMatrix();
        core.fragments.setMatrixAt(i, transform.matrix);
      }
      core.fragments.instanceMatrix.needsUpdate = true;
      links.material.opacity = (0.25 + charge * 0.75) * rise * (released ? Math.max(0, 1 - blast * 5) : 1);
      for (let i = 0; i < servers.length; i++) {
        const rack = servers[i]!.rack;
        for (let j = 0; j <= 20; j++) {
          const t = j / 20;
          const arch = Math.sin(t * Math.PI);
          const jag = Math.sin(j * 11.3 + i * 3 + Math.floor(progress * 80)) * arch * (0.03 + charge * 0.1);
          const x = rack.position.x * (1 - t) + jag;
          const y = (rack.position.y + 0.3) * (1 - t) + CORE_Y * t + arch * 0.12 + jag;
          const z = -0.95 * (1 - t) - 0.7 * t;
          if (j < 20) links.positions.setXYZ((i * 20 + j) * 2, x, y, z);
          if (j > 0) links.positions.setXYZ((i * 20 + j - 1) * 2 + 1, x, y, z);
        }
      }
      links.positions.needsUpdate = true;
      for (let i = 0; i < waves.length; i++) {
        const { group, material, lip } = waves[i]!;
        const age = (progress - RELEASE - i * 0.025) / 0.22;
        const t = clamp(age, 0, 1);
        group.visible = age >= 0 && age < 1;
        group.scale.setScalar(0.8 + Math.sqrt(t) * (5 - i * 0.4));
        group.position.y = 1.25 - i * 0.08;
        const opacity = (1 - ease((t - 0.5) / 0.5)) * (i ? 0.4 : 1);
        material.uniforms.opacity!.value = opacity;
        material.uniforms.phase!.value = progress;
        lip.material.opacity = opacity;
      }
      for (let i = 0; i < 240; i++) {
        const seed = noise(i);
        const rack = servers[i % 4]!.rack;
        const travel = (progress * (2 + charge * 3) + seed) % 1;
        const angle = i * 2.39996;
        const radius = 0.8 + Math.sqrt(blast) * (4.5 + seed * 0.9);
        if (released) {
          data.positions.setXYZ(i, Math.cos(angle) * radius, 1.25 + Math.sin(angle) * radius * 0.22 + (seed - 0.5) * 0.22, Math.sin(angle) * radius * 0.95);
        } else {
          data.positions.setXYZ(i, rack.position.x * (1 - travel), (rack.position.y + 0.3) * (1 - travel) + CORE_Y * travel, -0.7 + (seed - 0.5) * 0.12);
        }
        data.sizes.setX(i, 0.035 + seed * 0.05);
        data.alphas.setX(i, released ? (1 - blast) ** 1.7 * fade : charge * rise * 0.7);
        if (i < 40) {
          transform.position.set(Math.cos(angle) * radius, 1.25 + Math.sin(angle) * radius * 0.22 + (seed - 0.5) * blast, Math.sin(angle) * radius * 0.95);
          transform.rotation.set(progress * 6 + i, angle, angle + blast * 2);
          transform.scale.setScalar(released ? (1 - blast) * (0.6 + seed) : 0);
          transform.updateMatrix();
          chips.setMatrixAt(i, transform.matrix);
        }
        if (i < 80) {
          const spread = 0.5 + blast * (1.4 + seed * 1.5);
          sparks.positions.setXYZ(i, Math.cos(angle) * spread, CORE_Y + Math.sin(angle) * spread * 0.6 - blast ** 2, -0.7 + Math.sin(i * 1.7) * spread * 0.3);
          sparks.sizes.setX(i, 0.035 + seed * 0.06);
          sparks.alphas.setX(i, released ? (1 - blast) ** 2 * fade : charge ** 4 * (Math.sin(i + progress * 90) > 0.8 ? 0.7 : 0));
        }
      }
      chips.instanceMatrix.needsUpdate = true;
      data.positions.needsUpdate = data.sizes.needsUpdate = data.alphas.needsUpdate = true;
      sparks.positions.needsUpdate = sparks.sizes.needsUpdate = sparks.alphas.needsUpdate = true;
    },
  };
}
