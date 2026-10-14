import { CatmullRomCurve3, Vector3 } from 'three';
import type { HairLock } from './d1-authored-hair-recipe.ts';

type Point = readonly [number, number, number];

/** 主发束按偏分、耳部开口和短发外轮廓分别绘制，不从旧头发取形。 */
export function createSculptedHairLocks(): HairLock[] {
  const locks: HairLock[] = [];
  const add = (name: string, region: HairLock['region'], points: Point[], widths: number[], depth: number, stiffness: number, shade: number, scalpOffset: number): void => {
    locks.push({ name, region, points, widths, depth, stiffness, shade, scalpOffset });
  };

  // 四片饱满的主刘海从偏分梳开，额前下缘长短错开。
  add('sweep-outer', 'fringe', [[.09, 3.047, .035], [-.105, 3.02, .256], [-.28, 2.90, .37], [-.393, 2.73, .32], [-.465, 2.637, .247], [-.487, 2.615, .217]], [.024, .09, .106, .078, .035, .002], .036, .92, 1.01, .078);
  add('sweep-middle', 'fringe', [[.13, 3.051, .102], [-.024, 2.977, .35], [-.142, 2.827, .477], [-.245, 2.651, .434], [-.318, 2.597, .367]], [.025, .089, .091, .049, .002], .035, .90, 1.055, .092);
  add('sweep-short', 'fringe', [[.164, 3.036, .145], [.123, 2.97, .366], [.029, 2.795, .501], [-.018, 2.69, .484], [-.06, 2.622, .463]], [.02, .056, .061, .03, .0016], .031, .93, 1.02, .099);
  add('sweep-right', 'fringe', [[.197, 3.038, .068], [.314, 2.956, .272], [.372, 2.809, .35], [.412, 2.671, .278], [.455, 2.616, .203]], [.023, .084, .088, .055, .002], .034, .94, .99, .082);
  add('sweep-right-edge', 'fringe', [[.195, 3.019, -.003], [.338, 2.918, .144], [.427, 2.732, .211], [.459, 2.587, .141]], [.017, .063, .054, .002], .031, .95, .98, .068);

  // 侧冠只有几片弧线不同的主束，后束逐渐搭在蓬松短发上。
  for (const side of [-1, 1]) {
    const x = (value: number): number => side * value;
    add(`crown-${side}-front`, 'crown', [[.09, 3.056, -.038], [x(.248), 3.025, -.012], [x(.4), 2.881, -.022], [x(.49), 2.698, -.049], [x(.483), 2.595, -.123]], [.024, .076, .078, .055, .002], .036, .99, 1.035, .069);
    add(`crown-${side}-middle`, 'crown', [[.066, 3.045, -.124], [x(.26), 3.008, -.178], [x(.429), 2.84, -.213], [x(.495), 2.613, -.233], [x(.447), 2.497, -.263]], [.026, .083, .09, .064, .002], .039, .99, 1.01, .075);
    add(`crown-${side}-back`, 'crown', [[.036, 3.034, -.227], [x(.218), 2.97, -.332], [x(.375), 2.799, -.377], [x(.446), 2.582, -.382], [x(.396), 2.487, -.394]], [.025, .079, .09, .058, .002], .038, .99, .98, .071);

    // 耳前是一片柔弧，末端向脸侧回收；耳后的胖束留出局部耳廓开口。
    add(`temple-${side}-soft`, 'temple', [[x(.415), 2.736, .204], [x(.462), 2.54, .222], [x(.479), 2.375, .209], [x(.448), 2.261, .267], [x(.419), 2.21, .26]], [.024, .046, .052, .027, .0015], .025, .67, 1.055, .049);
    add(`temple-${side}-small`, 'temple', [[x(.393), 2.638, .264], [x(.427), 2.505, .282], [x(.432), 2.37, .29], [x(.395), 2.328, .32]], [.013, .026, .024, .0013], .017, .73, 1.07, .040);
    add(`bob-${side}-ear-back`, 'back', [[x(.397), 2.716, -.252], [x(.479), 2.529, -.219], [x(.58), 2.367, -.164], [x(.584), 2.252, -.067], [x(.526), 2.182, .009], [x(.492), 2.158, .043]], [.023, .058, .085, .075, .032, .002], .037, .54, 1.0, .060);
    add(`bob-${side}-cheek`, 'back', [[x(.37), 2.434, -.159], [x(.451), 2.358, -.073], [x(.515), 2.249, .091], [x(.468), 2.186, .16], [x(.441), 2.15, .174]], [.023, .057, .064, .028, .0015], .029, .62, 1.04, .055);
    add(`bob-${side}-outer-curl`, 'back', [[x(.447), 2.64, -.259], [x(.57), 2.457, -.245], [x(.627), 2.30, -.191], [x(.59), 2.231, -.12], [x(.566), 2.198, -.079]], [.019, .047, .05, .024, .0015], .025, .50, 1.06, .053);
  }

  // 后脑的主束大小、弯曲和长度各异，体积最大处落在短发的下半部。
  const angles = [112, 132, 149, 166, 182, 199, 217, 235, 252];
  const ends = [2.205, 2.162, 2.194, 2.143, 2.187, 2.151, 2.201, 2.173, 2.221];
  const widths = [1.02, 1.10, .94, 1.06, 1.11, .95, 1.04, .98, 1.03];
  for (let i = 0; i < angles.length; i++) {
    const azimuth = angles[i]! * Math.PI / 180;
    const curl = (i % 2 === 0 ? 1 : -1) * (.055 + (i % 3) * .018);
    const p = (rx: number, y: number, rz: number, turn = 0): Point => [Math.sin(azimuth + turn) * rx, y, Math.cos(azimuth + turn) * rz - .015];
    const w = widths[i]!, end = ends[i]!;
    add(`bob-back-${i + 1}`, 'back', [
      p(.235, 2.955, .273), p(.36, 2.835, .401, -.018),
      p(.463, 2.643, .464, curl * -.4), p(.566, 2.427, .523, curl * .4),
      p(.579, 2.294, .494, curl), p(.489, end, .418, curl * 1.6),
      p(.453, end - .022, .411, curl * 1.85),
    ], [.022, .057 * w, .07 * w, .094 * w, .077 * w, .029 * w, .0015], .038 + (i % 3) * .003, .52 + (i % 4) * .025, .99 + (i % 3) * .023, .067);
  }
  add('back-crown-left', 'crown', [[.05, 3.042, -.106], [-.135, 2.998, -.276], [-.225, 2.823, -.443], [-.222, 2.655, -.517], [-.13, 2.573, -.541]], [.019, .079, .105, .076, .002], .044, .99, 1.035, .078);
  add('back-crown-right', 'crown', [[.075, 3.042, -.11], [.189, 2.972, -.291], [.263, 2.793, -.427], [.229, 2.611, -.485], [.134, 2.568, -.522]], [.019, .082, .094, .071, .002], .042, .99, 1.00, .079);
  add('back-crown-center', 'crown', [[.074, 3.05, -.171], [.034, 2.958, -.396], [-.035, 2.775, -.536], [.015, 2.601, -.557], [.074, 2.55, -.551]], [.017, .087, .101, .068, .002], .045, .99, 1.02, .088);

  // 三股圆润编带沿同一辫芯贴头，形成少量饱满、可读的交替辫瓣。
  const braidCurve = new CatmullRomCurve3([
    new Vector3(.242, 2.996, .073), new Vector3(.359, 2.891, .139),
    new Vector3(.461, 2.734, .088), new Vector3(.461, 2.544, -.052),
  ], false, 'centripetal');
  for (const side of [-1, 1]) for (let band = 0; band < 3; band++) {
    const points: Point[] = [], braidCenters: Point[] = [], bandWidths: number[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, core = braidCurve.getPoint(t);
      core.x *= side;
      const phase = t * Math.PI * 5 + band * Math.PI * 2 / 3 + .22;
      const tip = Math.min(1, (1 - t) / .10 + .04);
      const root = Math.min(1, .48 + t * 9);
      const radial = Math.sin(phase) * .022 * tip * root;
      const normal = new Vector3(core.x, core.y - 2.544, core.z).normalize();
      braidCenters.push([core.x, core.y, core.z]);
      points.push([core.x + normal.x * radial, core.y + normal.y * radial, core.z + normal.z * radial + Math.cos(phase) * .035 * tip * root]);
      bandWidths.push(i === 48 ? .0016 : .027 * tip * root * (1 + .055 * Math.sin(t * 11 + band)));
    }
    add(`braid-${side}-${band + 1}`, 'braid', points, bandWidths, .020, 1, 1.01 + band * .025, .090);
    locks[locks.length - 1]!.braidCenters = braidCenters;
  }
  return locks;
}
