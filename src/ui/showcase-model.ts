import { isEnemyKind } from '../config/enemy-models.ts';
import { CHARACTER_CATALOG } from '../config/showcase.ts';
import type { ShowcaseCatalog, ShowcaseCard, ShowcaseDemo } from '../config/showcase.ts';

export function createShowcaseModel(catalog: ShowcaseCatalog = CHARACTER_CATALOG) {
  const entry = (id: string) => {
    const item = catalog.entries.find((e) => e.id === id);
    if (!item) throw new Error(`展示目录中不存在项目：${id}`);
    return item;
  };
  const cards: ShowcaseCard[] = [];
  const listeners = new Set<() => void>();
  let nextId = 1;
  let activeDemo: ShowcaseDemo | null = null;
  let synchronized = false;
  let worldScale = false;
  const notify = (): void => { for (const listener of listeners) listener(); };
  const add = (entryId: string, from?: ShowcaseCard): void => {
    if (cards.length >= catalog.maxCards) return;
    const card: ShowcaseCard = {
      id: nextId++, entryId, environment: 'surface', facing: 1, modelYaw: isEnemyKind(entry(entryId).actor) ? Math.PI / 2 : Math.PI / 4, modelPitch: 0, speed: 1, zoom: 1,
      playing: true, loop: entry(entryId).loop ?? true, manual: false, targetDodge: false, humanView: 'world', attackMotion: 'still', revision: 0,
      resource: catalog.mode !== 'showcase' ? { layout: 'flat', shapeIndex: 0, sampleIndex: 0, sampleCount: 1, yaw: 0, pitch: 0, habitat: 'open', assembly: false, composition: null, vegetation: 'all', seed: 429, wind: 'breeze', reference: false, context: entry(entryId).actor !== 'aquatic', grid: false, platforms: true, inspectionLight: true } : null,
      ...(from ? { environment: from.environment, facing: from.facing, humanView: from.humanView, attackMotion: from.attackMotion, targetDodge: from.targetDodge, modelYaw: from.modelYaw, modelPitch: from.modelPitch, speed: from.speed, zoom: from.zoom, playing: from.playing, loop: from.loop, resource: from.resource ? { ...from.resource } : null } : {}),
    };
    cards.push(card);
  };
  add(catalog.subjects[0]!.defaultEntry);
  return {
    catalog, entry,
    get activeDemo() { return activeDemo; },
    cards: cards as readonly ShowcaseCard[],
    get synchronized() { return synchronized; },
    get worldScale() { return worldScale; },
    get full() { return cards.length >= catalog.maxCards; },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    selectActor(actor: string, selected: boolean) {
      const previousCount = cards.length;
      if (selected && !cards.some((c) => entry(c.entryId).actor === actor)) add(catalog.subjects.find((a) => a.id === actor)!.defaultEntry);
      if (!selected) for (let i = cards.length - 1; i >= 0; i--) if (entry(cards[i]!.entryId).actor === actor) cards.splice(i, 1);
      if (cards.length !== previousCount) activeDemo = null;
      synchronized = false;
      notify();
    },
    showDemo(demo: ShowcaseDemo) {
      if (demo.cards.length > catalog.maxCards) throw new Error(`演示 ${demo.id} 有 ${demo.cards.length} 张卡，超过上限 ${catalog.maxCards}`);
      for (const item of demo.cards) entry(item.entryId);
      cards.length = 0;
      for (const item of demo.cards) {
        add(item.entryId);
        const card = cards[cards.length - 1]!;
        if (item.environment) card.environment = item.environment;
        if (item.resource) Object.assign(card.resource!, item.resource);
      }
      activeDemo = demo;
      synchronized = false;
      notify();
    },
    showBatch(actor: string, page: number) {
      activeDemo = null;
      const choices = catalog.entries.filter((item) => item.actor === actor);
      const start = page * catalog.maxCards;
      cards.length = 0;
      for (const item of choices.slice(start, start + catalog.maxCards)) add(item.id);
      synchronized = false;
      notify();
    },
    clear() { activeDemo = null; cards.length = 0; synchronized = false; notify(); },
    close(id: number) { const i = cards.findIndex((c) => c.id === id); if (i >= 0) { cards.splice(i, 1); activeDemo = null; } synchronized = false; notify(); },
    duplicate(card: ShowcaseCard) { if (cards.length >= catalog.maxCards) return; add(card.entryId, card); activeDemo = null; synchronized = false; notify(); },
    setResourceView(targets: readonly ShowcaseCard[], yaw: number, pitch: number) {
      for (const card of targets) Object.assign(card.resource!, { yaw, pitch });
      notify();
    },
    setModelView(card: ShowcaseCard, yaw: number, pitch: number) {
      card.modelYaw = yaw;
      card.modelPitch = pitch;
      notify();
    },
    update(card: ShowcaseCard, change: Partial<Omit<ShowcaseCard, 'id' | 'revision'>>, reset = false) {
      Object.assign(card, change);
      if (reset) card.revision++;
      if (change.manual) {
        for (const other of cards) if (other !== card) other.manual = false;
        card.playing = true;
      }
      synchronized = false;
      notify();
    },
    reset(card?: ShowcaseCard) {
      for (const c of card ? [card] : cards) c.revision++;
      if (card) synchronized = false;
      notify();
    },
    all(change: Partial<Pick<ShowcaseCard, 'playing' | 'speed' | 'environment'>>, reset = false) {
      for (const card of cards) { Object.assign(card, change); if (reset) card.revision++; }
      notify();
    },
    sync(on: boolean) {
      synchronized = on;
      if (on) for (const card of cards) { card.revision++; card.playing = true; card.speed = 1; card.manual = false; card.loop = true; }
      notify();
    },
    scale(on: boolean) { worldScale = on; notify(); },
    changeAction(card: ShowcaseCard, entryId: string) {
      const nextEntry = entry(entryId);
      if (card.resource?.composition && !(nextEntry.actor === 'terrain' && nextEntry.supportsShapes)) {
        card.resource.composition = null;
        card.resource.assembly = false;
      }
      card.entryId = entryId; card.revision++; card.manual = false;
      if (nextEntry.actor === 'human' && nextEntry.action === 'photon_burst') card.humanView = 'world';
      if (nextEntry.loop !== undefined) { card.loop = nextEntry.loop; card.playing = true; }
      synchronized = false;
      notify();
    },
  };
}

export type ShowcaseModel = ReturnType<typeof createShowcaseModel>;
