import type { ShowcaseCard, ShowcaseEntry } from '../../config/showcase.ts';
import { TERRAIN_COMPOSITIONS } from '../../config/terrain-compositions.ts';
import { WIND_LABELS } from '../../config/weather-rules.ts';
import type { ShowcaseModel } from './showcase-model.ts';

const layouts = { single: '悬空单格', raised: '地面单格', flat: '连续平地', shapes: '四种形状并列', steps: '阶梯拼接', mixed: '多材质固定对照' };
const shapes = ['整格（1 × 1）', '右升斜坡', '左升斜坡', '半格（1 × 0.5）'];
const layers = { ground: '仅瓦片', cover: '瓦片 + 地被', flora: '再加花草', all: '完整植被' };
const habitats = { open: '空旷', wood: '树下', shore: '岸边', desert: '沙漠' };
const groundEntry = (entry: ShowcaseEntry<string>): boolean => (entry.actor === 'terrain' && !['branch', 'roof'].includes(entry.action)) || (entry.actor === 'grass' && entry.action === 'natural');

/** 场景功能展示卡片的标题与说明（中文原文，显示处经 t() 翻译）。 */
export function labCardText(card: ShowcaseCard, model: ShowcaseModel): { title: string; detail: string } {
  const entry = model.entry(card.entryId);
  const options = card.resource!;
  if (entry.actor === 'climber') return { title: entry.label, detail: entry.description };
  if (options.composition) {
    const composition = TERRAIN_COMPOSITIONS.find(({ id }) => id === options.composition)!;
    return { title: `${composition.label} · ${entry.label}`, detail: `${composition.description} · 种子 ${options.seed} · ${layers[options.vegetation]}${options.platforms ? ' · 青线：可站立' : ''}` };
  }
  const name = options.assembly && entry.actor === 'cave' ? '完整洞穴' : entry.label;
  const ground = groundEntry(entry);
  const terrain = ground && entry.actor === 'terrain';
  const form = terrain ? `${layouts[options.layout]}${(options.layout === 'single' || options.layout === 'raised') && entry.supportsShapes ? ` · ${shapes[options.shapeIndex]}` : ''}` : '';
  const material = options.layout === 'mixed' && terrain ? '' : name;
  const title = model.activeDemo?.id === 'seeds' ? `${name} · 变化 ${model.cards.indexOf(card) + 1}`
    : model.activeDemo?.id === 'wind' ? `${name} · ${WIND_LABELS[options.wind]}`
    : model.activeDemo?.id === 'layers' ? `${name} · ${layers[options.vegetation]}`
    : model.activeDemo?.id === 'habitats' || model.activeDemo?.id === 'scenes' ? `${name} · ${habitats[options.habitat]}`
    : [material, form].filter(Boolean).join(' · ');
  const sample = terrain && (options.layout === 'single' || options.layout === 'raised') ? `${options.sampleCount === 8 ? `八个自然样本 ${options.sampleIndex + 1}–${options.sampleIndex + 8}` : `样本 ${options.sampleIndex + 1}`} · ` : '';
  return { title, detail: `${sample}${card.environment === 'surface' ? '地上' : '地下'} · 种子 ${options.seed} · ${WIND_LABELS[options.wind]}${ground ? ` · ${layers[options.vegetation]}` : ''}` };
}
