/**
 * 家园概念版本的设施、无人机、标记与施工轮廓。设施先用程序化几何体占位（与渔屋、机房一样由代码搭建），
 * 无人机等 GLB 到位后替换。
 */
import * as THREE from 'three';
import { HOMESTEAD } from '../config/homestead.ts';
import { BUILDING_KIT } from '../config/building-kit.ts';
import { solarTrackingAngle } from '../physics/solar-panel.ts';
import { createDefinitionFurniture, type FurnitureKind } from './definition-furniture.ts';
import type { HomesteadBuild } from '../config/homestead.ts';
import type { Drone, HomesteadState, Spot } from '../sim/homestead.ts';
import type { TreeInstance } from '../world/level.ts';
import { caption } from './npc/npc-effects.ts';

export interface HomesteadGhost { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly valid: boolean }

export interface HomesteadView {
  /** focus 为玩家位置；commanding 时标出附近还没清场的区域。 */
  update(state: HomesteadState, time: number, focus: { readonly x: number; readonly y: number }, commanding: boolean): void;
  setGhost(ghost: HomesteadGhost | null): void;
  dispose(): void;
}

/** 设施在角色平面后方，无人机在角色平面上。 */
const FACILITY_Z = -0.9;
const DRONE_Z = 0.2;
/** 太阳能板按格子摆在角色平面稍后方，和瓦片一格一格对齐。 */
const PANEL_Z = -0.45;
const STATUS_COLOR: Readonly<Record<Drone['status'], number>> = {
  flying: 0x5cff8a, working: 0x5cff8a, returning: 0x5cff8a, docked: 0x5fb8ff, full: 0x5fb8ff,
  charging: 0xffd25a, stalled: 0xff5a5a, retreat: 0xff5a5a, blocked: 0xff5a5a,
};

interface DroneParts {
  readonly root: THREE.Group;
  readonly light: THREE.MeshBasicMaterial;
  readonly blades: THREE.Mesh[];
  readonly cargo: THREE.Mesh;
  readonly drill: THREE.Mesh;
  readonly laser: THREE.Mesh;
  /** 停摆时头顶的 429 牌。 */
  readonly stall: THREE.Sprite;
  /** 编号牌挂在 root 上，摆到当前目标上方，方便对照 HUD 里的编号。 */
  readonly tag: THREE.Sprite;
}

export function createHomesteadView(scene: THREE.Scene, trees: readonly TreeInstance[]): HomesteadView {
  const root = new THREE.Group();
  root.name = 'homestead';
  scene.add(root);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geometries.push(g); return g; };
  const standard = (color: number, emissive = 0, roughness = 0.6, metalness = 0.2): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, emissive, roughness, metalness });
    materials.push(m);
    return m;
  };
  const box = geo(new THREE.BoxGeometry(1, 1, 1));
  const ring = geo(new THREE.TorusGeometry(0.2, 0.045, 6, 18));
  const blade = geo(new THREE.BoxGeometry(0.34, 0.02, 0.05));
  const lamp = geo(new THREE.SphereGeometry(0.08, 10, 8));
  const cone = geo(new THREE.ConeGeometry(0.12, 0.32, 10));
  const gem = geo(new THREE.OctahedronGeometry(0.28));
  const outlineOf = (w: number, h: number, d: number): THREE.EdgesGeometry => {
    const source = new THREE.BoxGeometry(w, h, d);
    const outline = geo(new THREE.EdgesGeometry(source));
    source.dispose();
    return outline;
  };
  const edges = outlineOf(1, 1, 0.3);
  const tileEdges = outlineOf(0.96, 0.96, 0.4);

  const metal = standard(0x4a5560, 0, 0.5, 0.6);
  const dark = standard(0x22282e, 0, 0.7, 0.3);
  const amber = standard(0xe39a3b, 0, 0.45, 0.35);
  const cargoMaterial = standard(0x8a6a44);
  const laserMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.85 });
  const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x5cff8a, transparent: true, opacity: 0.25, depthWrite: false });
  const siteMaterial = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.22, depthWrite: false });
  const progressMaterial = new THREE.MeshBasicMaterial({ color: 0x5cff8a });
  materials.push(laserMaterial, ghostMaterial, siteMaterial, progressMaterial);
  const markColors = { pending: 0xffffff, assigned: 0x5fe6ff, blocked: 0xff5a5a } as const;
  const markLines = Object.fromEntries(Object.entries(markColors).map(([key, color]) => [key, new THREE.LineBasicMaterial({ color })])) as Record<keyof typeof markColors, THREE.LineBasicMaterial>;
  const markGems = Object.fromEntries(Object.entries(markColors).map(([key, color]) => [key, new THREE.MeshBasicMaterial({ color })])) as Record<keyof typeof markColors, THREE.MeshBasicMaterial>;
  materials.push(...Object.values(markLines), ...Object.values(markGems));

  const part = (parent: THREE.Object3D, material: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z = 0): THREE.Mesh => {
    const m = new THREE.Mesh(box, material);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const facilities = new THREE.Group();
  root.add(facilities);
  let battery: THREE.Mesh | null = null;
  let screen: THREE.MeshStandardMaterial | null = null;
  let builtKey = '';
  const furniture: ReturnType<typeof createDefinitionFurniture>[] = [];
  const buildFacilities = (state: HomesteadState): void => {
    for (const item of furniture.splice(0)) item.dispose();
    facilities.clear();
    const f = state.facilities;
    const at = (kind: FurnitureKind, spot: Spot): THREE.Group => {
      const item = createDefinitionFurniture(kind);
      item.root.position.set(spot.x, spot.y, kind === 'solar' ? PANEL_Z : FACILITY_Z);
      // 家园存档仍使用两格机器人坞，保留既有机位和相邻设施的占格。
      if (kind === 'dock') item.root.scale.x = spot.width / 3;
      furniture.push(item);
      facilities.add(item.root);
      return item.root;
    };
    at('dock', f.dock);
    at('depot', f.depot);
    for (const spot of f.depots) at('depot', spot);
    const station = at('workstation', f.workstation);
    screen = (station.getObjectByName('workstation-screen') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material;
    battery = at('battery', f.battery).getObjectByName('battery-charge') as THREE.Mesh;
    for (const cell of f.panels) at('solar', cell);
    at('terminal-compute', f.computeTerminal);
    at('terminal-robot', f.robotTerminal);
  };

  const drones: DroneParts[] = [];
  const createDroneParts = (): DroneParts => {
    const g = new THREE.Group();
    root.add(g);
    part(g, amber, 0.7, 0.26, 0.42, 0, 0);
    part(g, dark, 0.4, 0.08, 0.3, 0, -0.17);
    const blades: THREE.Mesh[] = [];
    for (const dx of [-0.42, 0.42]) {
      const r = new THREE.Mesh(ring, metal);
      r.rotation.x = Math.PI / 2;
      r.position.set(dx, 0.08, 0);
      g.add(r);
      const b = new THREE.Mesh(blade, dark);
      b.position.set(dx, 0.08, 0);
      g.add(b);
      blades.push(b);
    }
    const lightMaterial = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.docked });
    materials.push(lightMaterial);
    const light = new THREE.Mesh(lamp, lightMaterial);
    light.position.set(0, 0.2, 0);
    g.add(light);
    const cargo = part(g, cargoMaterial, 0.28, 0.24, 0.28, 0, -0.38);
    const drill = new THREE.Mesh(cone, metal);
    drill.rotation.z = Math.PI;
    drill.position.set(0.34, -0.2, 0);
    g.add(drill);
    const laser = new THREE.Mesh(box, laserMaterial);
    g.add(laser);
    const stall = caption('429', '#ff5a5a', 1.1);
    stall.position.set(0, 0.75, 0);
    g.add(stall);
    const tag = caption(String(drones.length + 1), '#5fe6ff', 0.7, true);
    root.add(tag);
    return { root: g, light: lightMaterial, blades, cargo, drill, laser, stall, tag };
  };

  /** 每帧复用同一批对象：用到的显示，多出来的隐藏，避免每帧新建 Mesh。 */
  const pool = <T extends THREE.Object3D>(make: () => T) => {
    const items: T[] = [];
    let used = 0;
    return {
      next(): T {
        let item = items[used];
        if (!item) { item = make(); items.push(item); root.add(item); }
        used++;
        item.visible = true;
        return item;
      },
      finish(): void {
        for (let i = used; i < items.length; i++) items[i]!.visible = false;
        used = 0;
      },
    };
  };
  const tileMarks = pool(() => new THREE.LineSegments(tileEdges, markLines.pending));
  const treeMarks = pool(() => new THREE.Mesh(gem, markGems.pending));
  const siteShells = pool(() => new THREE.Mesh(box, siteMaterial));
  const siteOutlines = pool(() => new THREE.LineSegments(edges, markLines.assigned));
  const siteBars = pool(() => new THREE.Mesh(box, progressMaterial));
  const siteHeight = (kind: HomesteadBuild): number => kind === 'solar' ? BUILDING_KIT.solar.height : 1.4;
  const treeTop = new Map(trees.map(t => [t.id, { x: t.x + 0.5, y: t.baseY + t.trunkHeight + t.canopyHeight + 0.6 }]));
  const ghost = new THREE.Mesh(box, ghostMaterial);
  ghost.visible = false;
  root.add(ghost);
  const hostileMaterial = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.1, depthWrite: false });
  materials.push(hostileMaterial);
  const hostile = new THREE.Group();
  root.add(hostile);
  let hostileKey = '';

  return {
    update(state, time, focus, commanding) {
      hostile.visible = commanding;
      if (commanding) {
        const width = HOMESTEAD.zoneWidth;
        const center = Math.floor(focus.x / width);
        const zones = [-3, -2, -1, 0, 1, 2, 3].map(d => center + d).filter(z => state.hostile.has(z));
        const key = `${zones.join(',')}|${Math.round(focus.y / 4)}`;
        if (key !== hostileKey) {
          hostileKey = key;
          hostile.clear();
          for (const zone of zones) {
            const band = new THREE.Mesh(box, hostileMaterial);
            band.scale.set(width, 40, 0.1);
            band.position.set(zone * width + width / 2, focus.y + 6, 1);
            const outline = new THREE.LineSegments(edges, markLines.blocked);
            outline.scale.copy(band.scale);
            outline.position.copy(band.position);
            hostile.add(band, outline);
          }
        }
      }
      const key = `${state.facilities.panels.length},${state.facilities.depots.length}`;
      if (key !== builtKey) {
        buildFacilities(state);
        builtKey = key;
      }
      const { dawnHour, duskHour } = HOMESTEAD.clock;
      const hour = state.economy.second / 3600;
      const daylight = hour > dawnHour && hour < duskHour;
      const sunAngle = (hour - dawnHour) / (duskHour - dawnHour) * Math.PI;
      const sun = { x: -Math.cos(sunAngle), y: daylight ? Math.sin(sunAngle) : 0 };
      for (const item of furniture) item.update?.(time, solarTrackingAngle(sun));
      const e = state.economy;
      screen!.emissiveIntensity = e.workstationOn ? 1.4 : 0.05;
      const level = e.stored / (e.batteries * HOMESTEAD.power.batteryCapacity);
      battery!.scale.y = Math.max(0.02, level * 1.4);
      battery!.position.y = 0.3 + battery!.scale.y / 2;

      while (drones.length < state.drones.length) drones.push(createDroneParts());
      state.drones.forEach((drone, i) => {
        const parts = drones[i]!;
        parts.root.position.set(drone.x, drone.y, DRONE_Z);
        parts.root.rotation.z = Math.sin(time * 2.1 + i) * 0.05;
        parts.light.color.setHex(STATUS_COLOR[drone.status]);
        for (const b of parts.blades) b.rotation.y = drone.phase === 'docked' ? 0 : time * 40;
        parts.cargo.visible = drone.cargoWood + drone.cargoStone > 0;
        parts.drill.visible = drone.robot.level === 2;
        const working = drone.status === 'working' && drone.task !== null;
        parts.laser.visible = working;
        if (working) {
          const length = 0.9;
          parts.laser.scale.set(0.04, length, 0.04);
          parts.laser.position.set(0.25, -0.15 - length / 2, 0);
        }
        parts.stall.visible = drone.status === 'stalled';
        const task = drone.task;
        parts.tag.visible = task !== null;
        if (task === null) return;
        if (task.kind === 'site') {
          const site = task.site;
          parts.tag.position.set(site.x + HOMESTEAD.builds[site.kind].width / 2, site.y + siteHeight(site.kind) + 0.6, 0.4);
        } else if (task.mark.kind === 'tile') parts.tag.position.set(task.mark.tx + 0.5, task.mark.ty + 1.6, 0.4);
        else {
          const top = treeTop.get(task.mark.treeId)!;
          parts.tag.position.set(top.x, top.y + 0.9, 0.4);
        }
      });

      const assigned = new Set(state.drones.flatMap(d => d.task?.kind === 'mark' ? [d.task.mark] : []));
      for (const mark of state.marks) {
        const kind = mark.blocked !== null ? 'blocked' : assigned.has(mark) ? 'assigned' : 'pending';
        if (mark.kind === 'tile') {
          const outline = tileMarks.next();
          outline.material = markLines[kind];
          outline.position.set(mark.tx + 0.5, mark.ty + 0.5, 0.2);
        } else {
          const top = treeTop.get(mark.treeId)!;
          const marker = treeMarks.next();
          marker.material = markGems[kind];
          marker.position.set(top.x, top.y + Math.sin(time * 3) * 0.12, 0.3);
          marker.rotation.y = time;
        }
      }
      tileMarks.finish();
      treeMarks.finish();
      for (const site of state.sites) {
        const rule = HOMESTEAD.builds[site.kind];
        const height = siteHeight(site.kind);
        const shell = siteShells.next();
        shell.scale.set(rule.width, height, 1);
        shell.position.set(site.x + rule.width / 2, site.y + height / 2, site.kind === 'solar' ? PANEL_Z : FACILITY_Z);
        const outline = siteOutlines.next();
        outline.material = site.blocked === null ? markLines.assigned : markLines.blocked;
        outline.scale.set(rule.width, height, 1);
        outline.position.copy(shell.position);
        const bar = siteBars.next();
        const share = Math.min(1, site.progress / rule.work);
        bar.scale.set(Math.max(0.02, rule.width * share), 0.08, 0.05);
        bar.position.set(site.x + bar.scale.x / 2, site.y + height + 0.2, 0.3);
      }
      siteShells.finish();
      siteOutlines.finish();
      siteBars.finish();
    },
    setGhost(next) {
      ghost.visible = next !== null;
      if (next === null) return;
      ghostMaterial.color.setHex(next.valid ? 0x5cff8a : 0xff5a5a);
      ghost.scale.set(next.width, next.height, 1);
      ghost.position.set(next.x + next.width / 2, next.y + next.height / 2, PANEL_Z);
    },
    dispose() {
      root.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const item of furniture) item.dispose();
      for (const m of materials) m.dispose();
      for (const parts of drones) for (const label of [parts.stall, parts.tag]) {
        label.material.map!.dispose();
        label.material.dispose();
      }
    },
  };
}
