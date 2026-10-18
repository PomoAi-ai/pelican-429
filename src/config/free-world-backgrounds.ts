// sky：主题是否露天，地下主题为 0，不随户外昼夜变暗。
export const FREE_WORLD_BACKGROUNDS = {
  camp: { tint: '#fff8e9', light: 1, sky: 1 },
  forest: { tint: '#dceee2', light: .9, sky: 1 },
  lake: { tint: '#dceff6', light: 1, sky: 1 },
  desert: { tint: '#ffe5bf', light: 1.08, sky: 1 },
  islands: { tint: '#e8f4ff', light: 1.06, sky: 1 },
  fortress: { tint: '#bdd4e8', light: .78, sky: 1 },
  cathedral: { tint: '#b5d9eb', light: .65, sky: 0 },
  abyss: { tint: '#9ecbdc', light: .58, sky: 0 },
} as const;
export type FreeWorldBackground = keyof typeof FREE_WORLD_BACKGROUNDS;
export const freeWorldBackgroundPath = (theme: string): string => `./resources/free-world/${theme}.ktx2`;
