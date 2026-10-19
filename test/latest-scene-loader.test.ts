import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLatestSceneLoader } from '../src/app/workspace/latest-scene-loader.ts';

// 去掉取消检查或并行开始旧/新装配，会显示过期画面或在编译结束前释放材质。
for (const fails of [false, true]) test(`连续切换仅装配最后选择，旧加载${fails ? '失败' : '完成'}不覆盖新场景`, async () => {
  let finish!: () => void;
  const stalled = new Promise<void>(resolve => { finish = resolve; });
  const events: string[] = [];
  let ready!: () => void;
  const complete = new Promise<void>(resolve => { ready = resolve; });
  const loader = createLatestSceneLoader<string>({
    start: value => events.push(`start:${value}`),
    async mount({ value, signal, onDispose }) {
      events.push(`mount:${value}`);
      onDispose(() => events.push(`dispose:${value}`));
      if (value === 'a') { await stalled; if (fails) throw new Error('old download'); }
      if (!signal.aborted) events.push(`render:${value}`);
    },
    ready(value) { events.push(`ready:${value}`); ready(); },
    error() { events.push('error'); },
  });
  loader.select('a'); loader.select('b'); loader.select('c');
  assert.deepEqual(events, ['start:a', 'mount:a', 'start:b', 'start:c']);
  finish(); await complete;
  assert.deepEqual(events.slice(4), ['dispose:a', 'mount:c', 'render:c', 'ready:c']);
  loader.dispose(); loader.dispose();
  assert.equal(events.filter(event => event === 'dispose:c').length, 1);
});

test('当前加载失败也取消同批资源，清理只执行一次', async () => {
  const events: string[] = [];
  let failed!: () => void;
  const failure = new Promise<void>(resolve => { failed = resolve; });
  let signal!: AbortSignal;
  const loader = createLatestSceneLoader<string>({
    start() {},
    async mount(request) { signal = request.signal; request.onDispose(() => events.push('dispose')); throw new Error('asset missing'); },
    ready() { events.push('ready'); },
    error(error) { events.push((error as Error).message); failed(); },
  });
  loader.select('broken');
  await failure;
  assert.equal(signal.aborted, true);
  assert.deepEqual(events, ['asset missing', 'dispose']);
  loader.dispose();
  assert.deepEqual(events, ['asset missing', 'dispose']);
});
