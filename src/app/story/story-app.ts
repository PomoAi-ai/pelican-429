import { replaceGameLocation } from '../../ui/hud/mobile-game-viewport.ts';
import { loadStorySave, saveStory } from './story-save.ts';
import { STORY_SAVE_KEY } from '../../config/story-save.ts';
import { confirmStoryRestart } from '../../ui/panels/restart-confirm.tsx';
import type { PageContext } from '../shell/page-context.ts';

export async function mountStory(context: PageContext): Promise<void> {
  document.body.classList.add('story-active');
  const url = new URL(location.href);
  if (url.searchParams.get('restart') === '1') {
    // 在旧页面退出存档之后清除，避免 pagehide 把旧进度写回来。
    const confirmed = await confirmStoryRestart();
    if (confirmed) window.localStorage.removeItem(STORY_SAVE_KEY);
    url.searchParams.delete('restart');
    replaceGameLocation(url);
  }
  const save = loadStorySave(window.localStorage);
  const intro = url.searchParams.get('intro');
  if (intro !== null && intro !== 'skip') throw new Error(`未知序章入口：${intro}`);
  if (intro === 'skip') {
    url.searchParams.delete('intro');
    replaceGameLocation(url);
  }
  if (save) {
    const { mountGame } = await import('../game/game-app.ts');
    await mountGame(context, save);
    return;
  }
  const checkpoint = { phase: 'perimeter', countdownTicks: 0 } as const;
  const initialStory = { version: 3, checkpoint, destination: 'fortress' } as const;
  if (intro === 'skip') {
    saveStory(window.localStorage, checkpoint, 'fortress');
    const { mountGame } = await import('../game/game-app.ts');
    await mountGame(context, initialStory, true);
    return;
  }
  let activate!: () => void;
  const activation = new Promise<void>(resolve => { activate = resolve; });
  let running: Promise<void>;
  let preparing: Promise<void> | undefined;
  const ready = (): Promise<void> => preparing ??= new Promise<void>((resolve, reject) => {
    running = import('../game/game-app.ts').then(({ mountGame }) => mountGame(context, initialStory, true, async () => {
      resolve();
      await activation;
    }));
    void running.catch(reject);
  });
  const enter = async (onReady: () => Promise<void>): Promise<void> => {
    await ready();
    await onReady();
    saveStory(window.localStorage, checkpoint, 'fortress');
    activate();
    await running;
  };
  const { mountIntro } = await import('../intro/intro-app.ts');
  await mountIntro(context, { ready, enter });
}
