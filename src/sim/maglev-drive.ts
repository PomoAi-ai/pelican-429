export interface MaglevDrive {
  /** 整个车队的中心，轨道沿 X 从 0 延伸到 trackLength。 */
  x: number;
  speed: number;
  lift: number;
}

export interface MaglevDriveInput {
  throttle: -1 | 0 | 1;
  brake: boolean;
}

interface MaglevDriveBounds {
  trackLength: number;
  trainLength: number;
}

export function createMaglevDrive(trackLength: number, _trainLength: number): MaglevDrive {
  return { x: trackLength / 2, speed: 0, lift: 0 };
}

export function stepMaglevDrive(state: MaglevDrive, input: MaglevDriveInput, dt: number, bounds: MaglevDriveBounds): void {
  const target = input.brake ? 0 : input.throttle * 12;
  const rate = input.brake ? 16 : input.throttle === 0 ? 1.2 : 3.6;
  const halfLength = bounds.trainLength / 2;
  const end = bounds.trackLength - halfLength;
  let remaining = dt;
  // 在升起、零速、限速和端点时分段，长短帧都在同一时刻起步或落轨。
  while (remaining > 0) {
    const canDepart = target < 0 ? state.x > halfLength : target > 0 && state.x < end;
    if (state.speed === 0 && !canDepart) {
      state.lift = Math.max(0, state.lift - remaining / .45);
      return;
    }
    if (state.lift < 1) {
      const risingTime = (1 - state.lift) * .45;
      if (remaining <= risingTime) {
        state.lift += remaining / .45;
        return;
      }
      state.lift = 1;
      remaining -= risingTime;
    }
    const acceleration = Math.sign(target - state.speed) * rate;
    const nextSpeed = state.speed * target < 0 ? 0 : target;
    const timeToSpeed = acceleration === 0 ? Infinity : Math.abs(nextSpeed - state.speed) / rate;
    const interval = Math.min(remaining, timeToSpeed);
    const nextX = state.x + state.speed * interval + acceleration * interval ** 2 / 2;
    if (nextX <= halfLength || nextX >= end) {
      const limit = nextX <= halfLength ? halfLength : end;
      const distance = limit - state.x;
      const hitTime = acceleration === 0 ? distance / state.speed
        : 2 * distance / (state.speed + Math.sign(distance) * Math.sqrt(state.speed ** 2 + 2 * acceleration * distance));
      state.x = limit;
      state.speed = 0;
      remaining -= hitTime;
    } else {
      state.x = nextX;
      state.speed = interval === timeToSpeed ? nextSpeed : state.speed + acceleration * interval;
      remaining -= interval;
    }
  }
}
