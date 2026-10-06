import { FacilityKit } from './facility-kit.ts';
import { FACILITY_PLATFORMS } from '../config/facility-scenes.ts';
import { FORTRESS_STRUCTURE } from '../config/facility-structure.ts';
import * as THREE from 'three';
import { createFortressApproach } from './facility-approach.ts';
import { createFacilitySky } from './facility-sky.ts';
import type { FacilitySkyTextures } from './facility-sky.ts';

export function createFortressView(skyTextures: FacilitySkyTextures | null) {
  const k = new FacilityKit(0.65);
  k.root.name = 'mountain-compute-fortress';
  for (const [left, right, y, z, depth] of FACILITY_PLATFORMS.fortress) {
    if (y === 20 && left < 88) continue; // The approach decks use the same standing surfaces.
    k.platform(left, right, y, z, depth);
  }
  fortressShell(k);
  computeFloors(k);
  roofPlant(k);
  const approach = createFortressApproach(k);
  foundation(k);
  coolingCircuit(k);
  machineInterconnects(k);
  const sky = skyTextures === null ? null : createFacilitySky(skyTextures);
  if (sky) k.root.add(sky.root);
  const view = k.finish();
  return { ...view,
    update(time: number, camera: THREE.Camera) { view.update(time, camera); approach.update(time); if (sky) sky.update(camera); },
    dispose() { approach.dispose(); if (sky) sky.dispose(); view.dispose(); },
  };
}

function foundation(k: FacilityKit) {
  // Submerged support structure stays behind the translucent reservoir.
  k.box(135, 10, -11, 130, 18, 1.2, k.shell);
  k.box(135, 1, -0.5, 130, 2, 7, k.concrete);
  for (let x = 74; x < 200; x += 14) {
    k.box(x, 10, -6.5, 0.8, 17, 1.2, k.metal);
    k.beam([x, 3, -7], [x + 10, 17.5, -7], 0.4, k.dark);
    k.stripLight(x + 5, 17.5, -5.2, 4);
  }
  k.panel('COOLANT / RESERVOIR', 117, 12, -9.9, 15, 1.2);
}

function fortressShell(k: FacilityKit) {
  for (const rect of [...FORTRESS_STRUCTURE.walls, ...FORTRESS_STRUCTURE.roof]) {
    k.box(rect.x + rect.w / 2, rect.y + rect.h / 2, -3.5, rect.w, rect.h, 15, k.concrete);
    k.box(rect.x + rect.w / 2, rect.y + rect.h / 2, 4.04, rect.w - 0.3, rect.h - 0.3, 0.08, k.shell);
  }
  for (const door of FORTRESS_STRUCTURE.doors.slice(0, 2)) {
    k.box(door.x + door.w / 2, door.y + door.h, 4.14, door.w + 1.2, 0.3, 0.16, k.yellow);
    k.box(door.x + door.w / 2, door.y + door.h / 2, -7, door.w + 0.6, door.h, 0.18, k.dark);
    k.stripLight(door.x + door.w / 2, door.y + door.h - 0.6, -2.5, 2);
  }
  k.panel('ENTRY →', 86, 29.67, 0.61, 3.8, 0.45);
  k.panel('EXIT →', 193, 29.5, 4.2, 6, 0.85);
  const canopy = FORTRESS_STRUCTURE.canopy;
  k.platform(canopy.x, canopy.x + canopy.w, canopy.y + canopy.h, -3.5, 9);
  k.panel('ROOF ACCESS', 104, 78.6, 1.2, 6, 0.8);
  for (const x of [100.4, 107.6]) k.box(x, 77, -6.8, 0.3, 5, 0.3, k.metal);
  k.box(142, 46.5, -10.5, 108, 53, 1.5, k.shell);
  k.box(142, 18.7, -8, 110, 1.2, 3, k.concrete);
  for (const x of [89.5, 194.5]) {
    k.box(x, 51, -7.5, 3, 46, 3, k.concrete);
    k.box(x, 24, -8.4, 3, 8, 4.8, k.concrete);
  }
  k.box(194.5, 28, -3.5, 4, 0.7, 15.6, k.yellow);
  // The massive entrance tower frames an open side passage below it.
  k.box(96, 51.5, -7.5, 9, 45, 3.8, k.concrete);
  k.box(96, 50.7, -5.54, 6.8, 28, 0.12, k.dark);
  k.box(96, 33.3, -5.54, 6.8, 5.6, 0.12, k.shell);
  k.panel('ACCESS 01', 96, 33.5, -5.43, 5.7, 1.05);
  for (const x of [92.1, 99.9]) {
    k.box(x, 51.5, -5.5, 0.18, 42, 0.2, k.dark);
    for (const y of [34, 42, 50, 58, 66]) k.box(x, y, -5.36, 0.07, 3.4, 0.05, k.status);
  }
  k.panel('429', 96, 46, -5.45, 5.4, 2.6);
  k.panel('PELICAN', 96, 54.5, -5.45, 5.5, 1.35);
  k.panel('VALLEY / AI', 96, 60, -5.45, 5.5, 1);
  k.box(88.3, 24, 3.3, 0.23, 7.5, 0.18, k.status);
  k.panel('01 / MOUNTAIN COMPUTE', 124, 70.5, -9.63, 29, 1.7);
  for (const x of [105, 132, 158, 181]) {
    k.box(x, 46.3, -8.5, 0.55, 52, 0.7, k.metal);
    for (const y of [20, 38, 56]) {
      k.beam([x, y + 15.8, -6.5], [x + 4, y + 12.8, -6.5], 0.26, k.metal);
      k.box(x, y + 14.5, -8.5, 1.1, 0.8, 1.1, k.yellow);
    }
  }
  for (const [left, right, y] of [[102, 131, 38], [137, 180, 38], [102, 151, 56], [157, 181, 56]] as const) {
    k.railing(left, right, y, -4.9);
    k.box((left + right) / 2, y - 1, -1, right - left, 0.5, 0.4, k.metal);
    for (let x = left + 1; x < right - 3; x += 5) {
      k.beam([x, y - 1.3, -0.8], [x + 3, y - 0.45, -0.8], 0.12, k.metal);
    }
  }
  for (const [left, right, y] of [[129, 137, 26], [133, 141, 32], [148, 156, 44], [152, 160, 50]] as const) {
    k.railing(left, right, y, -2.7);
  }
  k.ladder(104, 20, 38, -1.4);
  k.ladder(178, 38, 56, -1.4);
  k.ladder(104, 56, 76, -1.4);
  k.railing(102, 194, 74, -8.7);
  k.box(189, 47, -8, 9, 51, 1, k.dark);
  for (const x of [185, 192]) k.tube([x, 21, -6.6], [x, 71, -6.6], 0.32, k.alarm);
  for (const y of [26, 42, 58, 69]) {
    k.box(188.5, y, -5.6, 5.7, 0.5, 2, k.metal);
    k.box(188.5, y + 0.45, -4.5, 3.3, 0.18, 0.18, k.alarm);
  }
  k.panel('THERMAL', 188.5, 66, -6.5, 6, 1.1);
}

function computeFloors(k: FacilityKit) {
  for (const [index, floor] of [20, 38, 56].entries()) {
    const wall = k.material([0x203b43, 0x293847, 0x3b4046][index]!, 0.1);
    for (let x = 109; x < 180; x += 13) {
      k.box(x, floor + 8, -9.56, 12.1, 15, 0.2, wall);
      k.box(x - 6.15, floor + 8, -9.4, 0.12, 15, 0.12, k.metal);
    }
    k.box(141, floor - 0.4, -7, 78, 0.8, 5, k.shell);
    k.box(187, floor - 0.4, -7, 12, 0.8, 5, k.shell);
    k.box(100, floor - 0.4, -7, 9, 0.8, 5, k.shell);
    for (let i = 0; i < 12; i++) {
      const x = 109 + i * 6;
      const kind = floor === 20 && i < 6 ? 'InfiniBand' : floor === 38 && i < 3 ? 'STORAGE' : 'GB300';
      k.rackBank(x, floor + 0.15, -5.3, 4.3, 5.2, kind);
    }
    const ceiling = floor + 16.2;
    for (const z of [-5.5, -7.7]) {
      k.box(141, ceiling, z, 78, 0.28, 0.22, k.dark);
      k.tube([102, ceiling + 0.25, z + 0.4], [180, ceiling + 0.25, z + 0.4], 0.13, k.pipe);
    }
    for (let x = 103; x < 181; x += 3) k.box(x, ceiling - 0.12, -6.6, 0.12, 0.12, 2.5, k.metal);
    for (let x = 106; x < 180; x += 12) {
      k.box(x, ceiling + 0.5, -5.5, 0.1, 1.1, 0.1, k.yellow);
      k.box(x, ceiling - 0.4, -5.1, 4, 0.14, 0.4, k.status);
      k.tube([x + 1.2, ceiling, -7], [x + 1.2, floor + 11, -7], 0.09, k.pipe);
      k.box(x + 4.4, floor + 12.5, -9.5, 2.3, 2, 0.4, k.dark);
      k.box(x + 4.9, floor + 12.9, -9.23, 0.2, 0.2, 0.1, k.status);
    }
    // One rack row per structural storey; the front aisle stays clear for maintenance and combat.
    k.box(141, floor + 6.3, -8.8, 78, 0.7, 2.5, k.dark);
    k.box(141, floor + 0.04, -3.7, 77, 0.07, 0.18, k.pipe);
    k.box(141, floor + 0.04, -8.4, 77, 0.07, 0.18, k.yellow);
    k.panel('COLD / SERVICE AISLE', 141, floor + 8.8, -8.9, 23, 0.9);
    k.panel(floor === 20 ? 'InfiniBand / FABRIC' : 'GB300 NVL72 / COMPUTE', 141, floor + 13.1, -8.9, 25, 1.25);
    k.coolingUnit(183.5, floor, -6.4);
    k.powerCabinet(102.5, floor, -5.5, 'A');
    k.powerCabinet(98.5, floor, -7, 'B');
    k.coolantPipe([106, floor + 0.9, -8.2], [180, floor + 0.9, -8.2], 0.18);
    k.coolantPipe([180, floor + 1.6, -8.2], [106, floor + 1.6, -8.2], 0.18);
    k.panel('SUPPLY →  /  ← RETURN', 157, floor + 2.6, -8, 17, 0.65);
  }
  k.panel('B1 / NETWORK', 110, 33.4, -9.6, 13, 1.2);
  k.panel('LIQUID COOLING', 170, 69.6, -9.6, 15, 1.2);
  for (const y of [21.5, 39.5, 57.5]) {
    k.tube([106, y, -8.9], [179, y, -8.9], 0.21);
    k.tube([179, y, -8.9], [179, y + 13, -8.9], 0.21);
  }
}

function roofPlant(k: FacilityKit) {
  for (const x of [111, 124, 137, 165, 178]) {
    k.box(x, 77.4, -3.6, 10.5, 5.4, 6.4, k.metal);
    k.box(x, 74.4, -5, 11.4, 0.8, 4, k.dark);
    for (const dx of [-2.7, 2.7]) {
      k.fan(x + dx, 77.3, -0.3, 2.1);
      k.tube([x + dx, 80.1, -4.2], [x + dx, 81.3, -4.2], 1.7, k.dark);
      k.tube([x + dx, 81.3, -4.2], [x + dx, 81.6, -4.2], 1.9, k.metal);
    }
    for (let y = 75.7; y < 79.8; y += 0.6) k.box(x + 5.32, y, -3.6, 0.12, 0.14, 5.8, k.dark);
    k.box(x, 80.2, -3.6, 11, 0.35, 6.8, k.shell);
    k.tube([x + 5.5, 74.6, -6.5], [x + 5.5, 78.8, -6.5], 0.26);
    k.tube([x + 4.3, 78.8, -6.5], [x + 5.5, 78.8, -6.5], 0.26);
  }
  k.box(149.5, 77, -5, 6.5, 6, 5, k.concrete);
  k.panel('COOLANT', 149.5, 77.4, -2.44, 5.5, 1.1);
  k.panel('429', 149.5, 75.5, -2.44, 3.3, 1.1);
  k.tube([104, 75.2, 0], [189, 75.2, 0], 0.28);
  k.tube([189, 23, -5], [189, 75.2, -5], 0.42);
  k.tube([189, 75.2, -5], [189, 75.2, 0], 0.42);
}

function coolingCircuit(k: FacilityKit) {
  for (const [left, right, y] of FACILITY_PLATFORMS.fortress) {
    if (right - left > 20) for (let x = left + 7; x < right - 2; x += 14) k.stripLight(x, y + 5.5, -4.2, 3.6);
  }
  for (const x of [83, 118, 154, 185]) {
    k.coolantTank(x, 3, -6, 3.4, 10.5);
    k.coolantPipe([x + 2.2, 4, -5], [x + 2.2, 18, -5], 0.22);
  }
  for (const y of [17, 35, 53]) {
    k.coolantPipe([104, y, -4], [180, y, -4], 0.2);
    for (const x of [106, 144, 180]) k.coolantTank(x, y + 3.5, -7.8, 2.4, 6);
  }
  for (const [x, y] of [[95, 24], [136, 26], [176, 43]] as const) {
    k.light(x, y, 4, 0x92ede0, 100, 28);
  }
}

function machineInterconnects(k: FacilityKit) {
  for (const floor of [20, 38, 56]) {
    k.signalCable([[102.5, floor + 3, -4.6], [102.5, floor + 11.7, -4.3], [179, floor + 11.7, -4.3],
      [179, floor + 3, -4.7], [176.16, floor + 3, -5.05]], 'power');
    k.signalCable([[98.5, floor + 3.5, -6.5], [98.5, floor + 10.6, -6.2], [109, floor + 10.6, -6.2],
      [109, floor + 3, -5.05]], 'power');
    k.switchUnit(142, floor + 9.5, -4.94, 4.2, 'SPINE');
    k.box(141, floor + 7.5, -5, 78, 0.22, 0.75, k.dark);
    for (const [index, x] of [109, 121, 133, 145, 157, 169].entries()) {
      const leaf = x + 3;
      k.switchUnit(leaf, floor + 5.5, -4.94, 2.6, 'LEAF');
      k.signalCable([[x + 1.16, floor + 3, -5.05], [x + 1.16, floor + 5.5, -4.7],
        [x + 4.84, floor + 5.5, -4.7], [x + 4.84, floor + 3, -5.05]], 'network');
      const tray = floor + 7.7 + (index % 2) * 0.3;
      k.signalCable([[leaf, floor + 5.5, -4.7], [leaf, tray, -4.7], [142, tray, -4.7],
        [142, floor + 9.5, -4.7]], 'network');
    }
  }
  for (const [index, floor] of [20, 38, 56].entries()) {
    const fabricPort = 110.16 + index * 12;
    k.signalCable([[142, floor + 9.5, -4.7], [181, floor + 9.5, -6.7], [181, 32 + index * 0.3, -6.7],
      [fabricPort, 32 + index * 0.3, -6.7], [fabricPort, 23, -5.05]], 'network');
  }
  k.panel('SPINE / RISER', 182, 68, -6.6, 9, 0.7);
}
