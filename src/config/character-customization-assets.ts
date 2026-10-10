export const CUSTOMIZATION_MODELS = [
  { id: 'male', path: './characters/human/customization/male.glb' },
  { id: 'royal', path: './characters/human/customization/female-royal.glb' },
  { id: 'urban', path: './characters/human/customization/female-urban.glb' },
  { id: 'explorer', path: './characters/human/customization/female-explorer.glb' },
  { id: 'soft', path: './characters/human/customization/female-soft.glb' },
  { id: 'dark', path: './characters/human/customization/female-dark.glb' },
  { id: 'sport', path: './characters/human/customization/female-sport.glb' },
] as const;

export type CustomizationModelId = typeof CUSTOMIZATION_MODELS[number]['id'];
