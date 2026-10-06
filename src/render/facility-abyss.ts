import type { Texture } from 'three';
import { FacilityKit } from './facility-kit.ts';
import { createFacilityWallMaterial } from './facility-wall-material.ts';
import { FACILITY_PLATFORMS } from '../config/facility-scenes.ts';

export function createAbyssView(background: Texture) {
  const kit = new FacilityKit();
  kit.root.name = 'infiniband-abyss';
  for (const [left, right, y, z, depth] of FACILITY_PLATFORMS.abyss) kit.platform(left, right, y, z, depth);
  buildShaft(kit, background);
  buildFoundations(kit);
  buildComputeBank(kit);
  buildNetworkBank(kit);
  buildBridges(kit);
  buildCoolingWell(kit);
  buildFabricCanopy(kit);
  buildControlMachine(kit);
  buildMachineLinks(kit);
  lightAbyss(kit);
  return kit.finish();
}

function buildShaft(k: FacilityKit, background: Texture) {
  const wall = createFacilityWallMaterial(background);
  k.materials.push(wall);
  const cold = k.material(0x214e64, 0.5, 0x0b2738);
  k.box(88, 54, -25, 176, 108, 2, wall);
  k.box(88, 103, -7, 179, 3, 33, k.dark);
  for (const x of [8, 39, 66, 104, 148, 171]) {
    k.box(x, 51, -18, 4, 102, 5, k.shell);
    k.box(x, 51, -15.3, 1.5, 102, 0.6, k.metal);
    for (const y of [17, 39, 61, 83, 100]) k.box(x, y, -15, 5.5, 1.3, 1, k.dark);
  }
  for (const x of [76, 92, 110]) {
    k.tube([x, 0, -20], [x, 102, -20], 2.1, cold);
    for (let y = 7; y <= 98; y += 13) {
      k.box(x, y, -20, 5.1, 1.2, 5.1, k.metal);
      k.box(x, y, -17.36, 3.3, 0.25, 0.18, k.status);
    }
    k.tube([x + 3.4, 0, -19], [x + 3.4, 102, -19], 0.24);
  }
  for (const y of [25, 72, 93]) {
    k.platform(68, 112, y, -17, 2.5);
    k.railing(68, 112, y, -15.7);
  }
  k.panel('COLD WATER', 92, 82, -17.7, 12, 2.3);
  k.panel('↓', 92, 77, -17.7, 3, 3);
  k.panel('FABRIC / TRANSIT', 91, 100, -12, 26, 2.3);
}

function buildFoundations(k: FacilityKit) {
  const casing = k.material(0x30454e, 0.3);
  // The shaft sides are open maintenance space, with cladding behind the player plane.
  for (const [left, right] of [[0, 46], [148, 176]] as const) {
    const middle = (left + right) / 2;
    k.box(middle, 22, -21, right - left, 44, 0.08, casing);
    for (const y of [2, 13, 24, 35, 43.2]) {
      k.box(middle, y, -20.9, right - left, 0.25, 0.03, k.dark);
      k.box(middle, y - 0.28, -20.8, right - left, 0.12, 0.03, k.metal);
    }
    for (let x = left + 0.4; x < right; x += 7.5) {
      k.box(x, 22, -20.9, 0.14, 44, 0.03, k.dark);
      for (const y of [3, 12, 25, 34, 42]) k.box(x + 0.45, y, -20.8, 0.16, 0.16, 0.03, k.metal);
    }
    for (const x of [left + 2, right - 2]) {
      k.box(x, 19, -20.7, 0.4, 6.5, 0.04, k.yellow);
      k.box(x, 39, -20.7, 0.4, 4, 0.04, k.yellow);
    }
    k.panel('SERVICE / FOUNDATION', middle, 31, -20.6, right - left - 10, 1.6);
    k.panel('COOLANT / MAINTENANCE', middle, 8, -20.6, right - left - 10, 1.2);
  }
  k.box(88, 1, 0, 176, 2, 10, casing);
  k.box(88, 1.8, 5.1, 176, 0.16, 0.04, k.metal);
}

function buildComputeBank(k: FacilityKit) {
  for (const floor of [44, 64, 84]) {
    for (const x of [8, 19, 30, 43, 54]) k.rackBank(x, floor + 1, -7, 8.6, 5.2, 'GB300');
    k.box(31, floor + 0.7, -10, 59, 1.4, 10, k.shell);
    k.box(31, floor + 7.2, -9.7, 59, 0.8, 3.2, k.dark);
    k.box(31, floor + 9.7, -6.7, 59, 0.4, 1, k.metal);
    k.box(31, floor + 0.05, -4.8, 59, 0.08, 0.22, k.pipe);
    k.panel('HOT RETURN / OVERHEAD FABRIC', 31, floor + 10.8, -6.1, 31, 0.85);
    for (const x of [2, 36, 60]) {
      k.tube([x, floor + 1, -5.8], [x, floor + 19, -5.8], 0.4);
      k.box(x, floor + 9, -5.8, 1.6, 0.8, 1.6, k.metal);
    }
  }
  k.box(38, 74, -8, 3.8, 60, 2, k.concrete);
  for (const y of [44, 64, 84]) {
    k.box(38, y + 1, -6.5, 5, 2, 0.5, k.dark);
    k.panel(`B${(y - 24) / 20}`, 38, y + 13, -6.2, 2.8, 2.1);
  }
  k.panel('GB300 / COMPUTE', 25, 99.4, -2.5, 27, 2.5);
}

function buildNetworkBank(k: FacilityKit) {
  for (const floor of [44, 65, 85]) {
    for (const x of [117, 127, 137]) k.rackBank(x, floor + 0.6, -7, 8, 5.2, 'InfiniBand');
    k.box(126, floor + 0.1, -9, 35, 1, 7, k.shell);
    k.box(126, floor + 7.2, -6.5, 34, 0.5, 1, k.dark);
    for (const x of [111.5, 142]) {
      k.box(x, floor + 8.5, -5.5, 0.6, 16.2, 0.6, k.yellow);
      for (let y = floor + 1; y < floor + 16; y += 2) k.tube([x, y, -5.1], [x + 1.9, y + 0.8, -5.1], 0.1, k.status);
    }
  }
  k.panel('InfiniBand', 126, 99, -4.5, 28, 3);
  k.panel('CONNECT / SCALE', 126, 95.8, -4.5, 26, 1.5);
  for (const x of [108, 146]) {
    k.box(x, 73, -4, 1.5, 59, 3, k.metal);
    for (const y of [54, 75, 95]) k.box(x, y, -2.35, 0.5, 2.3, 0.3, k.yellow);
  }
}

function buildBridges(k: FacilityKit) {
  k.railing(0, 125, 44, -4.5);
  k.railing(135, 176, 44, -4.5);
  for (const x of [4, 37, 60, 120, 142, 171]) {
    k.box(x, 21, -8, 1.8, 38, 2, k.shell);
    k.box(x, 20, -6.8, 1.1, 36, 0.6, k.dark);
    for (const y of [6, 22, 36]) k.box(x, y, -6.2, 2.6, 1, 0.5, k.metal);
  }
  for (const [left, right] of [[4, 36], [38, 60], [60, 88], [90, 120], [142, 171]] as const) {
    k.beam([left, 28, -7], [right, 41, -7], 0.7, k.metal);
    k.beam([left, 41, -7], [right, 28, -7], 0.7, k.metal);
    k.box((left + right) / 2, 40.3, -5.5, 4, 0.35, 0.3, k.yellow);
  }
  for (const [left, right, y] of [[0, 67, 64], [0, 51, 84], [106, 175, 64], [128, 176, 84]] as const) {
    k.railing(left, right, y, 3.3);
    for (let x = left + 6; x < right - 4; x += 15) {
      k.beam([x, y - 7, -1.7], [x + 6, y - 1.3, -1.7], 0.7, k.shell);
      k.box(x, y - 1.7, 3.7, 4, 0.25, 0.3, k.yellow);
    }
  }
  for (const [x, bottom, top] of [[4, 44, 84], [59, 44, 64], [143, 12, 44], [171, 44, 84]] as const) {
    k.ladder(x, bottom, top + 1.5, 3.2);
  }
  k.railing(0, 42, 13, 2.8);
  k.railing(139, 176, 13, 2.8);
  for (const x of [125, 135]) {
    k.box(x, 44.6, 4.2, 0.6, 1.2, 0.6, k.dark);
    k.box(x, 45.3, 4.2, 0.7, 0.25, 0.7, k.alarm);
  }
}

function buildCoolingWell(k: FacilityKit) {
  for (const [x, y, z] of [[55, 1, -10], [78, 1, -12], [98, 1, -13], [117, 0, -10], [29, 0, -8], [160, 0, -8]] as const) {
    k.coolantTank(x, y + 2, z, 8.4, 21);
    k.coolantPipe([x + 4.8, y + 3, z], [x + 4.8, y + 25, z], 0.38);
    k.coolantPipe([x + 4.8, y + 25, z], [x, y + 25, z], 0.38);
  }
  for (const y of [5, 9]) {
    k.coolantPipe([0, y, -4], [175, y, -4], 0.4);
  }
  for (const y of [44, 64, 84]) {
    for (const x of [3, 173]) k.coolantTank(x, y + 0.7, -6, 3, 7.5);
    k.coolingUnit(64, y, -6);
    k.coolingUnit(106, y, -6);
    k.powerCabinet(68, y, -8, 'A');
    k.powerCabinet(102, y, -8, 'B');
    k.box(66, y - 0.3, -8, 9, 0.6, 6, k.shell);
    k.box(104, y - 0.3, -8, 9, 0.6, 6, k.shell);
    k.coolantPipe([0, y - 2, -4], [125, y - 2, -4], 0.24);
    k.coolantPipe([135, y - 2, -4], [175, y - 2, -4], 0.24);
    k.coolantPipe([125, y - 3, -4], [0, y - 3, -4], 0.24);
    k.coolantPipe([175, y - 3, -4], [135, y - 3, -4], 0.24);
    k.panel('SUPPLY →  /  ← RETURN', 88, y - 4.5, -9, 27, 0.8);
  }
  for (const [left, right, y] of FACILITY_PLATFORMS.abyss) {
    for (let x = left + 4; x < right - 2; x += 13) k.stripLight(x, y + 5.2, -3.5, 3.5);
  }
  for (const x of [12, 42, 74, 106, 139, 165]) k.stripLight(x, 10, -3.5, 4.2);
  k.panel('COOLANT / CIRCULATION', 90, 31, -16, 30, 2.2);
  k.panel('DEEP SHAFT', 83, 19, -16, 16, 1.9);
}

function buildFabricCanopy(k: FacilityKit) {
  const fiber = k.material(0xcb9450, 0.25, 0x39200a);
  for (const y of [95, 99]) {
    k.box(139, y, -1, 72, 0.55, 8, k.dark);
    k.box(139, y + 1.1, 2.8, 72, 0.16, 0.16, k.metal);
    for (let x = 104; x <= 175; x += 3.5) k.box(x, y, -1, 0.2, 0.8, 8.2, k.metal);
    for (let row = 0; row < 10; row++) {
      const z = -4.3 + row * 0.65;
      k.tube([104, y + 0.5, z], [150, y + 0.5, z], 0.11, fiber);
      k.tube([150, y + 0.5, z], [155 + row * 0.45, y - 4, z], 0.11, fiber);
      k.tube([155 + row * 0.45, y - 4, z], [155 + row * 0.45, 85, z], 0.11, fiber);
    }
  }
  for (let row = 0; row < 7; row++) {
    const y = 88 + row * 0.45;
    k.tube([47, y, -8], [102, y, -8], 0.12, k.status);
    k.tube([102, y, -8], [108, y - 8, -8], 0.12, k.status);
  }
  for (const y of [96, 100]) {
    k.tube([0, y, -1], [69, y, -1], 1, k.metal);
    for (let x = 3; x < 70; x += 9) k.box(x, y, -1, 1, 2.6, 2.6, k.dark);
  }
  k.panel('InfiniBand / FABRIC', 139, 101.8, 0.5, 31, 1.5);
}

function buildControlMachine(k: FacilityKit) {
  const armor = k.material(0x493e3c, 0.55);
  const warning = k.material(0xee512f, 0.25, 0x9f260e);
  k.box(162, 46, -3, 23, 4, 10, k.dark);
  k.box(162, 63, -5, 20, 34, 7, armor);
  k.box(162, 82, -6, 17, 5, 7, k.dark);
  for (const x of [152, 172]) {
    k.box(x, 63, -0.8, 2.6, 30, 2, k.shell);
    k.box(x, 68, 0.35, 0.45, 10, 0.3, warning);
    k.tube([x, 47, -1], [x, 94, -1], 0.75, k.metal);
    for (const y of [52, 76, 90]) k.box(x, y, -1, 2.8, 1.8, 2.8, k.dark);
  }
  k.box(162, 62, -0.9, 14.4, 21.5, 1.3, k.dark);
  for (const x of [155.5, 168.5]) k.box(x, 62, -0.1, 0.35, 20, 0.4, warning);
  for (const y of [52, 72]) k.box(162, y, -0.1, 13.4, 0.35, 0.4, warning);
  k.panel('SYSTEM', 162, 66, 0, 11, 2.3);
  k.panel('ONLINE', 162, 62, 0, 11, 2.3);
  k.panel('!', 162, 57, 0, 3, 4.5);
  k.box(162, 77, -0.7, 12, 3.2, 1, k.metal);
  k.panel('CONTROL / 03', 162, 77, -0.15, 11, 1.5);
  for (const x of [152, 172]) {
    k.box(x, 48, 0.3, 3.5, 2.6, 3, k.dark);
    k.box(x, 49.45, 1.6, 2.1, 0.35, 0.3, k.alarm);
  }
}

function lightAbyss(k: FacilityKit) {
  for (const [x, y, color, power] of [[31, 49, 0xb0f8ee, 200], [91, 12, 0x69dce0, 230], [155, 49, 0xffcf9c, 180]] as const) {
    k.light(x, y, 5, color, power, 48);
  }
}

function buildMachineLinks(k: FacilityKit) {
  for (const floor of [44, 64, 84]) {
    k.switchUnit(126, floor + 10.6, -6.64, 4.2, 'SPINE');
    k.box(71, floor + 11.5, -7, 117, 0.25, 0.9, k.dark);
    for (const [index, [left, right]] of ([[10.95, 16.05], [21.95, 27.05], [45.95, 51.05]] as const).entries()) {
      const leaf = (left + right) / 2;
      k.switchUnit(leaf, floor + 6.6, -6.64, 3, 'LEAF');
      k.signalCable([[left, floor + 3.2, -6.75], [left, floor + 6.6, -6.4],
        [right, floor + 6.6, -6.4], [right, floor + 3.2, -6.75]], 'network');
      const tray = floor + 11.8 + index * 0.28;
      k.signalCable([[leaf, floor + 6.6, -6.4], [leaf, tray, -6.4], [126, tray, -6.4],
        [126, floor + 10.6, -6.4]], 'network');
    }
    k.signalCable([[8, floor + 3.2, -6.75], [5, floor + 8.6, -5.3],
      [56.95, floor + 8.6, -5.3], [56.95, floor + 3.2, -6.75]], 'power');
    k.signalCable([[68, floor + 3.5, -7.5], [68, floor + 8.6, -5.3], [56.95, floor + 8.6, -5.3]], 'power');
    k.signalCable([[102, floor + 3.5, -7.5], [102, floor + 8.6, -5.3], [114.22, floor + 8.6, -5.3],
      [114.22, floor + 3.2, -6.75]], 'power');
  }
  for (const floor of [44, 65, 85]) {
    const spineY = floor + (floor === 44 ? 10.6 : 9.6);
    k.signalCable([[126, spineY, -6.4], [114.22, spineY, -6.4], [114.22, floor + 2.8, -6.75]], 'network');
    for (const x of [117, 127]) {
      k.signalCable([[x + 2.78, floor + 2.8, -6.75], [x + 2.78, floor + 6.1, -6.4],
        [x + 7.22, floor + 6.1, -6.4], [x + 7.22, floor + 2.8, -6.75]], 'network');
    }
  }
  k.signalCable([[139.78, 48, -6.75], [145, 50.5, -3.2], [148, 54, -3.2], [154, 54, -0.65]], 'network');
  k.panel('InfiniBand / LIVE TRAFFIC', 86, 56, -3.25, 20, 0.9);
}
