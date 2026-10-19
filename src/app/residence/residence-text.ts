import { TILE_SHAPE_DEFINITIONS } from '../../config/definition-kit.ts';
import { t } from '../../config/i18n.ts';
import { RESIDENCE_MATERIALS, RESIDENCE_RESOURCES, type ResidenceResource } from '../../config/residence.ts';

/** 实体砖名是“材质 · 形状”的组合，词典按两段分别收录。 */
export function pieceLabel(resource: ResidenceResource): string {
  return resource.kind === 'solid'
    ? `${t(RESIDENCE_MATERIALS[resource.material])} · ${t(TILE_SHAPE_DEFINITIONS.find(shape => shape.id === resource.shape)!.label)}` : t(resource.label);
}

/** 建造结果文案来自 sim；“已放置/已替换为/已拆除 + 构件名”拆开译。 */
export function residenceMessage(message: string): string {
  const named = /^(已放置|已替换为|已拆除)(.+)$/.exec(message);
  return named ? t(`${named[1]!}{name}`).replace('{name}', pieceLabel(RESIDENCE_RESOURCES.find(resource => resource.label === named[2])!)) : t(message);
}
