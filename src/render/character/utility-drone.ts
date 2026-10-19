import * as THREE from 'three';
import type { EnvironmentGenerator } from '../stage/stage.ts';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createDroneExhaust } from './drone-energy.ts';
import { mergeStaticParts } from '../stage/merge-static-parts.ts';
import { avoidPlayer } from './player-occlusion.ts';
import { createTransitSurface } from '../transit/transit-surface.ts';

// 原点沿用 drone-locomotion 的约定：落地时轮底在 y = -0.34，机头 +X。
// 模型照 V29 侧视定稿建在“地面 y = 0”的模型空间，整体放大 SIZE 后下移到 GROUND；
// SIZE 让车长约为人物身高的 0.58、总高约 0.47，与 V29 场景图一致。
const GROUND = -0.34;
const SIZE = 1.05;
const WHEEL_RADIUS = 0.25;
const WHEEL_Z = 0.55;
const WHEELS_X = [0.44, -0.52] as const;
// 挡泥板从各自起始角包住轮子上方 150°：前轮偏向车头、后轮偏向车尾，内侧止于轮心高度。
const FENDER_START = [Math.PI / 6, 0] as const;
const FENDER_ARC = Math.PI * 150 / 180;
const FENDER_RADIUS = 0.315;
// 车身离地间隙加高到 0.12（原 0.06）：车身整体抬高 RIDE，轮子仍着地。飞行时轮子不收，只随悬挂略垂。
const RIDE = 0.06;
const WHEEL_DROOP = 0.03;
const NECK = new THREE.Vector3(0.2, 0.76, 0);
const HEAD = new THREE.Vector3(0.42, 1.08, 0);
// 头部整体放大到 V29 的比例：头高约占总高的三分之一。
const HEAD_SCALE = 1.12;
const POD_Z = 0.205;
// 眼睛中心在镜筒前段；镜片、虹膜、眼罩都以它为原点。
const EYE_X = 0.14;
const LID_RADIUS = 0.215;
// 车身保持正侧，只把头转向镜头，正侧视也能看到镜片。
const HEAD_TO_CAMERA = 0.9;
// 眼罩是绕 Z 的 108° 球面带，转角为下缘仰角：张开时压住镜片上沿，眨眼时盖过下沿。
const LID_OPEN = 0.8;
const LID_CLOSED = -0.95;
const MOUNT = new THREE.Vector3(0.78, 0.3, 0);
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);
const DEPTH = new THREE.Vector3(0, 0, 1);

export interface UtilityDronePose {
  readonly flying: boolean;
  readonly groundAngle: number;
  readonly groundHeight: number | null;
  readonly color: number;
  readonly tool: 'gripper' | 'cutter';
  readonly target: THREE.Vector3 | null;
}

function spiralTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无人机能量核心需要 canvas 2D 上下文');
  const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, '#effdff');
  glow.addColorStop(0.22, '#4fdcff');
  glow.addColorStop(0.65, '#0b4f96');
  glow.addColorStop(1, '#04162c');
  context.fillStyle = glow;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = 'rgba(170, 240, 255, 0.8)';
  context.lineWidth = 3;
  context.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    context.beginPath();
    for (let s = 0; s <= 20; s++) {
      const radius = 6 + s * 2.6, angle = arm * Math.PI / 2 + s * 0.17;
      context.lineTo(64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 上车壳：饱满的圆顶，后端圆收，车头向前斜落；大倒角让侧面也是圆鼓的。 */
function shellGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.61, 0.58);
  shape.lineTo(0.54, 0.58);
  shape.quadraticCurveTo(0.64, 0.58, 0.56, 0.605);
  shape.quadraticCurveTo(0.38, 0.645, 0.12, 0.645);
  shape.lineTo(-0.48, 0.645);
  shape.quadraticCurveTo(-0.61, 0.645, -0.61, 0.6);
  shape.closePath();
  // 倒角向外长 0.09：壳底 0.49、顶 0.735、车头圆收到 0.71，总宽 0.82。
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.09,
    bevelSegments: 10, curveSegments: 24 });
  return geometry.translate(0, 0, -0.25);
}

/** 圆角截面旋转成宽胎，外圈按两列交错方块顶出越野胎纹，中间留一道直槽。 */
function tyreGeometry(): THREE.BufferGeometry {
  const inner = 0.16, outer = WHEEL_RADIUS - 0.025, half = 0.12, round = 0.04;
  const profile = [new THREE.Vector2(inner, -half)];
  for (let i = 0; i <= 4; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 8;
    profile.push(new THREE.Vector2(outer - round + Math.cos(angle) * round, -half + round + Math.sin(angle) * round));
  }
  for (let i = 1; i < 8; i++) profile.push(new THREE.Vector2(outer, -half + round + i * (2 * (half - round)) / 8));
  for (let i = 0; i <= 4; i++) {
    const angle = i * Math.PI / 8;
    profile.push(new THREE.Vector2(outer - round + Math.cos(angle) * round, half - round + Math.sin(angle) * round));
  }
  profile.push(new THREE.Vector2(inner, half));
  const geometry = new THREE.LatheGeometry(profile, 144).rotateX(Math.PI / 2).toNonIndexed();
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const radius = Math.hypot(x, y);
    if (radius < outer - 0.03 || Math.abs(z) < 0.012) continue;
    const block = (Math.atan2(y, x) / (Math.PI * 2)) * 18 + (z > 0 ? 0.5 : 0);
    if (block - Math.floor(block) > 0.6) continue;
    const grow = (radius + 0.025) / radius;
    position.setXY(i, x * grow, y * grow);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function lathe(points: readonly (readonly [number, number])[]): THREE.LatheGeometry {
  // 截面 (半径, 轴向) 绕 Y 旋转后转到 +X，前端开口朝机头。
  return new THREE.LatheGeometry(points.map(([radius, axial]) => new THREE.Vector2(radius, axial)), 48).rotateZ(-Math.PI / 2);
}

/** 软杯眼罩：镜筒前段向前伸成深杯，口沿斜切，上沿前探像帽檐，下沿退到镜片下缘。 */
function podGeometry(): THREE.LatheGeometry {
  const geometry = lathe([[0.203, -0.12], [0.2, 0.12], [0.204, 0.24], [0.2, 0.275], [0.182, 0.278]]);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    if (x > 0.05) position.setX(i, x + (x - 0.05) * 0.4 * position.getY(i) / 0.2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** 整个机队共用一份几何与材质；亮面件复用交通中心的本地反射环境。 */
function createParts(pmrem: EnvironmentGenerator) {
  const surface = createTransitSurface(pmrem);
  const envMap = surface.environment;
  const core = spiralTexture();
  const materials = {
    // 奶油白亮面漆；镜筒、眼罩、挡泥板是单层壳或有开口，双面避免看穿。
    pearl: new THREE.MeshPhysicalMaterial({ color: 0xebe5d9, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1, envMap,
      envMapIntensity: 0.55, side: THREE.DoubleSide }),
    navy: new THREE.MeshPhysicalMaterial({ color: 0x16243a, metalness: 0.35, roughness: 0.32, clearcoat: 0.7, envMap,
      envMapIntensity: 0.7, side: THREE.DoubleSide }),
    steel: new THREE.MeshPhysicalMaterial({ color: 0xd6dde4, metalness: 1, roughness: 0.18, roughnessMap: surface.roughness,
      normalMap: surface.normal, normalScale: new THREE.Vector2(0.16, 0.16), envMap, envMapIntensity: 0.82 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.85 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x070c14, metalness: 0.3, roughness: 0.08, clearcoat: 1, envMap, envMapIntensity: 1 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x06222c, emissive: 0x0a9cff, emissiveIntensity: 1.5, roughness: 0.28 }),
    hubGlow: new THREE.MeshStandardMaterial({ color: 0x0a2a33, emissive: 0x8fe6ff, emissiveIntensity: 1, roughness: 0.3 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x041820, emissive: 0x0a9cff, emissiveIntensity: 1.5 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x2a1404, emissive: 0xffa22a, emissiveIntensity: 4, roughness: 0.35 }),
    // 状态灯模板，每台克隆一份再按 pose.color 改自发光。
    status: new THREE.MeshStandardMaterial({ color: 0x06222c, emissive: 0x42cce8, emissiveIntensity: 1.8, roughness: 0.3 }),
    glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xcff6ff, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.28,
      depthWrite: false, envMap, envMapIntensity: 1 }),
    core: new THREE.MeshBasicMaterial({ map: core, toneMapped: false }),
  };
  // 能量核心是自发光，进洞不随瓦片光照压暗，与虹膜、灯带一致。
  materials.core.userData.noLightMap = true;
  const geometries = {
    shell: shellGeometry(),
    belt: new RoundedBoxGeometry(1.3, 0.11, 0.78, 2, 0.04),
    strip: new RoundedBoxGeometry(0.4, 0.028, 0.012, 2, 0.008),
    lowerPanel: new RoundedBoxGeometry(1.12, 0.27, 0.8, 3, 0.06),
    chassis: new RoundedBoxGeometry(1.2, 0.1, 0.7, 2, 0.03),
    face: new RoundedBoxGeometry(0.1, 0.24, 0.7, 2, 0.04),
    headlight: new RoundedBoxGeometry(0.03, 0.045, 0.13, 2, 0.012),
    fender: new THREE.TorusGeometry(FENDER_RADIUS, 0.045, 12, 40, FENDER_ARC).scale(1, 1, 3.4),
    fenderCap: new THREE.SphereGeometry(1, 16, 10).scale(0.045, 0.045, 0.153),
    joint: new THREE.SphereGeometry(0.095, 24, 14),
    jointLight: new THREE.TorusGeometry(0.055, 0.012, 8, 32),
    neck: new THREE.CylinderGeometry(0.06, 0.07, 0.12, 16),
    bridge: new RoundedBoxGeometry(0.34, 0.16, 0.22, 3, 0.06),
    // 镜筒：后端深蓝圆罩，前段奶油白筒身，口沿略张开包住镜片。
    podCap: lathe([[0.001, -0.3], [0.1, -0.285], [0.165, -0.24], [0.198, -0.17], [0.203, -0.12]]),
    pod: podGeometry(),
    lens: new THREE.SphereGeometry(0.15, 32, 16).scale(0.35, 1, 1),
    iris: new THREE.TorusGeometry(0.124, 0.011, 6, 40).rotateY(Math.PI / 2),
    glint: new THREE.SphereGeometry(0.022, 8, 6),
    lid: new THREE.SphereGeometry(LID_RADIUS, 32, 10, 0, Math.PI * 0.6, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI),
    tyre: tyreGeometry(),
    dish: new THREE.CylinderGeometry(0.17, 0.17, 0.2, 32).rotateX(Math.PI / 2),
    rimLight: new THREE.TorusGeometry(0.115, 0.016, 8, 48),
    hub: new THREE.CylinderGeometry(0.05, 0.05, 0.21, 20).rotateX(Math.PI / 2),
    ring: new THREE.TorusGeometry(0.3, 0.016, 8, 56).rotateX(Math.PI / 2),
    lensDome: new THREE.SphereGeometry(0.29, 40, 12).scale(1, 0.12, 1),
    core: new THREE.CircleGeometry(0.28, 40),
    arm: new THREE.CylinderGeometry(0.055, 0.06, 1, 12),
    band: new THREE.TorusGeometry(0.062, 0.011, 5, 12),
    gripBase: new RoundedBoxGeometry(0.09, 0.1, 0.12, 2, 0.02),
    finger: new THREE.BoxGeometry(0.13, 0.024, 0.024),
    blade: new THREE.CylinderGeometry(0.095, 0.095, 0.012, 28).rotateX(Math.PI / 2),
    bladeEdge: new THREE.TorusGeometry(0.096, 0.006, 4, 28),
    bladeHub: new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12).rotateX(Math.PI / 2),
  };
  return {
    materials, geometries,
    dispose(): void {
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      core.dispose();
      surface.dispose();
    },
  };
}

type DroneParts = ReturnType<typeof createParts>;

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export type UtilityDroneRig = ReturnType<typeof createRig>;

function createRig({ geometries: g, materials: m }: DroneParts) {
  const root = new THREE.Group();
  root.name = 'utility-drone';
  root.rotation.order = 'ZYX';
  const model = new THREE.Group();
  model.position.y = GROUND + RIDE * SIZE;
  model.scale.setScalar(SIZE);
  root.add(model);
  const status = m.status.clone();

  // 车身由上到下：圆顶上壳、深蓝腰带嵌灯带、奶油白下侧板、深蓝底盘；车头是深蓝面板与琥珀灯。
  add(model, g.shell, m.pearl);
  add(model, g.belt, m.navy, 0.02, 0.445, 0);
  for (const side of [1, -1]) add(model, g.strip, status, -0.06, 0.45, side * 0.392);
  add(model, g.lowerPanel, m.pearl, -0.04, 0.26, 0);
  add(model, g.chassis, m.navy, -0.04, 0.11, 0);
  add(model, g.face, m.navy, 0.72, 0.36, 0);
  for (const side of [1, -1]) add(model, g.headlight, m.amber, 0.775, 0.43, side * 0.25);
  add(model, g.ring, m.steel, 0, 0.055, 0);
  const core = add(model, g.core, m.core, 0, 0.05, 0);
  core.rotation.x = Math.PI / 2;
  add(model, g.lensDome, m.glass, 0, 0.055, 0);
  WHEELS_X.forEach((x, i) => {
    for (const side of [1, -1]) {
      const start = FENDER_START[i]!;
      add(model, g.fender, m.pearl, x, WHEEL_RADIUS, side * WHEEL_Z).rotation.z = start;
      for (const angle of [start, start + FENDER_ARC]) {
        add(model, g.fenderCap, m.pearl, x + Math.cos(angle) * FENDER_RADIUS, WHEEL_RADIUS + Math.sin(angle) * FENDER_RADIUS, side * WHEEL_Z);
      }
    }
  });

  const neck = new THREE.Group();
  neck.position.copy(NECK);
  model.add(neck);
  add(neck, g.joint, m.navy);
  for (const side of [1, -1]) add(neck, g.jointLight, status, 0, 0, side * 0.084);
  add(neck, g.neck, m.navy, 0.03, 0.1, 0);
  const head = new THREE.Group();
  head.position.subVectors(HEAD, NECK);
  head.scale.setScalar(HEAD_SCALE);
  neck.add(head);
  add(head, g.bridge, m.pearl, -0.02, 0.08, 0);
  const eyes = [1, -1].map(side => {
    add(head, g.podCap, m.navy, 0, 0, side * POD_Z);
    add(head, g.pod, m.pearl, 0, 0, side * POD_Z);
    const eye = new THREE.Group();
    eye.position.set(EYE_X, 0, side * POD_Z);
    head.add(eye);
    add(eye, g.lens, m.lens, 0.02, 0, 0);
    add(eye, g.iris, m.iris, 0.056, 0, 0);
    add(eye, g.glint, m.glint, 0.065, 0.06, 0.045).scale.x = 0.4;
    const lid = add(eye, g.lid, m.pearl);
    lid.rotation.x = side * 0.18; // 向外侧略下垂
    return { eye, lid };
  });

  const wheels = WHEELS_X.flatMap(x => [1, -1].map(side => {
    const hub = new THREE.Group();
    hub.position.set(x, WHEEL_RADIUS - RIDE, side * WHEEL_Z);
    model.add(hub);
    const spin = new THREE.Group();
    hub.add(spin);
    add(spin, g.tyre, m.rubber);
    add(spin, g.dish, m.navy);
    add(spin, g.rimLight, m.cyan, 0, 0, side * 0.1);
    add(spin, g.hub, m.hubGlow);
    return { hub, spin };
  }));

  const gripper = new THREE.Group();
  add(gripper, g.gripBase, m.navy, 0.045, 0, 0);
  for (const side of [1, -1]) add(gripper, g.finger, m.steel, 0.15, 0, side * 0.036).rotation.y = -side * 0.18;
  const cutter = new THREE.Group();
  add(cutter, g.blade, m.steel, 0.12, 0, 0);
  add(cutter, g.bladeEdge, m.cyan, 0.12, 0, 0);
  add(cutter, g.bladeHub, m.navy, 0.12, 0, 0);
  const tools = { gripper, cutter };
  for (const tool of Object.values(tools)) { tool.visible = false; model.add(tool); }
  // 只有外壳、轮胎与金属件投影：灯带、镜片、发光件贴在表面或藏在内部，影子看不出，却各占一次阴影绘制。
  const casters = new Set<THREE.Material>([m.pearl, m.navy, m.rubber, m.steel]);
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = casters.has(node.material as THREE.Material);
    node.receiveShadow = true;
  });
  const mergedGeometries = [model, neck, head, gripper].flatMap(parent => mergeStaticParts(parent, new Set([core])));

  const exhaust = createDroneExhaust();
  exhaust.root.position.y = 0.04;
  model.add(exhaust.root);
  const glow = new THREE.PointLight(0x82dce8, 0.8, 3.5, 2);
  glow.position.set(0, 1.1, 0);
  glow.userData.localFill = true;
  model.add(glow);
  const arm = new THREE.InstancedMesh(g.arm, m.navy, 32);
  const bands = new THREE.InstancedMesh(g.band, status, 8);
  arm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bands.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arm.frustumCulled = bands.frustumCulled = false;
  arm.castShadow = true;
  model.add(arm, bands);
  avoidPlayer(root);
  const end = new THREE.Vector3();
  const look = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const transform = new THREE.Object3D();
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  let clock = 0;
  let flight = 0;
  let extension = 0;
  let facing = 1;
  let lastX: number | null = null;
  let speed = 0;
  let blink = 1 + Math.random() * 3;
  let glance = 0;
  let glanceYaw = 0;
  let glancePitch = 0;
  let lidAngle = LID_OPEN;
  let activeTool: UtilityDronePose['tool'] = 'gripper';
  return {
    root,
    update(x: number, y: number, dt: number, pose: UtilityDronePose): void {
      clock += dt;
      const distance = lastX === null ? 0 : x - lastX;
      if (Math.abs(distance) > 0.001) facing = distance > 0 ? 1 : -1;
      lastX = x;
      if (pose.target !== null && Math.abs(pose.target.x - x) > 0.15) facing = pose.target.x > x ? 1 : -1;
      speed = THREE.MathUtils.damp(speed, dt > 0 ? distance / dt : 0, 6, dt);
      root.position.set(x, y + (pose.flying ? Math.sin(clock * 2.1) * 0.035 : 0), 0.2);
      const heading = facing > 0 ? 0 : Math.PI;
      const turn = Math.atan2(Math.sin(heading - root.rotation.y), Math.cos(heading - root.rotation.y));
      root.rotation.y += turn * (1 - Math.exp(-10 * dt));
      flight = THREE.MathUtils.damp(flight, pose.flying ? 1 : 0, 8, dt);
      root.rotation.x = Math.sin(clock * 1.7) * 0.018 * flight;
      const bank = THREE.MathUtils.clamp(-speed * 0.018, -0.12, 0.12);
      root.rotation.z = pose.flying ? THREE.MathUtils.damp(root.rotation.z, bank, 7, dt) : pose.groundAngle;
      for (const wheel of wheels) {
        wheel.hub.position.y = WHEEL_RADIUS - RIDE - WHEEL_DROOP * flight;
        if (!pose.flying) wheel.spin.rotation.z -= distance * Math.cos(root.rotation.y) / (WHEEL_RADIUS * SIZE * Math.cos(pose.groundAngle));
      }
      core.rotation.z -= dt * (0.8 + flight * 2.4);
      exhaust.update(clock, flight * (0.88 + Math.sin(clock * 9) * 0.08));
      neck.position.y = NECK.y + flight * 0.025 + Math.sin(clock * 1.3) * 0.008;
      blink -= dt;
      if (blink < 0) blink = 2.5 + Math.random() * 2.5;
      lidAngle = THREE.MathUtils.damp(lidAngle, blink < 0.12 ? LID_CLOSED : LID_OPEN, 30, dt);
      for (const { lid } of eyes) lid.rotation.z = lidAngle;
      status.emissive.setHex(pose.color);
      root.updateMatrixWorld(true);
      // 没有作业目标时每隔一两秒换个方向张望：左右扫视、偶尔低头抬头，始终大致朝向镜头。
      glance -= dt;
      if (glance < 0) {
        glance = 1.2 + Math.random() * 2.3;
        // 偏向镜头一侧取值，往前看时也至少斜 0.5 rad，眼睛不会转出画面。
        glanceYaw = (Math.random() - 0.6) * 1.0;
        glancePitch = -0.22 + Math.random() * 0.36;
      }
      let pitch = glancePitch + Math.sin(clock * 0.9) * 0.03;
      let yaw = -facing * HEAD_TO_CAMERA + glanceYaw;
      if (pose.target !== null) {
        model.worldToLocal(look.copy(pose.target)).sub(HEAD);
        const ahead = Math.max(look.x, 0.05);
        pitch = THREE.MathUtils.clamp(Math.atan2(look.y, ahead) * 0.6, -0.45, 0.15);
        yaw = -facing * HEAD_TO_CAMERA + THREE.MathUtils.clamp(Math.atan2(-look.z, ahead) * 0.6, -0.35, 0.35);
      }
      head.rotation.z = THREE.MathUtils.damp(head.rotation.z, pitch, 6, dt);
      head.rotation.y = THREE.MathUtils.damp(head.rotation.y, yaw, 6, dt);
      // 眼球比头先转到位，头再慢慢跟上，张望时更灵动。
      for (const { eye } of eyes) {
        eye.rotation.y = THREE.MathUtils.damp(eye.rotation.y, (yaw - head.rotation.y) * 0.35, 16, dt);
        eye.rotation.z = THREE.MathUtils.damp(eye.rotation.z, (pitch - head.rotation.z) * 0.35, 16, dt);
      }
      // 换头先缩回出口，避免两件工具同时出现在软臂末端。
      const switching = activeTool !== pose.tool;
      extension = THREE.MathUtils.damp(extension, pose.target === null || switching ? 0 : 1, 10, dt);
      if (switching && extension < 0.02) activeTool = pose.tool;
      if (pose.target !== null && !switching) model.worldToLocal(end.copy(pose.target));
      curve.v0.copy(MOUNT);
      curve.v3.copy(MOUNT).lerp(end, extension);
      const reach = curve.v0.distanceTo(curve.v3);
      curve.v1.copy(MOUNT).addScaledVector(FORWARD, reach * 0.48);
      curve.v2.copy(curve.v3).add(direction.set(-reach * 0.2, reach * 0.25, 0));
      const visible = extension > 0.02;
      arm.visible = bands.visible = visible;
      for (const [name, tool] of Object.entries(tools)) tool.visible = visible && name === activeTool;
      if (!visible) return;
      for (let i = 0; i < 32; i++) {
        curve.getPoint(i / 32, a);
        curve.getPoint((i + 1) / 32, b);
        transform.position.copy(a).add(b).multiplyScalar(0.5);
        tangent.subVectors(b, a);
        transform.quaternion.setFromUnitVectors(UP, direction.copy(tangent).normalize());
        transform.scale.set(1, tangent.length() * 1.18, 1);
        transform.updateMatrix();
        arm.setMatrixAt(i, transform.matrix);
        if (i % 4 === 0) {
          transform.scale.setScalar(1);
          transform.quaternion.setFromUnitVectors(DEPTH, direction);
          transform.updateMatrix();
          bands.setMatrixAt(i / 4, transform.matrix);
        }
      }
      arm.instanceMatrix.needsUpdate = bands.instanceMatrix.needsUpdate = true;
      const tool = tools[activeTool];
      tool.position.copy(curve.v3);
      curve.getTangent(1, tangent);
      tool.quaternion.setFromUnitVectors(FORWARD, tangent);
    },
    dispose(): void {
      root.removeFromParent();
      glow.dispose();
      arm.dispose(); bands.dispose();
      exhaust.dispose();
      status.dispose();
      for (const geometry of mergedGeometries) geometry.dispose();
    },
  };
}

export type UtilityDroneFleet = ReturnType<typeof createUtilityDroneFleet>;

/** 每个场景创建一次，家园工作机与 HUD 跟随机共用同一套程序化模型。 */
export function createUtilityDroneFleet(scene: THREE.Scene, pmrem: EnvironmentGenerator) {
  const parts = createParts(pmrem);
  const rigs: UtilityDroneRig[] = [];
  const followers: UtilityDroneRig[] = [];
  const create = (): UtilityDroneRig => {
    const rig = createRig(parts);
    rigs.push(rig);
    scene.add(rig.root);
    return rig;
  };
  return {
    create,
    updateFollower(index: number, x: number, y: number, dt: number, talking: boolean, flying: boolean, groundAngle: number, groundHeight: number | null, depth = 0.2): void {
      let rig = followers[index];
      // A new follower starts at its depth instead of sliding in from the play plane.
      if (!rig) { rig = followers[index] = create(); rig.root.position.z = depth; }
      const z = THREE.MathUtils.damp(rig.root.position.z, depth, 12, dt);
      rig.update(x, y, dt, { flying, groundAngle, groundHeight, color: talking ? 0xffcb62 : 0x42cce8, tool: 'gripper', target: null });
      rig.root.position.z = z;
    },
    dispose(): void {
      for (const rig of rigs) rig.dispose();
      parts.dispose();
    },
  };
}
