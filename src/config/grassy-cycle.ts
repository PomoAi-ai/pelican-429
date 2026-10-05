/** Shared bicycle dimensions for Grassy's baked riding clip and runtime model. */
export const GRASSY_CYCLE = {
  // Three pedal revolutions return both wheels to the same reflector angle.
  seconds: 1.2,
  crankRevolutions: 3,
  scale: 0.48,
  forward: 0.14,
  crankOffset: -Math.PI / 2,
  wheelPerCrank: 1 / 3,
  grip: { halfSpan: 0.46, forward: 0.61, height: 1.70 },
} as const;
