export const FACE_PARAMETERS = [
  { id: 'faceWidth', zh: '脸宽', en: 'Face width' },
  { id: 'faceLength', zh: '脸长', en: 'Face length' },
  { id: 'jawWidth', zh: '下颌宽', en: 'Jaw width' },
  { id: 'chinLength', zh: '下巴长度', en: 'Chin length' },
  { id: 'eyeSize', zh: '眼睛大小', en: 'Eye size' },
  { id: 'eyeSpacing', zh: '眼距', en: 'Eye spacing' },
  { id: 'noseSize', zh: '鼻子大小', en: 'Nose size' },
  { id: 'mouthWidth', zh: '嘴宽', en: 'Mouth width' },
] as const;
export const HAIR_STYLES = [
  { id: 'original', zh: '原版短发', en: 'Original' },
  { id: 'waves', zh: '侧编卷发', en: 'Braided waves' },
  { id: 'bob', zh: '侧分短发', en: 'Side-part bob' },
  { id: 'ponytail', zh: '高马尾', en: 'Ponytail' },
  { id: 'loose', zh: '柔和长发', en: 'Loose waves' },
  { id: 'sleek', zh: '利落短发', en: 'Sleek crop' },
  { id: 'braid', zh: '侧麻花辫', en: 'Side braid' },
] as const;
export const OUTFIT_STYLES = [
  { id: 'original', zh: '原版毛衣', en: 'Original sweater' },
  { id: 'royal', zh: '幻想冒险', en: 'Royal adventurer' },
  { id: 'urban', zh: '都市酷感', en: 'Urban' },
  { id: 'explorer', zh: '清爽干练', en: 'Explorer' },
  { id: 'soft', zh: '温柔轻熟', en: 'Soft knit' },
  { id: 'dark', zh: '简洁冷艳', en: 'Dark elegance' },
  { id: 'sport', zh: '活力运动', en: 'Sport' },
] as const;
export const APPEARANCE_COLORS = [
  { id: 'skin', zh: '肤色', en: 'Skin' }, { id: 'hair', zh: '发色', en: 'Hair' },
  { id: 'top', zh: '上衣', en: 'Top' }, { id: 'bottom', zh: '下装', en: 'Bottom' },
  { id: 'shoes', zh: '鞋子', en: 'Shoes' },
] as const;
export type FaceParameter = typeof FACE_PARAMETERS[number]['id'];
export type HairId = typeof HAIR_STYLES[number]['id'];
export type OutfitId = typeof OUTFIT_STYLES[number]['id'];
export interface CharacterAppearance {
  version: 1;
  body: 'male' | 'female';
  hair: HairId;
  outfit: OutfitId;
  face: Record<FaceParameter, number>;
  colors: Record<typeof APPEARANCE_COLORS[number]['id'], string>;
}
export const DEFAULT_CHARACTER_APPEARANCE: CharacterAppearance = {
  version: 1, body: 'male', hair: 'original', outfit: 'original',
  face: { faceWidth: 0, faceLength: 0, jawWidth: 0, chinLength: 0, eyeSize: 0, eyeSpacing: 0, noseSize: 0, mouthWidth: 0 },
  colors: { skin: '#f4c5aa', hair: '#493027', top: '#c32e35', bottom: '#365e80', shoes: '#e0cbb4' },
};

const female = (hair: HairId, outfit: OutfitId, top: string, bottom: string, hairColor: string, shoes: string): CharacterAppearance => ({
  ...DEFAULT_CHARACTER_APPEARANCE, body: 'female', hair, outfit,
  face: { ...DEFAULT_CHARACTER_APPEARANCE.face },
  colors: { skin: '#f9d8c7', hair: hairColor, top, bottom, shoes },
});
export const CHARACTER_PRESETS = [
  { id: 'original', zh: '原版主角', en: 'Original hero', appearance: DEFAULT_CHARACTER_APPEARANCE },
  { id: 's1', zh: 'S1 · 幻想冒险', en: 'S1 · Royal', appearance: female('waves', 'royal', '#3567ae', '#4b4545', '#e6bd75', '#ddd6ca') },
  { id: 's2', zh: 'S2 · 都市酷感', en: 'S2 · Urban', appearance: female('bob', 'urban', '#30313c', '#89394f', '#d9b995', '#29282b') },
  { id: 's3', zh: 'S3 · 清爽干练', en: 'S3 · Explorer', appearance: female('ponytail', 'explorer', '#83b9a3', '#34465f', '#deb88a', '#765a40') },
  { id: 's4', zh: 'S4 · 温柔轻熟', en: 'S4 · Soft', appearance: female('loose', 'soft', '#eee5d7', '#bc8597', '#ddb38a', '#ddd6ca') },
  { id: 's5', zh: 'S5 · 简洁冷艳', en: 'S5 · Dark', appearance: female('sleek', 'dark', '#383540', '#302d38', '#ded1ad', '#29282b') },
  { id: 's6', zh: 'S6 · 活力运动', en: 'S6 · Sport', appearance: female('braid', 'sport', '#e98777', '#eee8dd', '#d9b080', '#e8d9cc') },
];

/** 本机存档是外部输入；损坏或不兼容的搭配不能悄悄换成另一角色。 */
export function parseCharacterAppearance(value: unknown): CharacterAppearance {
  const fail = (field: string): never => { throw new Error(`角色外观数据无效 / Invalid appearance: ${field}`); };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('object');
  const data = value as Record<string, unknown>;
  if (data.version !== 1) return fail('version');
  if (data.body !== 'male' && data.body !== 'female') return fail('body');
  if (!HAIR_STYLES.some(item => item.id === data.hair)) return fail('hair');
  if (!OUTFIT_STYLES.some(item => item.id === data.outfit)) return fail('outfit');
  if (data.body === 'male' ? data.hair !== 'original' || data.outfit !== 'original' : data.hair === 'original' || data.outfit === 'original') return fail('body / hair / outfit');
  if (typeof data.face !== 'object' || data.face === null || Array.isArray(data.face)) return fail('face');
  if (typeof data.colors !== 'object' || data.colors === null || Array.isArray(data.colors)) return fail('colors');
  const face = data.face as Record<string, unknown>;
  const colors = data.colors as Record<string, unknown>;
  for (const { id } of FACE_PARAMETERS) {
    if (typeof face[id] !== 'number' || !Number.isFinite(face[id]) || face[id] < -1 || face[id] > 1) return fail(`face.${id}`);
  }
  for (const { id } of APPEARANCE_COLORS) if (typeof colors[id] !== 'string' || !/^#[\da-f]{6}$/i.test(colors[id])) return fail(`colors.${id}`);
  return { version: 1, body: data.body, hair: data.hair as HairId, outfit: data.outfit as OutfitId,
    face: Object.fromEntries(FACE_PARAMETERS.map(({ id }) => [id, face[id]])) as CharacterAppearance['face'],
    colors: Object.fromEntries(APPEARANCE_COLORS.map(({ id }) => [id, colors[id]])) as CharacterAppearance['colors'] };
}
