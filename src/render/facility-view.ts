import { FacilityKit } from './facility-kit.ts';

export function createFacilityView() {
  const kit = new FacilityKit();
  buildShell(kit);
  buildEquipment(kit);
  buildServiceAccess(kit);
  return kit.finish();
}

function buildShell(k: FacilityKit) {
  // Rear-wall equipment stays behind the traversable plane at z = 0.
  k.box(76, 16.7, -5.1, 56, 13.4, 0.65, k.shell);
  k.box(72, 9.55, -1.1, 64, 0.9, 8, k.concrete);
  k.box(76, 23.55, -1.3, 57.4, 0.9, 8.2, k.concrete);
  for (const x of [48, 104]) {
    k.box(x, 19, -1.2, 1, 10, 7.8, k.concrete);
    k.box(x, 12, -4.6, 1, 4, 0.55, k.concrete);
    k.box(x, 14.1, -0.9, 1.2, 0.35, 7.8, k.yellow);
  }
  for (let x = 52; x < 104; x += 8) {
    k.box(x, 17, -4.62, 0.18, 12, 0.18, k.metal);
    k.box(x, 22.4, -2.2, 4.2, 0.14, 0.4, k.status);
  }
  k.panel('PELICAN / COMPUTE CAMPUS', 61, 21.2, -4.65, 15, 1.35);
  k.panel('GB300 / CORE', 93, 21.2, -4.65, 11, 1.35);
  k.panel('01 / ACCESS', 47.42, 16, 2.8, 4.8, 0.85);
  k.panel('EXIT →', 101.1, 12.7, -4.65, 3, 0.75);
  for (const [left, right] of [[53, 65], [70, 82], [89, 101]] as const) {
    k.box((left + right) / 2, 16.76, -0.35, right - left, 0.48, 3.3, k.dark);
    k.box((left + right) / 2, 16.99, 1.34, right - left, 0.08, 0.12, k.yellow);
    k.railing(left, right, 17, -1.9);
    for (const x of [left + 1, right - 1]) k.tube([x, 16.5, -3.6], [x + 1.4, 15.1, -4.6], 0.09, k.metal);
  }
  k.railing(49, 103, 24, -4.8);
  k.tube([45, 18.1, -3.6], [98, 18.1, -3.6], 0.18);
  k.tube([45, 18.7, -3.6], [99, 18.7, -3.6], 0.13, k.metal);
  for (const x of [87, 101]) k.box(x, 20.1, -4.35, 0.6, 0.3, 0.35, k.alarm);
}

function buildEquipment(k: FacilityKit) {
  const kinds = ['COMPUTE', 'COMPUTE', 'STORAGE', 'STORAGE', 'NETWORK', 'NETWORK'];
  for (const [i, kind] of kinds.entries()) {
    const x = 55.2 + i * 4.7;
    k.box(x, 13.05, -3.55, 3.55, 6.1, 2.3, k.dark);
    k.box(x, 16.16, -3.55, 3.7, 0.16, 2.4, k.metal);
    k.panel(kind, x, 13.13, -2.37, 3.18, 5.65, true);
    k.box(x + 1.48, 15.74, -2.3, 0.12, 0.17, 0.08, k.status);
  }
  for (const x of [91, 97.5]) {
    k.box(x, 13.2, -3.05, 4.9, 6.4, 3, k.dark);
    k.box(x - 2.36, 13.2, -1.45, 0.18, 6.3, 0.2, k.metal);
    k.box(x + 2.36, 13.2, -1.45, 0.18, 6.3, 0.2, k.metal);
    k.panel('GB300', x, 15.82, -1.49, 3.7, 0.8);
    k.fan(x, 14.15, -1.45, 1.02);
    k.fan(x, 11.88, -1.45, 1.02);
    k.tube([x + 2.05, 10.5, -1.25], [x + 2.05, 18.1, -1.25], 0.16);
    k.tube([x + 2.05, 18.1, -1.25], [x + 2.05, 18.1, -3.6], 0.16);
    k.box(x - 2.05, 13.1, -1.35, 0.07, 5.5, 0.07, k.status);
  }
  // Cooling hardware also appears outside, visually connecting the two spaces.
  for (const [x, floor] of [[43.5, 10], [59, 24], [67, 24], [88, 24]] as const) {
    k.box(x, floor + 1.5, -2.7, 5.3, 3, 3.2, k.metal);
    k.box(x, floor + 0.13, -2.7, 5.7, 0.26, 3.5, k.dark);
    k.fan(x - 1.3, floor + 1.65, -1.04, 0.95);
    k.fan(x + 1.3, floor + 1.65, -1.04, 0.95);
    k.box(x, floor + 3.12, -2.7, 5.5, 0.24, 3.4, k.shell);
    for (let y = 0.4; y < 2.9; y += 0.35) k.box(x + 2.69, floor + y, -2.7, 0.08, 0.1, 2.7, k.dark);
    k.tube([x + 3.1, floor + 0.2, -2.1], [x + 3.1, floor + 1.4, -2.1], 0.14);
    k.elbow(x + 2.65, floor + 1.4, -2.1);
    k.tube([x + 2.25, floor + 1.85, -2.1], [x + 2.65, floor + 1.85, -2.1], 0.14);
  }
  k.tube([45.6, 11.5, -3.6], [45.6, 18.1, -3.6], 0.18);
  k.box(84.2, 11.15, -2.7, 2.3, 2.3, 1.4, k.shell);
  k.panel('POWER', 84.2, 11.5, -1.98, 1.95, 0.5);
  k.box(84.2, 10.67, -1.94, 1.5, 0.08, 0.06, k.yellow);
}

function buildServiceAccess(k: FacilityKit) {
  k.railing(19, 27, 10, -1.2);
  for (const x of [19, 27]) {
    k.box(x, 9, -0.8, 0.32, 2.9, 0.4, k.metal);
    k.box(x, 11.5, -1.2, 0.34, 0.18, 0.34, k.yellow);
  }
  k.tube([19, 8.3, -1.2], [22, 9.85, -1.2], 0.1, k.metal);
  k.tube([27, 8.3, -1.2], [24, 9.85, -1.2], 0.1, k.metal);
  // Overhead utilities provide scale without filling the combat lane.
  for (const z of [-3.3, -2]) k.box(76, 22.5, z, 52, 0.23, 0.14, k.dark);
  for (let x = 50; x <= 102; x += 2) k.box(x, 22.44, -2.65, 0.12, 0.12, 1.4, k.metal);
  for (let x = 52; x <= 100; x += 8) {
    k.box(x, 22.94, -2, 0.1, 0.8, 0.1, k.yellow);
    k.box(x, 22.94, -3.3, 0.1, 0.8, 0.1, k.yellow);
  }
  for (const z of [-2.45, -2.85]) k.tube([50, 22.63, z], [102, 22.63, z], 0.09, k.pipe);
  for (const x of [73, 80, 101]) {
    k.box(x, 19.8, -4.37, 1.7, 1.85, 0.7, k.dark);
    k.box(x, 19.8, -3.98, 1.5, 1.6, 0.08, k.metal);
    k.box(x + 0.5, 19.8, -3.89, 0.08, 0.38, 0.1, k.yellow);
    k.box(x - 0.4, 20.23, -3.88, 0.23, 0.12, 0.08, k.status);
    k.tube([x, 20.75, -4.2], [x, 22.45, -4.2], 0.06, k.dark);
  }
  for (const [x, top, z] of [[50.8, 17.8, -1.8], [46.8, 25.4, 2.7]] as const) {
    for (const offset of [-0.6, 0.6]) k.tube([x + offset, 10, z], [x + offset, top, z], 0.07, k.yellow);
    for (let y = 10.35; y < top - 0.7; y += 0.48) k.tube([x - 0.6, y, z], [x + 0.6, y, z], 0.065, k.metal);
  }
  k.box(48, 12.1, 2.45, 0.5, 4.2, 0.45, k.dark);
  k.box(48, 14.05, -0.85, 0.6, 0.4, 7, k.dark);
  k.box(47.66, 13.65, -0.85, 0.13, 0.14, 6.1, k.status);
  k.box(49.05, 11.45, -1.6, 0.65, 2.9, 0.7, k.dark);
  k.box(49.05, 12.3, -1.23, 0.43, 0.6, 0.09, k.status);
  k.box(49.05, 10.4, -1.21, 0.46, 0.35, 0.09, k.yellow);
}
