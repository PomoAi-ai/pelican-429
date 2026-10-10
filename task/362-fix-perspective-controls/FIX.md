# FIX -- 视角独立控制与统一家具站位

## Status: done
## Task: 362
## Related: 360
## Baseline Commit: 975f136

## Problem
视角按钮选中后不能直接鼠标旋转缩放；视角控件混在其他功能中；家具候选改变人物站位。追加太阳位置调整与真实光照。

## Root Cause
- src/app/perspective-controls.ts：跟随状态禁用 OrbitControls，每帧重设镜头。
- src/app/definition-scene-layout.ts、src/app/room-scene-preview.ts：候选单独配置 playerZ、出生高度和左右位置。

## Fix Plan
- [x] 镜头预设后允许鼠标接管，预设按钮可恢复镜头，不改变游玩状态。
- [x] 视角控制独立分组。
- [x] 家具候选统一地面站位与砖块深度中线，取消家具驱动的位置配置。
- [x] 复用太阳位置控制太阳能板和真实主光方向，独立开关与强度调节；旋转镜头仍正确拟合阴影。

## Verification
- [x] npm run typecheck
- [x] npm test：1859 通过，0 失败
- [x] npm run build
- [x] 浏览器验收镜头、家具站位；diff-guard 检查。

## 验收记录
- 斜视预设后，中键实际旋转、滚轮拉近仍可用；点击正常视角恢复正面跟随，玩法未暂停。
- 半格床与满格床候选均显示相同相对站位 X=4.5、脚底 Y=1、深度中线 Z=0，不自动前移或抬升。
- 太阳手动调节停止自动追光，左右位置、150% 强度及太阳光照开关均在浏览器验收，画面明暗与投影随之变化，控制台无错误。
- 子代理完成共享 Stage 光向接口和侧面、背面、上方视角阴影覆盖修复；`node --test test/lighting.test.ts` 43 条通过。
- `git diff --check` 通过，未新增渲染细节或源码字符串测试。最终截图 `/tmp/perspective-camera-light.jpg`。
