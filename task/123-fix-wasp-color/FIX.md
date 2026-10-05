# FIX -- 哨蜂青蓝配色

## Status: done
## Task: 123
## Related: 112
## Baseline Commit: 无 HEAD；保留修改前构建脚本和报告于 /private/tmp

## Problem
用户希望无人机增加颜色，横版视角能够更清楚辨认。

## Root Cause
scripts/blender_enemies/build_wasp.py 直接保留原始 Rodin 深黑电池外壳材质，主体缺少明显色块。

## Fix Plan
- [x] 在共享模型构建脚本中为电池中央外壳增加科技青蓝材质，保留黑色绑带、碳纤维机架和橙色电机。切齐色块边界，避免按三角面分配材质造成锯齿。
- [x] 重新导出游戏与展示场共用 GLB、Blender 工程、正侧面和缩略图，更新来源说明。

## Verification
- [x] Blender 后台运行 build_wasp.py 完成；人工检查正侧面与缩略图，色块边界整齐。
- [x] node --input-type=module 从标准输入检查导出 GLB：五个动画、六个关节、高度 0.79999995；全部渲染 primitive 均有蒙皮权重，关节位置及动画时长保持一致。
- [x] npm run typecheck 通过。
- [x] 浏览器展示场加载实际 GLB，侧面青蓝色清晰可见；控制台无 error；证据 assets/characters/enemies/validation/watch-wasp-cyan.jpg。
- [x] 对照临时基线检查脚本修改，diff-guard 无问题。
- 本次仅材质与模型资源改动，未运行 npm test / npm run build，不新增渲染自动测试。
