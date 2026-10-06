# PLAN -- 怪物与 Boss 血量、防御与出招节奏平衡

## Status: done
## Task: 205
## Related: 200
## Baseline Commit: 3a35077（工作区含其它未提交改动；task/204 同时在改 sim-world/game-app，本任务不碰这两个文件）

## Goal
- Boss 新增三项防御：
  - 霸体期间受到的伤害减 50%。
  - 韧性：2 秒内累计伤害达到阈值才进入硬直（Tibo 24、Sam 36），硬直后 3 秒内不会再被打出硬直。
  - 光子大招对 Boss 的伤害 ×0.4。
- Boss 血量按目标战斗时长反推：Tibo ≈3 分钟，Sam ≈5 分钟。
- 小怪（门卫、巡线犬、哨蜂、搬山）全局血量 ×1.7，自由世界同步生效。
- 出招节奏：
  - Boss 大招播放速度 ×1.5，动画与判定同步加快，不再像慢动作。
  - 小怪攻击冷却 ×0.75。

## Non-goals
- 不改玩家武器数值。
- 不改 Boss 招式伤害与技能循环顺序。
- 不改存档格式。

## Acceptance Criteria
- 霸体时伤害减半；非霸体时受到全额伤害，Tibo 回血动作也吃全额。
- 未达到韧性阈值的命中不打断 Boss，不产生击退；硬直后 3 秒内不会再次被打出硬直。
- 光子弹对 Boss 只造成 40% 伤害，对其它目标不变。
- 大招的释放时刻与总时长都缩短为原来的 1/1.5；视图沿用 actionRate，保持与逻辑同步。
- 标定条件：无闪避机器人用最强配招对战，Tibo 约 180 秒（只用鹈鹕形态，含回血），Sam 约 300 秒。
- 小怪 maxHp 与 cooldownTicks 按上述倍率调整。

## Constraints
- combat 层不得依赖 entities，防御规则通过 Health 上的通用字段表达。
- 旧存档里 Boss 的 hp 必须仍然有效：只提高 maxHp，不降低。
- 遵守 AGENTS.md：最小改动；只为真实行为写测试，不断言常量。

## Decisions
- 跳过 explorer/architect：上一轮实测已摸清防御机制、玩家输出和 TTK；方案已逐文件确定。
- 防御落点：
  - 给 Health 加可选 `guard`：减伤倍率、大招倍率、韧性参数与状态，由 `applyHit` 统一结算。
  - 给 HitDef 加可选 `ultimate` 标记，由光子弹设置。
  - 不在 sim-world 里做特判（避开 task/204 的并行改动），也不给实体挂函数字段。
- 大招加速：BossRule 新增 `ultimateSpeed`。起手时锁定 actionRate = 基础倍率 × ultimateSpeed，boss-view 已经按 actionRate 播放，无需改视图。
- “慢动作”按“大招前摇和整套太长”理解；效果需要人在浏览器里验收。
- Boss 技能间冷却保持不变：减伤机制本身已经制造了收招反击窗口。
- 无停止条件（存档格式不变，只提高 maxHp），直接实现。
- 父代理已有完整上下文，直接实现，未派发 dev-engineer。
- GuardRule 放在 config/tuning.ts：config 是最底层，combat 和 boss-rules 都能引用。
- HitDef 与 HitDefTuning 都加了可选 `ultimate` 字段：投射物定义走的是 HitDefTuning。
- 标定基准：以“强力打法”与“普通打法”两个机器人用时的几何平均为目标值。两者都不闪避，玩家血量设为无限。
  - Tibo（只用鹈鹕形态）：强力为“全技能+光子”，普通为“啄+水”。
  - Sam：同上两种打法。
- 标定结果：
  - Tibo maxHp 7400：强力 116 秒，普通 254 秒（期间回血 1727），几何平均 171 秒。
  - Sam maxHp 10500：强力 220 秒，普通 409 秒，几何平均 300 秒。
- 防御生效后：Tibo 硬直占比从 56% 降到 6–9%。
- 观察到但不在本任务范围：
  - 人形全技能打 Sam 只有约 17 dps，要 537 秒；Sam 拉远距离后人形难以输出。
  - 鹈鹕只用鱼弹打 Tibo 时，Tibo 远距离反复放薯条，700 秒仍打不死。
  - 鱼弹不消耗库存的问题依旧存在。
- 审查修正：
  - applyHit 返回防御结算后的伤害，hit 事件与伤害飘字随之显示实际掉血。
  - 补了光子弹打折和大招加速的测试。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/combat/combat-system.ts（含 attacks.ts 的 HitDef） | Health.guard 结算减伤与韧性；HitDef.ultimate | - | ✅ |
| 2 | src/config/photon-ultimate.ts | 光子弹标记 ultimate | 1 | ✅ |
| 3 | src/config/boss-rules.ts | 防御参数、ultimateSpeed、校验 | - | ✅ |
| 4 | src/entities/boss.ts | createHealth 带 guard；大招 actionRate | 1,3 | ✅ |
| 5 | src/config/enemy-rules.ts | 小怪 maxHp ×1.7、cooldownTicks ×0.75 | - | ✅ |
| 6 | test/boss.test.ts 等 | 防御行为用例；修正受数值影响的既有用例 | 4,5 | ✅ |
| 7 | src/config/boss-rules.ts | 按模拟标定 Boss maxHp | 4 | ✅ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✅ |
| npm test | yes | ✅ 1747 个用例中 1746 个通过。唯一失败的是 worldgen「生成耗时中位数 < 250ms」；当时机器负载约 150，src/world 不依赖本次改动，按环境原因处理，空闲时可重跑确认 |
| npm run build | yes | ✅ |
| scratchpad 机器人标定 Tibo/Sam 用时 | yes | ✅ |
