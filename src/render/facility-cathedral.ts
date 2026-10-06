import type { Texture } from 'three';
import { FacilityKit } from './facility-kit.ts';
import { createFacilityWallMaterial } from './facility-wall-material.ts';
import { FACILITY_PLATFORMS } from '../config/facility-scenes.ts';

export function createCathedralView(background: Texture) {
  const kit = new FacilityKit();
  kit.root.name = 'compute-cathedral';
  for (const [left, right, y, z, depth] of FACILITY_PLATFORMS.cathedral) kit.platform(left, right, y, z, depth);
  buildHall(kit, background);
  buildComputeTowers(kit);
  buildBalconies(kit);
  buildCoreGate(kit);
  buildOverheadServices(kit);
  buildCoolingCircuit(kit);
  buildMachineLinks(kit);
  lightHall(kit);
  return kit.finish();
}

function buildHall(k: FacilityKit, background: Texture) {
  const wall = createFacilityWallMaterial(background);
  k.materials.push(wall);
  const recess = k.material(0x0b1926);
  const window = k.material(0x34718b, 0.25, 0x173a53);
  k.box(90, 53, -19, 180, 82, 2, wall);
  k.box(90, 95, -6, 182, 3, 27, k.dark);
  k.box(90, 92.6, -5, 174, 1, 23, k.metal);
  k.box(90, 7, -18, 180, 14, 1.5, recess);
  k.box(90, 1, -1, 180, 2, 10, k.shell);
  for (const x of [8, 22, 49, 76, 104, 131, 158, 172]) {
    k.box(x, 54, -16.8, 4.5, 79, 3, k.shell);
    k.box(x, 54, -14.9, 1.6, 79, 0.5, k.metal);
    k.box(x - 3, 67, -17.7, 1.2, 48, 0.3, window);
    k.box(x + 3, 67, -17.7, 1.2, 48, 0.3, window);
    k.beam([x, 79, -13], [90, 92, -13], 1.1, k.shell);
    for (const y of [22, 44, 68, 84]) k.box(x, y, -14.6, 5.4, 0.8, 0.8, k.dark);
  }
  for (const x of [3, 177]) {
    k.box(x, 53, -8, 5.8, 82, 2, k.concrete);
    k.box(x, 53, -6.8, 3.1, 82, 0.6, k.dark);
    for (const y of [20, 39, 58, 78]) {
      k.box(x, y, -6.3, 6.8, 2.2, 1, k.metal);
      k.box(x, y + 3.3, -5.7, 0.5, 3.4, 0.5, k.yellow);
    }
  }
  for (let x = 10; x <= 170; x += 10) {
    k.box(x, 7, -8, 1.1, 10, 2, k.shell);
    k.beam([x, 3, -7], [x + 7, 12, -7], 0.45, k.metal);
    k.box(x, 11.8, -5.95, 1.3, 0.4, 0.25, k.yellow);
    k.box(x + 5, 13.98, 1.4, 0.12, 0.06, 5, k.metal);
  }
  k.railing(8, 172, 14, -4.7);
  k.panel('COMPUTE CATHEDRAL', 90, 88.5, -12.9, 34, 2.6);
  k.panel('01 / FINAL HALL', 18, 20, -6.8, 14, 2.3);
  k.panel('CORE ACCESS', 162, 20, -6.8, 14, 2.3);
}

function buildComputeTowers(k: FacilityKit) {
  for (const [index, x] of [35, 62, 90, 118, 145].entries()) {
    const top = x === 90 ? 82 : 77;
    k.box(x, 15.5, -10, 21.5, 3, 8, k.metal);
    k.box(x, (17 + top) / 2, -12, 21, top - 17, 8, k.dark);
    for (const side of [-1, 1]) {
      k.box(x + side * 10.3, (17 + top) / 2, -7.4, 1, top - 17, 1.2, k.metal);
      k.tube([x + side * 9.1, 16, -6.8], [x + side * 9.1, top - 1, -6.8], 0.34);
      for (let y = 20; y < top; y += 8) k.box(x + side * 9.1, y, -6.8, 1.2, 0.8, 1.2, k.shell);
    }
    for (const y of [18, 37, 56]) {
      for (const dx of [-5.8, 0, 5.8]) k.rackBank(x + dx, y, -7, 5.2, 5.2, 'GB300');
      k.box(x, y - 0.4, -7, 19.7, 0.8, 7, k.shell);
      k.box(x, y + 6.2, -9.8, 19.7, 0.8, 3.2, k.dark);
      k.box(x, y + 7.2, -6.6, 18.9, 0.35, 0.6, k.metal);
      k.box(x, y + 0.04, -4, 19.7, 0.07, 0.2, k.pipe);
      k.panel('HOT AIR RETURN', x, y + 6.2, -8.1, 12, 0.6);
      k.panel('SERVICE AISLE / InfiniBand', x, y + 10, -7, 18.7, 0.8);
      k.coolantPipe([x - 9, y + 0.9, -10.5], [x + 9, y + 0.9, -10.5], 0.2);
      k.coolantPipe([x + 9, y + 1.7, -10.5], [x - 9, y + 1.7, -10.5], 0.2);
    }
    k.box(x, top + 0.5, -10, 22, 1.2, 8.5, k.shell);
    k.panel(`GB300 / 0${index + 1}`, x, top - 2.5, -6.6, 15, 2.5);
    for (const dx of [-6, 6]) {
      k.tube([x + dx, top + 1, -9], [x + dx, 85, -9], 0.48);
      k.box(x + dx, top + 2, -9, 1.8, 1, 1.8, k.dark);
    }
  }
}

function buildBalconies(k: FacilityKit) {
  for (const [left, right] of [[5, 31], [149, 175]] as const) {
    const middle = (left + right) / 2;
    for (const y of [30, 48, 66]) {
      k.railing(left, right, y, 3.8);
      for (const x of [left + 2, right - 2]) {
        k.box(x, y - 8.2, -2.9, 1.6, 15, 1.8, k.shell);
        k.beam([x, y - 7, -2.3], [middle, y - 1.2, -2.3], 0.7, k.metal);
      }
      k.box(middle, y - 1.5, 4, 4, 0.24, 0.24, k.yellow);
      k.panel(`L${(y - 12) / 18}`, middle, y - 2.8, 4.12, 3, 1.2);
      for (const x of [left + 5, right - 5]) k.rackBank(x, y + 0.2, -3.1, 5, 5.2, 'InfiniBand');
    }
    k.ladder(left === 5 ? 8 : 172, 14, 69, 3.3);
    k.panel('InfiniBand', middle, 79, -2.6, 21, 2.7);
    k.box(middle, 73, -3, 24, 15, 0.6, k.dark);
    k.panel('FABRIC / SWITCHING', middle, 73, -2.6, 20, 2.2);
  }
  for (const [left, right] of [[31, 65], [115, 149]] as const) {
    k.railing(left, right, 48, -2.8);
    k.beam([left, 36, -1.2], [left + 12, 46.7, -1.2], 1, k.shell);
    k.beam([right, 36, -1.2], [right - 12, 46.7, -1.2], 1, k.shell);
    k.box((left + right) / 2, 46, 3.1, 8, 0.23, 0.25, k.yellow);
  }
  for (const x of [34, 146]) k.ladder(x, 30, 48, 2.9);
}

function buildCoreGate(k: FacilityKit) {
  const gate = k.material(0x273844, 0.5);
  const rim = k.material(0x789198, 0.65);
  k.box(90, 16.4, -4, 33, 4.8, 7, k.shell);
  k.box(90, 28, -4.7, 18, 24, 1.8, gate);
  for (const side of [-1, 1]) {
    k.box(90 + side * 4.5, 28, -3.65, 8.4, 21, 0.8, k.dark);
    k.box(90 + side * 8.6, 28, -3.1, 0.7, 18, 0.8, rim);
    k.beam([90 + side * 15, 17, -2], [90 + side * 9, 33, -2], 2.1, k.shell);
    k.tube([90 + side * 16, 17, -2], [90 + side * 12, 34, -2], 0.55, k.metal);
    k.box(90 + side * 15, 17.5, -1.2, 4.3, 2.4, 3.2, k.dark);
    k.box(90 + side * 15, 18.9, 0.1, 2.1, 0.25, 0.3, k.alarm);
  }
  k.ring(90, 30, -3.2, 13.7, rim);
  k.ring(90, 30, -2.6, 11.7, k.dark);
  k.ring(90, 30, -2.1, 10.8, k.alarm);
  k.box(90, 28, -1.5, 0.24, 20, 0.25, k.alarm);
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    const x = 90 + Math.cos(angle) * 13.7;
    const y = 30 + Math.sin(angle) * 13.7;
    k.box(x, y, -1.9, 1.3, 1.3, 0.8, k.dark);
    k.box(x, y, -1.45, 0.55, 0.55, 0.15, k.alarm);
  }
  k.box(90, 44, -2, 17, 6, 1.4, k.dark);
  k.panel('CORE / 72', 90, 44, -1.25, 14, 2.7);
  for (const x of [68, 112]) {
    k.box(x, 17.2, -3, 6, 5.8, 3, k.shell);
    k.panel('CONTROL', x, 18.8, -1.45, 4.8, 1.1);
    k.box(x, 17.1, -1.45, 4.6, 1.3, 0.2, k.status);
  }
}

function buildOverheadServices(k: FacilityKit) {
  for (const y of [84, 88]) {
    k.tube([5, y, -1], [73, y, -1], 1.2, k.metal);
    k.tube([107, y, -1], [175, y, -1], 1.2, k.metal);
    for (const x of [12, 30, 49, 68, 112, 131, 150, 169]) {
      k.box(x, y, -1, 1.3, 3.1, 3.1, k.dark);
      k.box(x, y - 0.6, 0.65, 0.8, 0.35, 0.15, k.yellow);
    }
  }
  for (const [left, right] of [[4, 76], [104, 176]] as const) {
    k.box((left + right) / 2, 90.7, -0.6, right - left, 0.6, 6, k.dark);
    for (let x = left; x <= right; x += 4) {
      k.box(x, 90.35, -0.6, 0.4, 0.4, 6.3, k.metal);
      k.box(x, 92, -3.4, 0.15, 2.8, 0.15, k.metal);
    }
    for (const z of [-2.6, -1.8, -1, -0.2, 0.6, 1.4]) k.tube([left, 91.4, z], [right, 91.4, z], 0.13, k.status);
  }
  k.panel('COOLANT', 40, 84, 0.42, 14, 1.6);
  k.panel('InfiniBand', 140, 88, 0.42, 20, 1.6);
  for (const x of [19, 161]) {
    for (const dx of [-1, 0, 1]) {
      k.tube([x + dx, 68, -2], [x + dx, 81, -2], 0.11, k.status);
      k.tube([x + dx, 81, -2], [x + dx + 5, 91.4, -2], 0.11, k.status);
    }
  }
}

function lightHall(k: FacilityKit) {
  for (const [x, color, power] of [[30, 0xb1eaff, 180], [150, 0xb1eaff, 180], [90, 0xffc394, 210]] as const) {
    k.light(x, 20, 5, color, power, 48);
  }
}

function buildCoolingCircuit(k: FacilityKit) {
  for (const x of [48, 75, 104, 133]) {
    k.coolingUnit(x, 14, -6);
    k.panel('CDU / PRIMARY ↔ SECONDARY', x, 20.7, -5.7, 5.5, 0.55);
  }
  k.powerCabinet(11, 14, -6, 'A');
  k.powerCabinet(169, 14, -6, 'B');
  for (const x of [23, 157]) {
    k.coolantTank(x, 15, -6, 2.8, 8.5);
    k.coolantPipe([x + 1.8, 15, -5.8], [x + 1.8, 34, -5.8], 0.18);
  }
  for (const x of [37, 65, 93, 121, 149]) {
    k.coolantTank(x, 2.5, -8, 3.8, 8.2);
    k.stripLight(x, 11.5, -5.5, 5);
  }
  k.coolantPipe([10, 4, -5.5], [170, 4, -5.5], 0.26);
  k.coolantPipe([10, 26, -9], [170, 26, -9], 0.2);
  for (const [left, right, y] of FACILITY_PLATFORMS.cathedral) {
    for (let x = left + 5; x < right - 2; x += 12) k.stripLight(x, y + 5.4, -2.8, 3.8);
  }
}

function buildMachineLinks(k: FacilityKit) {
  k.signalCable([[11, 17.5, -5.5], [11, 25, -5.5], [29.2, 25, -5.5], [29.2, 20.2, -6.75]], 'power');
  k.signalCable([[169, 17.5, -5.5], [169, 25, -5.5], [150.8, 25, -5.5], [150.8, 20.2, -6.75]], 'power');
  for (const x of [35, 62, 90, 118, 145]) {
    for (const y of [18, 37, 56]) {
      for (const dx of [-4.4125, 1.3875]) {
        const left = x + dx;
        const right = left + 3.025;
        const leaf = (left + right) / 2;
        k.switchUnit(leaf, y + 5.6, -6.64, 2.4, 'LEAF');
        k.signalCable([[left, y + 2.2, -6.75], [left, y + 5.6, -6.4],
          [right, y + 5.6, -6.4], [right, y + 2.2, -6.75]], 'network');
        const tray = y + (dx < 0 ? 8.2 : 8.7);
        k.signalCable([[leaf, y + 5.6, -6.4], [leaf, tray, -6.4], [48, tray, -6.4],
          [48, y + 12.3, -6.4]], 'network');
      }
    }
    k.signalCable([[x - 5.8, 20.2, -6.75], [x - 9.5, 21, -5.8],
      [x - 9.5, 29, -5.8], [x + 9.5, 29, -5.8], [x + 5.8, 22.2, -6.75]], 'power');
  }
  for (const y of [18, 37, 56]) {
    k.switchUnit(48, y + 12.3, -6.64, 4.2, 'SPINE');
    k.box(90, y + 7.9, -6.8, 121, 0.2, 0.75, k.dark);
  }
  for (const left of [10, 154]) {
    for (const y of [30, 48, 66]) {
      k.signalCable([[left + 1.3375, y + 2.4, -2.85], [left + 1.3375, y + 5.1, -2.5],
        [left + 14.6625, y + 5.1, -2.5], [left + 14.6625, y + 2.4, -2.85]], 'network');
    }
  }
  for (const [row, y] of [18, 37, 56].entries()) {
    const networkY = 32.4 + row * 18;
    k.signalCable([[48, y + 12.3, -6.4], [28, y + 12.3, -6.4], [28, networkY, -3.1],
      [11.3375, networkY, -2.85]], 'network');
  }
  k.signalCable([[155.3375, 68.4, -2.85], [155, 72, -6.4], [48, 72, -6.4], [48, 68.3, -6.4]], 'network');
}
