import { clamp } from './math.ts';

export function createWorldClock() {
  let hour = 10;
  let running = true;
  let daySeconds = 720;

  return {
    get hour() { return hour; },
    get running() { return running; },
    get daySeconds() { return daySeconds; },
    setHour(value: number) {
      if (!Number.isFinite(value) || value < 0 || value > 24) {
        throw new Error(`world-clock: hour must be within 0–24, got ${value}`);
      }
      hour = value % 24;
    },
    setRunning(value: boolean) { running = value; },
    setDaySeconds(value: number) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`world-clock: daySeconds must be positive, got ${value}`);
      }
      daySeconds = value;
    },
    update(dt: number) {
      if (running) hour = (hour + dt * 24 / daySeconds) % 24;
    },
  };
}

function smoothstep(low: number, high: number, value: number): number {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

export function sampleWorldTime(hour: number) {
  const phase = (hour - 6) / 12 * Math.PI;
  const elevation = Math.sin(phase);
  const across = Math.cos(phase);
  return {
    daylight: smoothstep(-.12, .25, elevation),
    night: 1 - smoothstep(-.3, .12, elevation),
    twilight: smoothstep(-.3, -.04, elevation) * (1 - smoothstep(.08, .45, elevation)),
    sunDirection: { x: -across, y: elevation, z: .7 },
    // 天体弧线适配正式正视镜头；世界光照仍使用完整太阳方向。
    celestialSunDirection: { x: -.08 - .12 * across, y: -.015 + .2 * elevation, z: -1 },
    celestialMoonDirection: { x: -.08 + .12 * across, y: -.015 - .2 * elevation, z: -1 },
  };
}

export type WorldClock = ReturnType<typeof createWorldClock>;
export type WorldTime = ReturnType<typeof sampleWorldTime>;
