import type { CatalogEntry, CatalogGroup } from './catalog.ts';

// 24 款换装角色与古典角色的条目由各自目录里的定义 JSON 生成（public 下运行时读取），数据只维护一份。
export interface RosterCharacter {
  readonly id: string; readonly name: string; readonly season: string; readonly body: string; readonly bodyDefinition: string;
  readonly hair: string; readonly face: string; readonly outfit: string; readonly shoes: string; readonly palette: string;
  readonly material: string; readonly viewChecks: string; readonly art: string;
  readonly ruler: string; readonly measuredFrontHeads: number;
  /** 每个职业都有男版：同职业、同配色的男款四视图，同一把统一标尺。 */
  readonly male: { readonly art: string; readonly hair: string; readonly outfit: string; readonly ruler: string; readonly measuredFrontHeads: number };
}
export interface RosterDefinitions {
  readonly common: { readonly approval: string; readonly proportion: { readonly targetHeads: number } };
  readonly characters: readonly RosterCharacter[];
}
/** 旧稿（猪八戒、沙和尚、唐三藏）已否决，没有画稿文件，只留档，不进目录。 */
export interface ClassicsCharacter {
  readonly id: string; readonly name: string; readonly english: string; readonly body: string; readonly definition: string;
  readonly art?: string; readonly ruler?: string; readonly measuredFrontHeads?: number | null; readonly measurementNote?: string;
}
export interface ClassicsDefinitions { readonly standard: string; readonly characters: readonly ClassicsCharacter[] }
type Redrawn = ClassicsCharacter & { art: string; ruler: string; measurementNote: string };

const ROSTER_DIR = './catalog/roster-24';
const CLASSICS_DIR = './catalog/classics-7';
const BODY_EN = { 均衡: 'Balanced', 纤细: 'Slim', 轻盈: 'Light' } as const;
type Body = keyof typeof BODY_EN;
const BODY_ORDER = Object.keys(BODY_EN) as Body[];

function rosterEntry(c: RosterCharacter, targetHeads: number): CatalogEntry {
  const dir = `${ROSTER_DIR}/${c.art.split('/')[0]}`;
  const body = c.body as Body;
  return {
    id: `roster-${c.id.toLowerCase()}`,
    title: [`${c.id} · ${c.name}（女 / 男）`, `${c.id} · Outfit draft (female / male)`],
    subgroup: [body, BODY_EN[body]],
    status: 'candidate',
    description: [`女版：${c.outfit}；${c.hair}。男版：${c.male.outfit}；${c.male.hair}。`, 'Female and male four-view concept artwork for the same profession and palette.'],
    evidence: ['女版与男版四视图各有统一标尺检查页（3.1格 + 3.3头身参照），地标虚线可开关；发冠与下巴读图约±5像素，肩腰膝约±10像素。画稿待用户选型，不是定稿或3D比例认证。',
      'Female and male sheets each have a unified ruler check with switchable landmark guides; crown and chin read to about ±5 px, shoulder, waist and knee to about ±10 px. Final approval pending.'],
    facts: [
      [['季节', 'Season'], c.season],
      [['体型', 'Body'], `${c.body}：${c.bodyDefinition}`],
      [['发型', 'Hair'], c.hair],
      [['脸型', 'Face'], c.face],
      [['服装', 'Outfit'], c.outfit],
      [['男版', 'Male version'], `${c.male.outfit}；${c.male.hair}`],
      [['鞋履', 'Shoes'], c.shoes],
      [['配色', 'Palette'], c.palette],
      [['材质', 'Material'], c.material],
      [['多视图要求', 'View checks'], c.viewChecks],
      [['比例', 'Proportion'], `女版正面约${c.measuredFrontHeads}H · 男版正面约${c.male.measuredFrontHeads}H · 目标${targetHeads}H`],
    ],
    images: [
      { label: ['女版四视图', 'Female four views'], path: `${ROSTER_DIR}/${c.art}` },
      { label: ['女版标尺检查', 'Female ruler check'], path: `${ROSTER_DIR}/${c.ruler}`, guides: `${ROSTER_DIR}/${c.ruler.replace(/\.png$/, '.guides.json')}` },
      { label: ['男版四视图', 'Male four views'], path: `${ROSTER_DIR}/${c.male.art}` },
      { label: ['男版标尺检查', 'Male ruler check'], path: `${ROSTER_DIR}/${c.male.ruler}`, guides: `${ROSTER_DIR}/${c.male.ruler.replace(/\.png$/, '.guides.json')}` },
    ],
    files: [{ label: ['几何与材质两套提示词', 'Geometry and material prompts'], path: `${dir}/${c.id.toLowerCase()}-prompts.txt` }],
  };
}

const rosterOverview = (approval: string): CatalogEntry => ({
  id: 'roster-24-overview',
  title: ['24个职业 · 总览与定义', '24 professions · Overview and definitions'],
  status: 'derived',
  description: ['24个职业或主题，每个都有女版和男版各一张四视图（正面、右侧、背面、前侧约45°），同职业同配色；女版按均衡、纤细、轻盈三种体型分组，不用健壮或微胖体型。本页向下依次是每个职业的定义、女版与男版四视图及各自的统一标尺，左侧目录可直接跳转。总览大图和批次定义图是第一版女稿，未含男版与重画稿。',
    'Twenty-four professions, each with a female and a male four-view sheet in the same palette and a unified ruler check for each. The overview and batch sheets show the first female drafts only.'],
  evidence: [approval, 'All 24 are drawn; approval pending. These are not 3D assets.'],
  images: [
    { label: ['24款总览大图', 'Overview of all 24'], path: `${ROSTER_DIR}/overview.png` },
    ...[1, 2, 3, 4, 5, 6].map(batch => ({
      label: [`第${batch}批定义`, `Batch ${batch} definitions`] as const,
      path: `${ROSTER_DIR}/definitions/batch-0${batch}.svg`,
    })),
    { label: ['用户尺度基准', 'User scale reference'], path: `${ROSTER_DIR}/references/character-tile-scale.png` },
  ],
  files: [
    { label: ['全部角色定义（JSON）', 'All definitions (JSON)'], path: `${ROSTER_DIR}/definitions/roster.json` },
    { label: ['文字与两套提示词', 'Text and prompts'], path: `${ROSTER_DIR}/definitions/all-24-definitions.txt` },
    { label: ['全部测量记录', 'All measurements'], path: `${ROSTER_DIR}/measurements-all.json` },
    { label: ['来源记录', 'Provenance'], path: `${ROSTER_DIR}/SOURCE.txt` },
  ],
});

function classicsEntry(c: Redrawn, targetHeads: number): CatalogEntry {
  const stem = c.id.toLowerCase();
  return {
    id: `classics-${stem}`,
    title: [`${c.name} · 游戏画风重绘`, `${c.english} · Game-style redraw`],
    status: 'candidate',
    description: [c.definition, `${c.english}. One fixed appearance, four views. Approval pending.`],
    evidence: [`${c.measurementNote} 新稿待选型。`, 'Outline estimates or target guide only; pending approval.'],
    facts: [
      [['体型', 'Body'], c.body],
      [['比例', 'Proportion'], c.measuredFrontHeads === null ? '头部遮挡，不报告实测值' : `正面约${c.measuredFrontHeads}H · 目标${targetHeads}H`],
    ],
    images: [
      { label: ['唯一造型四视图', 'Single-design four views'], path: `${CLASSICS_DIR}/${c.art}` },
      { label: ['比例标尺', 'Proportion ruler'], path: `${CLASSICS_DIR}/${c.ruler}`, guides: `${CLASSICS_DIR}/${c.ruler.replace(/\.png$/, '.guides.json')}` },
    ],
    files: [{ label: ['唯一造型定义与提示词', 'Definition and prompt'], path: `${CLASSICS_DIR}/${stem}-game-v2-definition.txt` }],
  };
}

const classicsOverview = (standard: string): CatalogEntry => ({
  id: 'classics-overview',
  title: ['刘关张与悟空 · 第一批重绘', 'Liu Bei, Guan Yu, Zhang Fei and Wukong · Redraw batch 1'],
  status: 'candidate',
  description: [`${standard}猪八戒、沙和尚、唐三藏的旧稿已否决，待下一批；旧稿只留档，不作为当前方案。`,
    'Four redrawn designs with one fixed appearance each; the other three are pending.'],
  evidence: ['用户否决旧风格；以游戏主角原图重新制作，尚待选型。', 'Previous style rejected. Redrawn against the game protagonist; approval pending.'],
  images: [{ label: ['第一批四款重绘', 'Four redrawn sheets'], path: `${CLASSICS_DIR}/overview-game-v2.png` }],
  files: [
    { label: ['每人唯一造型定义（JSON）', 'Definitions (JSON)'], path: `${CLASSICS_DIR}/definitions.json` },
    { label: ['比例记录', 'Measurements'], path: `${CLASSICS_DIR}/measurements.json` },
    { label: ['来源记录', 'Provenance'], path: `${CLASSICS_DIR}/SOURCE.txt` },
    { label: ['已否决旧七款总览（仅留档）', 'Rejected first seven (archive only)'], path: `${CLASSICS_DIR}/history/rejected-v1/overview.png` },
  ],
});

export function buildRosterGroup(roster: RosterDefinitions): CatalogGroup {
  const target = roster.common.proportion.targetHeads;
  return {
    id: 'roster-24',
    label: ['24款换装角色', '24 character variants'],
    entries: [rosterOverview(roster.common.approval), ...BODY_ORDER.flatMap(body => roster.characters.filter(c => c.body === body).map(c => rosterEntry(c, target)))],
  };
}

export function buildClassicsGroup(classics: ClassicsDefinitions, targetHeads: number): CatalogGroup {
  const redrawn = classics.characters.filter((c): c is Redrawn => c.art !== undefined);
  return {
    id: 'classics-7',
    label: ['刘关张与西游师徒', 'Chinese classical characters'],
    entries: [classicsOverview(classics.standard), ...redrawn.map(c => classicsEntry(c, targetHeads))],
  };
}
