import { hashU32, mulberry32 } from '../core/rng.ts';
import type { NpcKind } from './npc.ts';

export interface NpcConversation {
  readonly topic: readonly [string, string];
  readonly lines: readonly (readonly [string, string])[];
}

export const SAM_CATCHPHRASE = ['我又稳稳的接住了你!', 'I caught you safely again!'] as const;

/** 公开言论的角色化改编与营地原创闲谈；来源见 docs/npc-dialogue-sources.md，不是逐字引语。 */
export const NPC_DIALOGUES: Readonly<Record<NpcKind, readonly NpcConversation[]>> = {
  sam: [
    { topic: ['稳稳接住', 'A steady catch'], lines: [SAM_CATCHPHRASE] },
    { topic: ['先迈一步', 'A first step'], lines: [
      ['有时想得太久，路反而变长了。先做一点，哪怕很小。', 'Sometimes thinking too long makes the road feel longer. Start with something small.'],
      ['不必先说服全世界。做出点东西，明天再把它变好。', 'You need not convince the whole world first. Make something, then improve it tomorrow.'],
    ] },
    { topic: ['未知的路', 'Uncharted paths'], lines: [
      ['沿着别人走过的路，至少知道终点在哪里。开一条新路，可没这份把握。', 'On a familiar path, you know there is an end. A new path offers no such promise.'],
      ['所以我佩服那些明知可能失败，仍认真试一试的人。', 'I admire people who make a serious attempt even when it might fail.'],
    ] },
    { topic: ['工具与魔法', 'Tools and magic'], lines: [
      ['好工具最有趣的地方，是你拿它做出了设计者没想到的东西。', 'The best part of a good tool is what you make that its designer never imagined.'],
      ['机房可以堆满机器。真正有意思的点子，还是从人这里来。', 'You can fill a server room with machines. The interesting ideas still come from people.'],
    ] },
    { topic: ['算力之外', 'Beyond compute'], lines: [
      ['我总想让更多人用上更好的工具。光把机器锁在机房里，可不算成功。', 'I want better tools in more hands. Locking machines in a server room is hardly success.'],
      ['等工具足够好，你会忘记它有多厉害，只关心自己想做什么。', 'When a tool is good enough, you stop admiring it and start thinking about what to make.'],
    ] },
    { topic: ['湖边的时间', 'Lakeside time'], lines: [
      ['这片湖没有进度条。坐着看一会儿，倒也不错。', 'This lake has no progress bar. It is rather nice to just watch it.'],
      ['我试着预测过鱼什么时候上钩。鱼显然没读我的预测。', 'I tried predicting when the fish would bite. The fish clearly did not read my forecast.'],
    ] },
    { topic: ['营地灯火', 'Camp lights'], lines: [
      ['看见那盏灯，就知道今天有个地方能歇脚。这样的确定感很难得。', 'That light means there is somewhere to rest tonight. That kind of certainty is rare.'],
      ['今晚先不谈下一件大事。听听风吧。', 'Let us leave the next big thing for tomorrow. Listen to the wind for a while.'],
    ] },
  ],
  tibo: [
    { topic: ['少一个按钮', 'One less button'], lines: [
      ['我最近更喜欢拿掉一个没用的按钮。桌面清爽了，人也轻松。', 'Lately I prefer removing an unused button. A clearer desk makes for a clearer head.'],
      ['能让事情简单一点，已经算是很好的进步。', 'Making something simpler is a perfectly good kind of progress.'],
    ] },
    { topic: ['重置一下', 'A little reset'], lines: [
      ['大家一见我就想到重置。今天我只想重置一下自己的作息。', 'People see me and think of resets. Today I just want to reset my sleep schedule.'],
      ['先坐一会儿，再喝口水。这种重置不用等公告。', 'Sit down, have some water. That sort of reset needs no announcement.'],
    ] },
    { topic: ['清空收件箱', 'Inbox zero'], lines: [
      ['清空收件箱的感觉，大概像终于把营地里散落的箱子收好了。', 'An empty inbox feels like finally putting away every scattered crate in camp.'],
      ['然后你一回头，又来了一封。好吧，至少刚才确实空过。', 'Then another message arrives. Well, it really was empty for a moment.'],
    ] },
    { topic: ['把意见听完', 'Hearing people out'], lines: [
      ['别人说用着别扭，我会先听他说完。自己用惯了，反而容易看不见问题。', 'When someone says it feels awkward, I listen. Familiarity can hide a problem.'],
      ['有时候最有用的改进，就藏在一句“这个能不能简单点”里。', 'Sometimes the best improvement starts with: could this be simpler?'],
    ] },
    { topic: ['深夜灵感', 'Midnight ideas'], lines: [
      ['半夜写东西，总觉得自己特别聪明。第二天重看，就没那么肯定了。', 'At midnight every idea seems brilliant. The next morning, I am less certain.'],
      ['所以今晚我决定早点休息，把惊喜留给明天。', 'Tonight I am turning in early. Tomorrow can have the surprises.'],
    ] },
    { topic: ['每天一点', 'A little each day'], lines: [
      ['我喜欢看得见的小进展。今天顺手一点，明天再快一点。', 'I like small changes you can feel. Smoother today, a little faster tomorrow.'],
      ['回头看才发现，原来已经走了这么远。', 'Then you look back and realize how far you have come.'],
    ] },
  ],
};

/** 每位居民独立洗牌，一轮聊完再洗牌，轮次交界也不立即重复。 */
export function createNpcDialoguePicker(seed: number): (kind: NpcKind) => NpcConversation {
  const state = {
    sam: { rng: mulberry32(hashU32(seed, 0, 429)), bag: [] as number[], last: -1 },
    tibo: { rng: mulberry32(hashU32(seed, 1, 429)), bag: [] as number[], last: -1 },
  };
  return kind => {
    const entry = state[kind];
    const pool = NPC_DIALOGUES[kind];
    if (entry.bag.length === 0) {
      entry.bag = pool.map((_, i) => i);
      for (let i = entry.bag.length - 1; i > 0; i--) {
        const j = Math.floor(entry.rng() * (i + 1));
        [entry.bag[i], entry.bag[j]] = [entry.bag[j]!, entry.bag[i]!];
      }
      const end = entry.bag.length - 1;
      if (entry.bag[end] === entry.last) [entry.bag[0], entry.bag[end]] = [entry.bag[end]!, entry.bag[0]!];
    }
    entry.last = entry.bag.pop()!;
    return pool[entry.last]!;
  };
}
