# PLAN -- 统一世界历法、季节日照与月相

## Status: done
## Task: 481
## Related: 456
## Baseline Commit: c292d188

## Goal
按 `public/concepts/world-time.md` 和 `public/concepts/economy.md` 第 2 节实现全游戏唯一的时间标准：
- 只用一套历法（1 天 24 分钟，1 月 8 天，1 季 24 天，1 年 96 天），由逻辑层持有的「第几天 + 当天游戏秒」直接算出季节、月份、月相、日出日落、太阳高度和月光强度。
- 家园结算、太阳能、睡觉、夜晚判定改用按日期算出的日出日落。
- 住宅、自由搭建场、设施、场景演示和家园使用同一时间与同一日月计算，删除各自的时钟。
- 太阳：仰角随季节封顶，晨昏过渡拉长，天上画的太阳与光照方向同步。
- 月亮：盈亏贴图，月光强度随月相变化。
- 初始时间：玩家开始新游戏时取真实的日期和时刻初始化，之后按游戏时间自行运转；演示场景每次加载都取真实时间，刷新即变化；演示场景的面板可以控制时刻、日期和调试加速。

## Non-goals
- 季节对玩法的其他影响（电力、野外食物、抗性）、植被换季、积雪、节日。
- 真正的离线收益。
- 旧存档迁移。

## Acceptance Criteria
- 仓库内只剩一个时间推进与日月计算来源；`createWorldClock` 自带计时和 `HOMESTEAD.clock` 写死的昼夜时刻被移除。
- 历法函数对给定 `{ day, second }` 返回与文档表格一致的季节、月相、日出日落（季中值、按天连续过渡、取整到游戏分钟）。
- 家园天亮结算、太阳能、睡觉到天亮在不同季节使用当天日出日落。
- 新游戏的初始日期与时刻来自真实时间；读档沿用存档时间。
- 演示场景每次加载取真实时间；面板能拖时刻、选日期、调试加速。
- 月亮显示对应月相，新月夜月光约为满月的 15%。

## Constraints
- 逻辑层不使用 `Date`；读取真实时间只在 app 层，换算后传入逻辑层。
- 分层规则由 `test/architecture.test.ts` 强制。
- 渲染效果由人在浏览器验收。
- 改接口同步改所有调用方，不留兼容分支。

## Decisions
- 探索结论（时间来源）：
  - 渲染层 `core/world-clock`：浮点小时，默认一天 720 秒。场景工作区共用一只，由当前场景按帧推进；独立住宅自建一只。
  - 家园 `economy.{day, second}`：整数并存档，`sim-world.ts:689` 每 tick 推进 1 游戏秒（60 Hz，正好一天 24 分钟）。昼夜固定在 6、18 点（`config/homestead.ts` 的 `clock` 和 `isDaytime`），开局固定 15:00。
  - 家园画面只按 `daylight()` 调曝光（`homestead-app.ts:46`），太阳能板角度另算（`homestead-view.ts:227`），没有日月和天空光照。
  - 主线和普通自由世界没有昼夜时钟。
- 探索结论（昼夜判定的使用方）：
  - `isDaytime` 有 6 处调用方：`homestead-economy:66`、`homestead:468,471,480`、`sim-world:305`、`homestead-hud:291`。
  - 结算和换日都靠整数秒精确相等，所以日出日落必须是整数秒，并且每次切段都要按当天的 `day` 重新计算。
- 探索结论（月光）：`ai-city-lighting.ts:134` 的 `moonPower = .3*night` 是月光接入点；夜间半球光、轮廓光、环境光有与月亮无关的固定下限。月亮贴图在 `celestial-sky.ts:10-38` 生成一次。
- 探索结论（家园画面）：
  - 自由世界和住宅用同一种 `Stage`。但不能直接启用 `createAiCityLighting`，冲突有：
    - 相机 far 200，天体半径 700，天体会被裁掉；
    - 背景是不透明的手绘图（天空画在图里），且 renderOrder 从 -20 开始；
    - 会新增雾（触发重编译）；
    - 白天基调和自由世界不一致（曝光 1.25 对 1.08，主光 3.4 对 2.8 等）。
  - 降水层（`precip-sky.ts:160-170,265-279`）在创建时记下基础灯光值，之后每帧按"基础值 × 天气 × 区域"整组重写；`precip-wiring.ts:56` 每帧调用 `background.setWeather`。昼夜驱动必须作为降水层的基础值来源，保证只有一个写入者。
  - 瓦片光照图没有全局日光项，只会压暗：户外夜晚只能靠场景灯光和曝光变暗；压暗场景灯光时，洞内也会跟着变暗。体积光束强度固定。
  - 设施场景（`facility-app`）已经是"天气只产出 look、由 ai-city 统一写灯光"的样板。
- 历法模块放在 `src/core`：core 只能依赖 core，sim、render、app 都能引用它；`Date` 只出现在 app 层。
- 用户拍板：
  - 真实日期按北半球季节换算：3–5 月春，6–8 月夏，9–11 月秋，12–2 月冬。真实日期在该季中的位置按比例换算成第 1～24 天；年份取真实年份；时刻取真实的时和分。月相跟随游戏历法，不对应真实月亮。
  - 家园这次连画面一起接：天空、太阳、月亮、月相和月光都接到家园所用的自由世界画面。
  - 旧存档不迁移：家园存档版本升级，旧档按现有规则报错，用 `&reset=1` 重开。
- 展示页（景深、角色舞台、港口透视等）里固定的"白天/夜晚"二值和手动太阳属于检查灯光，按 AGENTS.md 由展示场自管，本任务不收编。
- 设计（方案 A，历法与逻辑）：
  - 新建 `src/core/calendar.ts`，删除 `world-clock.ts`。时间用 `GameTime { day, second }`，两个都是整数，day 按绝对天数计（`(年-1)*96 + 季*24 + 季内第几天`）。
  - 每季第 13 天取表中值，相邻两季之间按天线性插值，跨年也连续；日出日落取整到分钟（`Math.round(分钟)*60`）。
  - 月相 = (日出前取前一天，否则当天 − 1) mod 8。
  - `sampleWorldTime(GameTime)` 沿用旧名，多返回 moonPhase、moonIllumination、moonLight。
  - 太阳的光照方向和天上画的太阳都按 θ（白天 0→π，夜晚 π→2π）计算；仰角上限通过 `lift = .7·tan(仰角上限)` 实现，55° 时与现行一致；晨昏过渡按"离日出日落的小时数"计算。
  - 真实日期换算是纯函数 `timeFromReal(年, 月, 日, 时, 分)`，不使用 Date。
  - 已用 node 核对数值：春季第 1 天 6:00–18:30；季中四天与文档表格一致；2026-10-17 14:30 换算为秋季第 13 天（满月）；12→3 月、跨年逐日连续。
- 1、2 月的年份：游戏年从春季开始，1、2 月属于上一年开始的冬季，所以年份显示为上一年。这样冬季连续，元旦不会跳 96 天。这是我的判断，文档同步写明。
- 展示场时间由 `ui/world-controls.ts` 持有（ui 不能 import app），只有工作区的 tick 每帧调用 `advance(dt)`，各场景只读 `context.world.time`。独立住宅自己绑定控件并推进时间。
- 月光：`moonPower = .3·night·moonLight`；夜间半球光、轮廓光、环境光的下限乘以 `.6+.4·moonLight`。月亮贴图单独用一张画布，用 destination-out 挖出暗面，只在月相变化时重画。
- 设计（方案 B，家园画面）：
  - 新模块 `render/free-world-daylight.ts`，只在家园模式下创建。它每帧写入降水层的基础值（`PrecipSkyTargets.base`），保证降水层仍是唯一写灯光的地方；正午取值与当前自由世界一致。
  - 手绘背景按主题乘昼夜色，地下主题（cathedral、abyss）不受影响。
  - 露天系数 s 由主题和"玩家离地表多深"决定，用来避免洞穴随昼夜变暗。全屏共用一个 s，洞口会有约 8 格的过渡，代码中用 ponytail 注释标明这个上限。
  - celestial-sky 增加 `{radius 180, horizon .1, scale .6}` 选项，解决天体超出远裁剪面的问题，并把日月星压到画面上半部。
  - 光束、云、风线的强度随日照变化。
  - 去掉家园的夜间曝光调制，变暗只靠灯光。
- 方案 A 第 12 行（家园曝光）由方案 B 的 B12 取代；A13 与 B13 是同一件事，合并处理。
- 无需停下等确认：用户已决定不迁移旧存档；季节换算和画面范围用户都已拍板；剩下的年份显示问题如上自行决定。
- 验收后的修复：
  - 原来月相恰好在日出那一秒切换，而 night 要到日出后 0.5 小时才归零，玩家会看到月亮当场变形（审查意见）。改为夜色归零时再切换，即日出后 0.5 小时，用常量 `NIGHT_END_HOURS` 把两处绑在一起；文档同步修改。
  - 月亮暗面原来挖掉 82%，新月像一轮灰月；改为挖掉 94%。
- 遗留问题：
  - 全屏只用一个露天系数，洞口有约 8 格过渡。
  - `base.sky` 和背景 paint 没有按玩家所在深度区分，深洞里下雨的夜晚，雾幕和粒子仍会跟着变暗。
  - 光束只按日照淡出，洞里的光束到了夜里也会熄灭。
  - 水面反射色白天和夜里一样。
  - 鹈鹕微光看的是光照图，户外夜里不会出现。
  - 主线和普通自由世界仍然没有昼夜。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/core/calendar.ts | 新建历法、日出日落、月相、真实日期换算、sampleWorldTime | - | ✅ |
| 2 | test/calendar.test.ts | 历法行为测试；删除 test/world-clock.test.ts | 1 | ✅ |
| 3 | src/config/homestead.ts | 删除 clock、isDaytime 及其校验 | - | ✅ |
| 4 | src/sim/homestead-economy.ts | 按当天日出日落切段和结算；createHomestead(start)；新增 startDay | 1,3 | ✅ |
| 5 | src/sim/homestead.ts | initializeHomestead(world,start,saved?)；改用 calendar；快照加 startDay | 4 | ✅ |
| 6 | src/sim/sim-world.ts | homesteadNight 改用 isDaytime(economy) | 1,3 | ✅ |
| 7 | src/app/homestead-save.ts | 存档版本升到 3，校验 startDay | 5 | ✅ |
| 8 | src/app/game-app.ts | 新游戏用真实时间初始化；创建 free-world-daylight 并接线 | 5,B8,B9 | ✅ |
| 9 | src/ui/homestead-hud.ts | 显示第 N 天、季节日期、月相和昼夜 | 1,4 | ✅ |
| 10 | src/render/homestead-view.ts | 太阳能板角度改用 sampleWorldTime(economy).sunDirection | 1 | ✅ |
| 11 | test/homestead-economy.test.ts、test/homestead.test.ts | 传入固定起始时间；夜晚、睡觉、结算用例改按日出日落 | 4,5 | ✅ |
| 12 | src/ui/world-controls.ts | 重写面板：持有观察时间，提供 advance，含时刻、日期、倍率、昼夜段和月相 | 1 | ✅ |
| 13 | src/app/scene-mount.ts | SceneWorld.clock 改为 time | 1 | ✅ |
| 14 | src/app/scene-workspace.ts | world.time 取自控件，在 tick 里推进 | 12,13 | ✅ |
| 15 | src/app/residence-app.ts | 读 context 的时间；独立页面绑定控件并推进 | 12,13 | ✅ |
| 16 | src/app/scene-demo-stage.ts、building-field-stage.ts、facility-app.ts | 只读时间并采样 | 13 | ✅ |
| 17 | src/render/ai-city-lighting.ts | 月光乘 moonLight；夜间下限随月光缩放；主光方向改用 keyLightDirection | 1,18 | ✅ |
| 18 | src/render/celestial-sky.ts | 月相贴图；radius、horizon、scale 选项；导出 keyLightDirection | 1 | ✅ |
| 19 | src/render/residence-weather.ts | 改类型 import | 1 | ✅ |
| 20 | src/core/world-clock.ts | 删除 | 12-19 | ✅ |
| B1 | src/config/free-world-backgrounds.ts | 每个主题加 sky 字段 | - | ✅ |
| B2 | src/render/free-world-background.ts | 计算 environment.sky（含深度门控）；新增 paint 颜色，setWeather 时乘上 | B1 | ✅ |
| B3 | src/render/precip-sky.ts | 新增 PrecipSkyBase 和 targets.base（每帧读）；dispose 用创建时快照恢复；雾幕和粒子乘 base.sky | - | ✅ |
| B6 | src/render/light-shafts.ts | setStrength(k) | - | ✅ |
| B7 | src/render/weather-fx.ts | setSkyLight(color) | - | ✅ |
| B8 | src/render/free-world-daylight.ts | 新建家园昼夜驱动 | 1,18,B2,B3,B6,B7 | ✅ |
| B9 | src/app/precip-wiring.ts、intro-fortress.ts、facility-environment.ts | 传 daylight 和 base，分两段更新 | B3,B8 | ✅ |
| B12 | src/app/homestead-app.ts | 删除夜间曝光调制 | B8 | ✅ |
| 21 | public/concepts/world-time.md | 补充：季中为第 13 天；1、2 月属于上一年的冬季 | - | ✅ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✅ |
| npm test | yes | ✅ 1966/1966 |
| npm run build | yes | ✅ |
| 浏览器验收：家园正午与改前一致、晨昏、满月和新月夜、洞穴不受影响、日月位置、展示场面板 | yes（人工） | ✅ 已核对展示场面板、8 个月相形状、家园夜晚与日出结算（截图在 evidence/）；家园正午、洞穴、下雨夜待人工确认 |
