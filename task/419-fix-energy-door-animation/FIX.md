# FIX — 能量门开关激光效果

## Status: done
## Task: 419
## Related: 414
## Baseline Commit: d2d72f4

## Problem
住宅能量门开关时没有可辨识的效果，玩家难以分辨开闭状态。

## Root Cause
src/render/ai-city-architecture.ts 的屏障位于侧向YZ平面，扫描线只有0.045格宽且持续0.6秒；正面门柱持续同色发光，遮住多数屏障变化。浏览器已复现按钮/E能切换状态与通行，但画面开闭差异很小。子代理确认两条入口没有重建模型或丢失状态。

## Fix Plan
- [x] 在共享门模型加入白色扫描核心与蓝色光晕，并让扫描带延伸到可见前柱。
- [x] 前柱能量条与屏障同步收放；关闭蓝色能量充满，开启绿色内芯、屏障消失，保留毛玻璃。
- [x] 扫描时长改为1.15秒，保持当前门洞碰撞与交互方式。

## Verification
- [x] 浏览器核对左右门开/关激光、连续反向切换；正常视角夜间和斜视白天扫描均可见。人物在门洞中时明确拒绝关闭，离开门洞后可关闭。
- [x] 截图保存在 assets/concepts/ai-city-residence/energy-door-*.png，包含开/闭稳定状态、激光开关过程与夜间正视。
- [x] npm run typecheck 与 npm run build 通过；npm test 共1902项，1901通过，1项仍是既有 architecture 正则将 art-library.ts 英文文案 window 误判为DOM引用。门的通行与关闭保护相关测试通过；未新增网格/材质细节测试。
- [x] 子代理复核本轮差异与释放行为，无发现；新增光效未超出半格宽、4格高、2格深的几何范围；git diff --check 通过。

## Decisions
- 修复共享 createAiCityDoor，展示场与住宅使用同一效果。
- 复用现有 setOpen/update 状态过渡及资源释放方式，不增加依赖或新的操作设置。
- 本轮仅修复视觉表现，未新增音效，也未改动原有即时切换通行状态的规则。
