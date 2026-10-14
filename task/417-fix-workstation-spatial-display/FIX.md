# FIX — 苹果空间界面与三维内容轮播

## Status: done
## Task: 417
## Related: 415, 416
## Baseline Commit: d2d72f4

## Problem
用户要求苹果头显式全息空间界面，保留 UI 与 3D 地球仪等内容切换；上一版误改成固定 Mac 桌面。

## Root Cause
默认显示模式被固定为 desktop，原有 desktop 是整块桌面壁纸加窗口，globe/holographic 仍为蓝色线框科技风，三态未统一到苹果空间风格。

## Fix Plan
- [x] 共享显示模块：空间窗口、三维地球仪、空间控制台三态；灰白玻璃与柔和色彩，窗口和控制条独立悬浮。
- [x] 恢复每10秒自动轮播，三态手动选择；模型、控件和重建默认值一致。轮播从实例首次更新开始计时。
- [x] 保持宽2高2.5深1占位与桌面.99、共享模型、供电和释放行为，更新现行定义。

## Verification
- [x] npm run typecheck：通过，包括最后一次材质调整。
- [x] npm test：已执行，1902项中1901通过、1项既有失败。architecture.test.ts 的 window 正则把 src/config/art-library.ts 的英文美术描述误判为 DOM 引用；本轮未修改该文件或断言。
- [x] npm run build：最终文件构建通过，保留现有包体积提示。
- [x] 浏览器核对三态、手动和自动切换、昼夜与深度层次；真实截图保存在 assets/concepts/ai-city-residence/workstation-spatial-*.png。玻璃以半透明材质表现，没有加入实时背景模糊。
- [x] 子代理复核本轮7个源文件/定义文档差异（基准 /private/tmp/workstation-spatial-start），未发现问题。
- [x] 临时自检：从1234秒创建实例仍完整显示首态10秒；固定模式保持、恢复轮播从首态开始。32秒逐帧检查顶点边界，X[0.0815,1.9185]、Y[1.09,2.4685]、Z[-0.352,0.388]均在占位内；未新增材质细节测试。

## Remaining
- 全量测试有上述既有架构误报，未宣称全通过。
- 浏览器日志保留编辑期间的一次热更新中间态错误，以及先前视口被收起时的 post-fx 零高度报错；最终实景验证期间未新增错误，本轮没有扩大到视口尺寸处理。
- 地球大陆为游戏用简化造型，未进行移动设备性能检查。

## Decisions
- 采用 fix 局部表现修复；沿用上一轮尺寸与调用链探索，不增加依赖，不改存档。
- 参考 Apple 官方 visionOS 的 Windows / Volumes / Ornaments 设计：透明玻璃窗口、立体内容、独立附属工具条。游戏内以已有 three.js 资源实现空间感。
- https://developer.apple.com/design/human-interface-guidelines/windows
- https://developer.apple.com/design/human-interface-guidelines/ornaments
