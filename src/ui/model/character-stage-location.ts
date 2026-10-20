import { D1_ANIMATED_MODELS, D1_SHADINGS } from '../../config/grassy.ts';
import type { ShowcaseCard, ShowcaseCatalog } from '../../config/showcase.ts';

type Actor = Pick<ShowcaseCard, 'entryId' | 'facing' | 'playing' | 'modelYaw' | 'modelPitch' | 'speed' | 'loop'> & Partial<Pick<ShowcaseCard, 'd1Variant' | 'd1HairVisible' | 'd1Shading'>>;
export interface CharacterStageView { zoom: number; angle: number; environment: ShowcaseCard['environment'] }
interface CharacterStageLocation extends CharacterStageView { cards: Actor[] }
export const CHARACTER_STAGE_PARAMS = ['stageActor', 'stageZoom', 'stageAngle', 'stageEnvironment'] as const;

/** URL 只保存对比所需的角色和镜头，不反序列化任意卡片状态。 */
export function readCharacterStageLocation(params: URLSearchParams, catalog: ShowcaseCatalog): CharacterStageLocation | null {
  if (!CHARACTER_STAGE_PARAMS.some(key => params.has(key))) return null;
  const number = (text: string | null, min: number, max: number): number => {
    const value = Number(text);
    if (text === null || text.trim() === '' || !Number.isFinite(value) || value < min || value > max) throw new Error(`展示场对比参数超出范围：${text}`);
    return value;
  };
  const environment = params.get('stageEnvironment');
  if (environment !== 'surface' && environment !== 'underground') throw new Error(`未知展示场环境：${environment}`);
  const angle = number(params.get('stageAngle'), -8, 8);
  if (![0, 8, -8].includes(angle)) throw new Error(`未知展示场角度：${angle}`);
  const entries = params.getAll('stageActor');
  if (entries.length > catalog.maxCards) throw new Error(`展示场角色数量超过 ${catalog.maxCards}`);
  const cards = entries.map((value): Actor => {
    const fields = value.split(',');
    if (fields.length !== 7 && fields.length !== 9 && fields.length !== 10) throw new Error(`无效展示场角色参数：${value}`);
    const [entryId, facing, playing, yaw, pitch, speed, loop] = fields as [string, string, string, string, string, string, string];
    const entry = catalog.entries.find(entry => entry.id === entryId);
    if (!entry) throw new Error(`展示目录中不存在项目：${entryId}`);
    if ((facing !== '1' && facing !== '-1') || (playing !== '0' && playing !== '1') || (loop !== '0' && loop !== '1')) throw new Error(`无效展示场播放或朝向参数：${value}`);
    let d1: Pick<ShowcaseCard, 'd1Variant' | 'd1HairVisible' | 'd1Shading'> | undefined;
    if (entry.actor === 'd1') {
      const variant = D1_ANIMATED_MODELS.find(model => model.id === (fields[7] ?? 'game'));
      const shading = D1_SHADINGS.find(item => item.id === (fields[9] ?? 'anime'));
      if (!variant || !shading || fields.length >= 9 && fields[8] !== '0' && fields[8] !== '1') throw new Error(`无效 D1 模型参数：${value}`);
      d1 = { d1Variant: variant.id, d1HairVisible: fields.length >= 9 ? fields[8] === '1' : entry.d1HairVisible !== false, d1Shading: shading.id };
    } else if (fields.length !== 7) throw new Error(`非 D1 角色不能使用 D1 模型参数：${value}`);
    return { ...d1, entryId, facing: facing === '1' ? 1 : -1, playing: playing === '1', loop: loop === '1',
      modelYaw: number(yaw, -Math.PI, Math.PI), modelPitch: number(pitch, -Math.PI / 4, Math.PI / 3), speed: number(speed, .25, 1) };
  });
  return { cards, zoom: number(params.get('stageZoom'), .65, 12), angle, environment };
}

export function writeCharacterStageLocation(params: URLSearchParams, cards: readonly ShowcaseCard[], view: CharacterStageView): void {
  for (const key of CHARACTER_STAGE_PARAMS) params.delete(key);
  for (const card of cards) {
    const fields = [card.entryId, card.facing, Number(card.playing), card.modelYaw, card.modelPitch, card.speed, Number(card.loop)];
    if (card.entryId.startsWith('d1.')) fields.push(card.d1Variant, Number(card.d1HairVisible), card.d1Shading);
    params.append('stageActor', fields.join(','));
  }
  params.set('stageZoom', String(view.zoom));
  params.set('stageAngle', String(view.angle));
  params.set('stageEnvironment', view.environment);
}
