export const FREE_WORLD_BACKGROUNDS = {
  camp: { tint: '#fff8e9', light: 1 },
  forest: { tint: '#dceee2', light: .9 },
  lake: { tint: '#dceff6', light: 1 },
  desert: { tint: '#ffe5bf', light: 1.08 },
  islands: { tint: '#e8f4ff', light: 1.06 },
  fortress: { tint: '#bdd4e8', light: .78 },
  cathedral: { tint: '#b5d9eb', light: .65 },
  abyss: { tint: '#9ecbdc', light: .58 },
} as const;
export type FreeWorldBackground = keyof typeof FREE_WORLD_BACKGROUNDS;
export const freeWorldBackgroundPath = (theme: string): string => `./resources/free-world/${theme}.ktx2`;
