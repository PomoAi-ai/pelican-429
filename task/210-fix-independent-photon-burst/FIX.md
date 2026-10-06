# FIX -- 光子独立展示爆裂动作

## Status: done
## Task: 210
## Related: N/A
## Baseline Commit: 8a8fe8c

## Problem
光子爆裂属于光子自身动作，展示时不应强制创建主角或鹈鹕。游戏中玩家仍负责引导释放。

## Root Cause
`src/app/showcase/stage-actor.ts` 和 `session.ts` 将光子 ultimate 排除在独立光子预览外；`catalog.ts` 又将该动作映射为鹈鹕模拟，导致多出玩家模型。

## Fix Plan
- [x] 所有光子动作进入自身预览，复用正式聚光、虫群、光轮与粒子实现。
- [x] 卡片预览复用同一光子动作实例，支持暂停、倍速、重播和旋转。
- [x] 移除错误的鹈鹕模拟分流并更新说明；保留玩家引导技能的实战入口。

## Verification
- [x] 浏览器：从陪伴切换爆裂无需玩家，光轮展开范围完整；暂停旋转保持进度，重播回到起点；两个光子中一个暂停不影响另一个释放。单光子画面见 `photon-only.png`。玩家引导、移动/飞行施法的既有真实命中用例通过。
- [x] npm run typecheck — 通过。
- [x] npm test — 全量 1748 项，1746 通过，2 项首次失败：Sam 连续换边反击与地图生成耗时。两项与本次展示代码无运行时调用关系，分别隔离复跑后均通过；未修改断言，不能宣称原全量运行全绿。
- [x] npm run build -- --outDir /private/tmp/photon-independent-dist — 通过，保留 chunk 大小提示。
- [x] 子代理审查与 diff-guard — 通过，无需修改项。
- [x] Bug is fixed

## Verification Notes
- 隔离复跑：`node --test --test-name-pattern='Sam 连续换边远离并射击时仍承受Boss攻击' test/boss.test.ts`、`node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts`，串行执行各 1/1 通过。
- 地图生成耗时对并发负载敏感；Boss 首次失败原因未确定，不能归因于本次修复或直接断定为性能波动。
- 本次纯表现与展示装配变更不新增自动渲染测试；未提交或推送。
