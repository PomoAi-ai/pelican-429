# FIX -- 骑车释放全部技能

## Status: verifying
## Task: 302
## Related: N/A
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
骑车时需要能释放全部技能。

## Root Cause
pelican-weapons.ts 拦截骑行突进和吞弹；human-combat.ts 要求下车才可起手；pelican-ride.ts 清空近战输入并在上车时取消吞弹。

## Fix Plan
- [x] 移除骑行战斗限制与废弃配置，保持冷却和资源规则。
- [x] 回归覆盖骑行技能实际效果、上车保留吞弹及突进撞墙。

## Verification
- [x] 缺陷复现：新增及更新用例在修复前失败；修复后定向测试 91/91 通过。
- [ ] npm run typecheck
- [ ] npm test
- [ ] npm run build
- [x] diff-guard 检查：本次修改无新增防御性检查、静默兜底或实现镜像测试；git diff --check 通过。

## Verification Blocker
完整检查已各运行一次，但工作区并行改动在 src/render/entity-views.ts 新增了对尚不存在的 ./pelican/pelican-scarf.ts 的引用。该引用不是本任务修改，未改动它。npm run typecheck、npm run build 和 npm test 的导入/渲染相关用例因此失败，状态保留 verifying。

本次定向命令：node --test test/weapons.test.ts test/human-combat.test.ts test/pelican-ride.test.ts，91/91 通过。浏览器视觉验收未执行。

## Final Decisions
- 两种形态骑行时均可释放技能与普攻；上车不再取消吞弹窗口或丢失嘴囊内容。
- 删除已无用途的 ridable 配置和骑行禁用提示；现有技能冷却、资源与变身/传送规则保留。
- 骑行突进撞车时结束突进攻击，避免下一帧覆盖反弹；人形施法期间继续显示自行车。
- 子代理只读检查确认人形技能门禁、撞车突进残留及施法藏车问题，均已修正。
