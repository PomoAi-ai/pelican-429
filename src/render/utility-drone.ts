import * as THREE from 'three';
import { loadCharacterModel } from './character-model.ts';
import { createDroneEnergy, createDroneExhaust } from './drone-energy.ts';
import { avoidPlayer } from './player-occlusion.ts';

const MODEL = './robots/utility-drone/model.glb';
const SCALE = 0.64;
const NODES = ['rotor_upper', 'rotor_lower', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'tyre_spin_fl', 'tyre_spin_fr', 'tyre_spin_rl', 'tyre_spin_rr', 'tool_mount', 'tool_gripper', 'tool_cutter', 'soft_arm', 'energy_core', 'energy_crown', 'exhaust_nozzle'] as const;
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

function disposeModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
}

export type UtilityDroneRig = ReturnType<typeof createRig>;

function createRig(source: THREE.Group) {
  const root = new THREE.Group();
  root.name = 'utility-drone';
  root.rotation.order = 'ZYX';
  const body = source.clone(true);
  body.scale.setScalar(SCALE);
  root.add(body);
  const glow = new THREE.PointLight(0x82dce8, 0.8, 3.5, 2);
  glow.position.set(0, 0.65, 0);
  glow.userData.localFill = true;
  root.add(glow);
  const get = (name: typeof NODES[number]) => body.getObjectByName(name)!;
  get('soft_arm').visible = false;
  const crown = get('energy_crown');
  const crownY = crown.position.y;
  const wheels = ([['wheel_fl', 'tyre_spin_fl'], ['wheel_fr', 'tyre_spin_fr'], ['wheel_rl', 'tyre_spin_rl'], ['wheel_rr', 'tyre_spin_rr']] as const).map(([name, spinName]) => {
    const node = get(name);
    const spin = get(spinName);
    return { node, spin, position: node.position.clone() };
  });
  const tools = { gripper: get('tool_gripper'), cutter: get('tool_cutter') };
  root.updateMatrixWorld(true);
  for (const tool of Object.values(tools)) { root.attach(tool); tool.visible = false; }
  const mount = get('tool_mount');
  const statusLights: THREE.MeshStandardMaterial[] = [];
  const ownMaterials: THREE.Material[] = [];
  body.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const copy = (material: THREE.Material) => {
      if (!(material instanceof THREE.MeshStandardMaterial) || material.name !== 'drone_status') return material;
      const cloned = material.clone();
      statusLights.push(cloned);
      ownMaterials.push(cloned);
      return cloned;
    };
    node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
  });
  const exhaust = createDroneExhaust();
  get('exhaust_nozzle').add(exhaust.root);
  const energy = createDroneEnergy();
  energy.root.position.y = 0.24;
  get('energy_core').add(energy.root);
  const armGeometry = new THREE.CylinderGeometry(0.055, 0.062, 1, 12);
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0x253641, metalness: 0.65, roughness: 0.4 });
  const bandGeometry = new THREE.TorusGeometry(0.063, 0.011, 5, 12);
  const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x65cddd, emissive: 0x34b8cf, emissiveIntensity: 2.4, metalness: 0.3, roughness: 0.3 });
  const arm = new THREE.InstancedMesh(armGeometry, armMaterial, 32);
  const bands = new THREE.InstancedMesh(bandGeometry, bandMaterial, 8);
  arm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bands.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arm.frustumCulled = bands.frustumCulled = false;
  arm.castShadow = true;
  root.add(arm, bands);
  avoidPlayer(root);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
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
      crown.position.y = crownY + Math.sin(clock * 2.4) * 0.025;
      crown.rotation.y = Math.sin(clock * 0.55) * 0.12;
      energy.update(clock, flight);
      for (const wheel of wheels) {
        wheel.node.position.copy(wheel.position);
        wheel.node.position.y += flight * 0.14;
        wheel.node.position.z *= 1 - flight * 0.1;
        if (!pose.flying) wheel.spin.rotation.z -= distance * Math.cos(root.rotation.y) / (0.28 * SCALE * Math.cos(pose.groundAngle));
      }
      const thrust = flight * (0.88 + Math.sin(clock * 9) * 0.08);
      exhaust.update(clock, thrust);
      for (const material of statusLights) material.emissive.setHex(pose.color);
      bandMaterial.emissive.setHex(pose.color);
      // 换头先缩回出口，避免两件工具同时出现在软臂末端。
      const switching = activeTool !== pose.tool;
      extension = THREE.MathUtils.damp(extension, pose.target === null || switching ? 0 : 1, 10, dt);
      if (switching && extension < 0.02) activeTool = pose.tool;
      root.updateMatrixWorld(true);
      root.worldToLocal(mount.getWorldPosition(start));
      if (pose.target !== null && !switching) root.worldToLocal(end.copy(pose.target));
      curve.v0.copy(start);
      curve.v3.copy(start).lerp(end, extension);
      const reach = curve.v0.distanceTo(curve.v3);
      curve.v1.copy(start).addScaledVector(FORWARD, reach * 0.48);
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
      armGeometry.dispose(); bandGeometry.dispose(); armMaterial.dispose(); bandMaterial.dispose();
      exhaust.dispose(); energy.dispose();
      for (const material of ownMaterials) material.dispose();
    },
  };
}

export type UtilityDroneFleet = Awaited<ReturnType<typeof loadUtilityDroneFleet>>;

/** 每个场景加载一次，家园工作机与 HUD 跟随机共用真实模型。 */
export async function loadUtilityDroneFleet(scene: THREE.Scene) {
  const { scene: source } = await loadCharacterModel(MODEL, 'original');
  try {
    for (const name of NODES) if (!source.getObjectByName(name)) throw new Error(`${MODEL} 缺少节点 ${name}`);
    source.traverse(node => {
      if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
    });
  } catch (error) { disposeModel(source); throw error; }
  const rigs: UtilityDroneRig[] = [];
  const followers: UtilityDroneRig[] = [];
  const create = (): UtilityDroneRig => {
    const rig = createRig(source);
    rigs.push(rig);
    scene.add(rig.root);
    return rig;
  };
  return {
    create,
    updateFollower(index: number, x: number, y: number, dt: number, talking: boolean, flying: boolean, groundAngle: number, groundHeight: number | null, depth = 0.2): void {
      const rig = followers[index] ?? (followers[index] = create());
      const z = THREE.MathUtils.damp(rig.root.position.z, depth, 12, dt);
      rig.update(x, y, dt, { flying, groundAngle, groundHeight, color: talking ? 0xffcb62 : 0x42cce8, tool: 'gripper', target: null });
      rig.root.position.z = z;
    },
    dispose(): void {
      for (const rig of rigs) rig.dispose();
      disposeModel(source);
    },
  };
}
