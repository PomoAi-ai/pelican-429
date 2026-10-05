# FIX -- 入口雨棚改成可站立平台

## Status: done
## Task: 099
## Related: 096, 097-fortress-coolant-chasm
## Baseline Commit: 无 HEAD；改前快照 $TMPDIR/pelican-entry-platform-before

## Problem
入口黄边雨棚看起来像平台，实际没有碰撞，角色无法落脚。

## Root Cause
src/render/facility-fortress.ts 单独绘制厚门楣及黄边；没有列入 FACILITY_PLATFORMS，因此没有对应单向碰撞。

## Fix Plan
- [x] src/config/facility-scenes.ts：增加入口 y30 平台 x52～68，共用模型、碰撞和小地图数据；外墙仍为实体。
- [x] src/render/facility-fortress.ts：删除旧入口门楣与左侧突出黄边，复用平台生成器，深度同普通方块。
- [x] test/facility-level.test.ts：落地、上穿和 S+空格下穿行为测试。

## Verification
- [x] 缺陷用例修改前失败（落至 y20）、修改后通过（落至 y30）
- [x] npm run typecheck
- [x] npm test -- --test-concurrency=4：1528 项测试全部通过
- [x] npm run build；已有 bundle 大小提示，构建成功
- [x] 浏览器查看真实平台与外墙衔接；控制台无 error/warn，截图 output/chapters/fortress-entry-platform.jpg
- [x] 子代理 diff 审查：Approved，无阻断问题

首次全量检查 1527/1528 通过，未触及的假人模型边界测试失败；该测试源文件在其他工作中随后更新，单独复查通过，重跑全量检查 1528/1528 通过。未修改该测试或假人模型。
