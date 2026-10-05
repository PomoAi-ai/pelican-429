# FIX -- 哨蜂白色外壳

## Status: done
## Task: 127
## Related: 123
## Baseline Commit: 无 HEAD

## Problem
用户希望无人机使用白色。

## Root Cause
scripts/blender_enemies/build_wasp.py 的电池中央外壳材质为青蓝色。

## Fix Plan
- [x] 将外壳改为冷白色，更新材质命名和来源说明。
- [x] 导出共享模型、Blender 工程及正侧面预览。

## Verification
- [x] Blender 后台运行 build_wasp.py 成功，人工检查白色侧面与缩略图。
- [x] node --input-type=module 检查实际 GLB：白色材质、五个动画和六个关节通过。首次检查发生在导出完成前，导出完成后重新检查通过。
- [x] 本次材质常量及命名变更经 diff-guard 检查，无新增防御逻辑或测试。
- 仅改模型材质，不涉及 TypeScript 或战斗逻辑，不新增自动渲染测试；未运行 typecheck、全量测试和 Vite 构建。
