# FIX -- 住宅门口补半格与缩短外平台

## Status: done
## Task: 432
## Related: 431
## Baseline Commit: 64ef4a38

## Problem
- 二层左右能量门下外侧各有半格缺口，门外平台多伸出一整格。
- 用户要求先完成格子，保证场景可以正常游玩，暂缓背景图片调整。

## Root Cause
- y=7 的门下支撑使用半宽 L/K 砖，左门外侧 50–50.5、右门外侧 68.5–69 未填满。
- 外平台左侧占 48/49，右侧占 69/70，两边各多一格。

## Fix Plan
- [x] 门下同材质半砖补为整砖，填齐左右各半格。
- [x] 移除外侧 x=48/70 平台，保留 x=49/69 平台；不改地面台阶。
- [x] 验证玩家平台落脚、穿门与房间通行。

## Verification
- [x] `npm run typecheck` 通过。
- [x] `node --test test/residence.test.ts`：22/22 通过；补格前回归用例在半格缺口处落下，补格后左右两侧落脚和穿门均通过。
- [x] `npm test` 已执行：1913/1914 通过，仅世界生成耗时项超过 250ms 阈值（中位数 437.4ms）；住宅测试通过。关闭临时游玩页面后单独运行 `node --test test/worldgen.test.ts`：29/29 通过，未调整性能阈值。
- [x] `npm run build` 通过，仅现有构建体积和插件耗时提示。
- [x] 浏览器使用正常游玩视角，实际从一层跳上二层，走过房间并穿过左右自动能量门；左外平台 x=49.3、右外平台 x=69.4 均在 y=8 稳定站立。无浏览器错误。
- [x] `git diff --check` 通过。

## Outcome
- 左右门下各补半格，门外各保留一格平台；一层台阶不变。
- 修改默认住宅布局，不改写已有自建住宅存档。
- 实景记录：`/private/tmp/residence-door-left-fixed.png`、`/private/tmp/residence-door-right-fixed.png`。
