export const FREE_WORLD_SIZES = {
  small: { width: 2048, height: 192, label: '小型', labelEn: 'Small' },
  medium: { width: 3072, height: 192, label: '中型', labelEn: 'Medium' },
  large: { width: 4096, height: 192, label: '大型', labelEn: 'Large' },
} as const;

export type FreeWorldSize = keyof typeof FREE_WORLD_SIZES;

export function parseFreeWorldSize(raw: string | null): FreeWorldSize {
  if (raw === null) return 'medium';
  if (Object.hasOwn(FREE_WORLD_SIZES, raw)) return raw as FreeWorldSize;
  throw new Error(`free-world: invalid size "${raw}"; expected small, medium or large`);
}
