# FIX -- 统一运行时遗留问题

## Status: done
## Task: 561
## Related: 560
## Baseline Commit: cd528040

## Problem
1. 原野网址带 `?debug`，进游戏后被网址改写去掉，刷新即失效。
2. 交通中心发射后跳到机房，网址丢掉 `renderer=webgpu`。
3. 舱门提示弹出时角色待机动画停住。
4. 交通中心界面文字不随语言切换即时更新。
5. 资源展示 paving 卡片为空；城区首屏资源选择器缩略图空白。

用户决定（不在本任务内）：未引用素材不处理；只被测试引用的导出不删；原野/机房前景内容不处理；主世界连成一张地图等本任务完成后再处理。

## Root Cause
- src/app/game/free-world-navigation.ts:19 — `freeWorldSearch` 把页面级开关 `debug` 和关卡定位参数一起删除；首帧原地改写网址（game-app.ts:584）也走它。
- src/app/game/free-world-navigation.ts:43 — `keepWorldParams` 只带种子、规模、GM，渲染器开关没带过去。
- src/app/game/frame-loop.ts:264-272 — 功能暂停（只有交通中心舱门提示用）与设置面板暂停一样把实体动画 dt 置零。
- src/app/transit/transit-controls.ts:7 与 transit-station.ts:213 — 静态文字只在创建时翻译，阶段文字只在阶段变化时写入，没有订阅语言切换。
- src/render/tile/tile-view.ts:96、piece-view.ts:131 — paving 没有瓦片画法（画面归交通中心模型），资源卡片只画瓦片。
- src/ui/panels/resource-picker.tsx:108 — 缩略图并没有坏：每张约 10–20ms，靠空闲回调逐张画；游戏帧循环里几乎没有空闲时段，回调都等满 200ms 超时才触发，首屏要五六秒才画完（自由搭建场没有游戏循环，所以正常）。

## Fix Plan
- [x] free-world-navigation.ts — `freeWorldSearch` 保留 `debug`；`keepWorldParams` 带上 `renderer`、`debug`
- [x] frame-loop.ts — 功能暂停只停模拟，实体动画照常（只有交通中心舱门提示用功能暂停；城区没有会走动的 NPC）
- [x] transit-station.ts — 打开舱门提示时玩家水平速度归零（模拟停着而动画照常，免得原地迈步）；订阅语言切换重写阶段、提示与发射按钮文字
- [x] transit-controls.ts — 固定文字改为 data-text / data-label，可按当前语言重写
- [x] resource-catalog.ts — 资源展示的地形瓦片不列 paving（只有碰撞，画面是百余格宽的交通中心前庭，单格卡片展示不出来），删去对应名称与英文条目
- [x] resource-picker.tsx — 空闲回调超时 200ms → 50ms
- [x] test/free-world.test.ts — 网址参数保留用例（先失败后通过）

## Verification
- [x] npm run typecheck
- [x] node --test test/free-world.test.ts（13/13）
- [x] npm test 2026/2026（首轮 light-field-material 一例失败：分帧光照按墙钟 2ms 预算，满载时一帧没算到挖开的条带；单跑 3/3 通过，重跑全量通过，与本次改动无关）；npm run build 通过
- [x] 浏览器（无界面 Chrome）：原野 ?debug 首帧改写后保留；flight=abyss&renderer=webgpu 跳到机房网址保留 renderer、debug；舱门提示时 vx=0、位置不变、骨骼仍在动；切英文后对话框、阶段、提示、目的地、无障碍名称、发射按钮即时更新；城区建造面板首屏缩略图约 3 秒内画完（原约 6 秒）；资源展示、自由搭建场、城区、交通中心、原野 0 控制台错误
