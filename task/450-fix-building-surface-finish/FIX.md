# FIX -- 建筑格子表面质感

## Status: done
## Task: 450
## Related: N/A
## Baseline Commit: 64ef4a38

## Problem
用户对照实际地台和原画：方石偏黄、表面平，缺少块面变化、柔和光泽和倒角层次。

## Root Cause
共享材质中方石粗糙度0.72，只有近距离高频颗粒，远看近乎纯色；搭建场使用普通TUNING，与住宅的BUILDING_SCENE_TUNING不一致。

## Fix Plan
- [x] 共享建筑材质使用较中性的米灰石色、稳定的低频色差和粗糙度变化、轻微表面涂层反射。
- [x] 增强逐块稳定差异，保留现有尺寸、倒角、拼接及编辑规则。
- [x] 搭建场和材质画廊复用住宅基础光照配置。

## Verification
- [x] npm run typecheck、npm test（1943/1943）、npm run build 均通过；构建仅有包大小提示。
- [x] 浏览器检查住宅正午/星夜与米黄色方石画廊，未发现shader错误；截图见evidence。
- [x] 对照截图、检查本次三处共享修改，git diff --check通过。

## Remaining visual gap
本次修正材料底色、粗糙度、涂层、低频变化和微表面起伏；未加入场景物件的平面反射/SSR，不能声称达到原画家具及窗框倒影效果。浏览器短时显示60 FPS，未做低端设备性能测试。子代理只读审查确认已有环境反射与倒角，未通过提高全场曝光掩盖材质问题。
