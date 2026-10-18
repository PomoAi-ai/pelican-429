/** World units are tiles: X travel, Y up, Z platform depth. */
export const MAGLEV = {
  trackLength: 160,
  trackModuleLength: 2,
  platformDepth: 3,
  trackDepth: 2,
  railCenterDepth: 0.64,
  railTop: 0.2,
  shoeBottom: 0.36,
  hoverHeight: 0.38,
  carLength: 7,
  carWidth: 1.8,
  carPitch: 7.4,
  carCount: 3,
  deckHeight: 0.9,
  seatPositions: [0.2, 1.225] as readonly number[],
} as const;
