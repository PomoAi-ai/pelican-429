# FIX -- 人形落水下沉，鹈鹕形态才能漂浮

## Status: done
## Task: 133
## Related: 128
## Baseline Commit: 仓库无 HEAD；修改前快照 $TMPDIR/grassy-water-backup/

## Problem
主角人形在水中沿用了鹈鹕浮力和划水跳跃，能够悬浮；用户要求只有变成鹈鹕后才能浮起。

## Root Cause
`src/entities/pelican-controller.ts` 的水中竖直受力、跳跃和 swim 状态仅检查 inWater，没有按 form 区分。

## Fix Plan
- [x] test/swim.test.ts — 两个新增用例先失败，修复后通过；覆盖水面/深水、按住/重复跳跃和水中双向变身。
- [x] src/entities/pelican-controller.ts — 保留水接触和阻力，人形无浮力或划水上浮；鹈鹕恢复原漂浮规则。
- [x] src/render/player-view.ts — 人形离地入水时使用已有下落姿态，修正骨骼位移，避免在水中原地跑步。

## Verification
- [x] node --test test/swim.test.ts test/player-transform.test.ts · 29/29
- [x] npm run typecheck · 通过
- [x] npm test · 1590 项，1589 通过；唯一失败为未改动的世界生成耗时检查（428.8ms），该项单独复跑通过
- [x] npm run build · 通过，保留现有 chunk 大小警告
- [x] diff-guard 与子代理只读核对 · 无高置信度缺陷，保留接水检测可阻止水下推进飞行
- [x] Bug is fixed · 浏览器水池手动 F 切换确认人形沉底、鹈鹕回浮；截图在 assets/characters/grassy/model-equipped/evidence/water-form/

## Notes
变更仅涉及控制器、共享人形渲染、同主题游泳回归用例及本记录/截图；没有修改世界生成性能阈值，没有提交推送。
