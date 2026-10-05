import type { WindMode } from './weather-rules.ts';
import type { TerrainCompositionId } from './terrain-compositions.ts';

export interface ResourceOptions {
  layout: 'single' | 'raised' | 'flat' | 'shapes' | 'steps' | 'mixed';
  /** 用户选中的游戏形状列表索引，由装配层映射到实际形状。 */
  shapeIndex: number;
  /** 单格在真实世界坐标中的取样编号，供轮廓、纹理与植被共用。 */
  sampleIndex: number;
  sampleCount: 1 | 8;
  /** 检视镜头的水平和俯仰角，单位为度。 */
  yaw: number;
  pitch: number;
  habitat: 'open' | 'wood' | 'shore' | 'desert';
  assembly: boolean;
  composition: TerrainCompositionId | null;
  vegetation: 'all' | 'ground' | 'cover' | 'flora';
  seed: number;
  wind: WindMode;
  reference: boolean;
  context: boolean;
  grid: boolean;
  platforms: boolean;
  inspectionLight: boolean;
}

/** 场地两侧留出镜头空间；跨列取样能看到游戏原有的自然变化。 */
export function resourceTileColumns(options: Pick<ResourceOptions, 'sampleIndex' | 'sampleCount'>, mapWidth: number): number[] {
  const span = (options.sampleCount - 1) * 3;
  const first = 6 + ((18 + options.sampleIndex * 7) % (mapWidth - 12 - span));
  return Array.from({ length: options.sampleCount }, (_, index) => first + index * 3);
}
