import { CatmullRomCurve3, Vector3 } from 'three';

type Point = readonly [number, number, number];
export type HairLock = {
  name: string;
  region: 'fringe' | 'crown' | 'temple' | 'back' | 'braid';
  points: readonly Point[];
  widths: readonly number[];
  depth: number;
  stiffness: number;
  shade: number;
  scalpOffset: number;
  braidCenters?: readonly Point[];
};

/** 以批准头部为标尺逐束绘制，曲线和截面均不取自参考头发网格。 */
export function createAuthoredHairLocks(): HairLock[] {
  const locks: HairLock[] = [];
  const add = (name: string, region: HairLock['region'], points: Point[], widths: number[], depth: number, stiffness: number, shade: number): void => {
    const scalpOffset = { fringe: .037, crown: .048, temple: .024, back: .022, braid: .063 }[region];
    locks.push({ name, region, points, widths, depth, stiffness, shade, scalpOffset });
  };

  // 分缝是前后延伸的小弧，左扫束分层覆盖，不在额头前汇成一个尖结。
  add('fringe-wide-sweep', 'fringe', [[.09, 3.027, .035], [-.10, 2.984, .265], [-.27, 2.814, .348], [-.374, 2.638, .271], [-.419, 2.61, .225]], [.025, .105, .097, .044, .0015], .027, .90, 1.00);
  add('fringe-middle-sweep', 'fringe', [[.105, 3.042, .072], [-.035, 2.96, .338], [-.144, 2.80, .426], [-.252, 2.667, .384], [-.304, 2.625, .337]], [.026, .078, .079, .042, .0015], .025, .88, 1.045);
  add('fringe-inner-sweep', 'fringe', [[.12, 3.044, .105], [.077, 2.967, .334], [-.012, 2.807, .465], [-.09, 2.661, .459], [-.147, 2.613, .426]], [.022, .062, .058, .029, .0013], .022, .90, .97);
  add('fringe-center-tip', 'fringe', [[.158, 3.027, .119], [.157, 2.95, .327], [.106, 2.80, .452], [.051, 2.67, .47]], [.014, .038, .034, .0013], .018, .94, 1.05);
  add('fringe-right-turn', 'fringe', [[.185, 3.017, .062], [.281, 2.938, .256], [.325, 2.779, .326], [.351, 2.653, .28], [.38, 2.591, .21]], [.018, .071, .068, .038, .0016], .025, .91, 1.01);
  add('fringe-right-edge', 'fringe', [[.22, 2.974, .024], [.331, 2.877, .199], [.386, 2.703, .237], [.416, 2.571, .157]], [.014, .051, .043, .0014], .020, .91, .94);
  add('crown-lifted-sweep', 'crown', [[.08, 3.025, .025], [-.075, 2.99, .195], [-.255, 2.917, .222], [-.365, 2.812, .241], [-.407, 2.82, .209]], [.018, .058, .062, .027, .0015], .018, 1, 1.025);

  // 冠部沿分缝两边梳开，发片根宽、截面薄，与下层后发交错搭接。
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = .10 - i * .077;
      const rootY = 3.01 - Math.max(0, -z - .10) * .36;
      const endZ = z - .102;
      const extent = .42 - Math.max(0, -z - .15) * .28;
      add(`crown-${side < 0 ? 'left' : 'right'}-${i + 1}`, 'crown', [
        [.075, rootY, z], [side * .20, rootY + .022, z - .042],
        [side * .305, 2.866 - i * .018, z - .055],
        [side * extent, 2.69 - i * .035, endZ],
        [side * (extent + .017), 2.57 - i * .051, endZ - .04],
        [side * (extent - .017), 2.49 - i * .050 + .015 * Math.sin(i * 2.1), endZ - .075],
      ], [.018, .048, .066, .054, .035, .0015], .016, .99, .97 + (i % 3) * .017);
    }

    // 耳前只有薄窄的侧发；耳后的层次在另一条路径，留出耳廓本身。
    add(`temple-${side}-front`, 'temple', [
      [side * .352, 2.79, .198], [side * .407, 2.60, .156],
      [side * .416, 2.395, .147], [side * .388, 2.235, .132],
      [side * .348, 2.16, .19],
    ], [.015, .03, .032, .024, .0014], .011, .58, 1.00);
    add(`temple-${side}-inner-tip`, 'temple', [
      [side * .354, 2.662, .248], [side * .384, 2.48, .221],
      [side * .379, 2.306, .223], [side * .334, 2.244, .253],
    ], [.01, .02, .017, .0011], .009, .64, 1.025);
    add(`temple-${side}-behind-ear`, 'temple', [
      [side * .371, 2.66, -.23], [side * .408, 2.455, -.185],
      [side * .485, 2.282, -.075], [side * .449, 2.128, .018],
      [side * .407, 2.143, .048],
    ], [.019, .058, .055, .031, .0015], .016, .54, .97);
    add(`temple-${side}-bob-edge`, 'temple', [
      [side * .416, 2.53, -.21], [side * .515, 2.395, -.164],
      [side * .513, 2.238, -.102], [side * .460, 2.17, -.036],
    ], [.014, .047, .041, .0013], .015, .49, 1.01);
  }

  // 后冠三片从分缝连到后脑，遮住下层根部；长度错开形成柔和的叠覆线。
  add('crown-back-left', 'crown', [[.045, 3.015, -.045], [-.10, 2.976, -.217], [-.19, 2.833, -.396], [-.205, 2.68, -.467], [-.15, 2.565, -.487]], [.015, .068, .088, .068, .0014], .018, .99, 1.015);
  add('crown-back-right', 'crown', [[.077, 3.016, -.038], [.184, 2.955, -.213], [.234, 2.798, -.379], [.222, 2.662, -.445], [.14, 2.572, -.485]], [.015, .066, .08, .061, .0014], .018, .99, .98);
  add('crown-back-center', 'crown', [[.067, 3.02, -.085], [.015, 2.958, -.284], [-.018, 2.793, -.45], [.028, 2.636, -.496], [.072, 2.562, -.485]], [.012, .079, .10, .064, .0014], .019, .99, 1.025);

  // 后脑上下两层错开；外轮廓在耳后绕行，再向下颌高度内收。
  for (let i = 0; i < 17; i++) {
    const a = (113 + i * 8.375 + Math.sin(i * 1.34) * .9) * Math.PI / 180;
    const turn = Math.sin(i * 1.73) * .075;
    const length = 2.112 + .022 * Math.sin(i * 2.16) + .012 * Math.cos(i * .8);
    const width = .94 + Math.sin(i * 1.62) * .11;
    const path = (rx: number, y: number, rz: number, offset = 0): Point => [Math.sin(a + offset) * rx, y, Math.cos(a + offset) * rz - .012];
    add(`back-lower-${i + 1}`, 'back', [
      path(.28, 2.886, .33), path(.445, 2.688, .465),
      path(.465, 2.46, .44), path(.503, 2.27, .458, turn * .5),
      path(.437, length, .379, turn),
    ], [.008, .027 * width, .047 * width, .055 * width, .0014], .017, .45 + (i % 3) * .035, .96 + (i % 4) * .019);
  }

  // 三条连续扁发带围绕辫芯交织，交点上下分层，避免短发片形成断开的结。
  const braidPath: Point[] = [[.224, 2.965, .136], [.333, 2.889, .182], [.405, 2.743, .151], [.423, 2.567, .054]];
  const braidCurve = new CatmullRomCurve3(braidPath.map(point => new Vector3(...point)), false, 'centripetal');
  const at = (t: number, side: number): Point => {
    const point = braidCurve.getPoint(t);
    return [side * point.x, point.y, point.z];
  };
  for (const side of [-1, 1]) {
    for (let band = 0; band < 3; band++) {
      const points: Point[] = [], widths: number[] = [], braidCenters: Point[] = [];
      for (let step = 0; step <= 48; step++) {
        const t = step / 48, p = at(t, side);
        const phase = t * Math.PI * 6 + band * Math.PI * 2 / 3;
        const taper = Math.min(1, (1 - t) * 8 + .08);
        const radial = (.019 + Math.sin(phase) * .012) * taper;
        const radius = Math.hypot(p[0], p[1] - 2.544, p[2]);
        braidCenters.push([p[0] + p[0] / radius * .019 * taper, p[1] + (p[1] - 2.544) / radius * .019 * taper, p[2] + p[2] / radius * .019 * taper]);
        points.push([p[0] + p[0] / radius * radial, p[1] + (p[1] - 2.544) / radius * radial, p[2] + p[2] / radius * radial + Math.cos(phase) * .029 * taper]);
        widths.push(step === 48 ? .0012 : (.008 + .011 * Math.min(1, t / .06)) * taper);
      }
      add(`braid-${side}-band-${band + 1}`, 'braid', points, widths, .010, 1, .96 + band * .035);
      locks[locks.length - 1]!.braidCenters = braidCenters;
    }
    add(`braid-${side}-tucked-end`, 'braid', [[side * .403, 2.577, .058], [side * .413, 2.584, -.018], [side * .406, 2.568, -.11], [side * .38, 2.548, -.19]], [.017, .023, .02, .0013], .011, 1, .97);
  }
  return locks;
}
