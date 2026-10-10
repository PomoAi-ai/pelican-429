# FIX -- 紧凑角色控制面板

## Status: done
## Task: 345
## Related: 342
## Baseline Commit: 975f136

## Problem
模型按钮换行、大块拖动区与独立标题列占用太多展示空间；用户要求模型下拉、视角控制同一行。

## Root Cause
`src/ui/character-stage.css` 的两列网格为标题预留整列；`showcase-panel.ts` 使用展开的动作按钮列表；`model-camera-controls.ts` 在共享场景创建多行拖动按钮。

## Fix Plan
- [x] 共享场景模型与动作使用同一原生下拉，保持分组和切换逻辑。
- [x] 模型下拉、视角预设、转向滑条和复位放在同一横行。
- [x] 移除标题侧栏、箭头和大拖动区，保留原历史卡片交互。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1842 项通过。
- [x] npm run build：通过，现有大于 500 kB chunk 警告仍在。
- [x] 浏览器检查：549 px 宽窗口中模型/视角/滑条/复位同一行；切换走路、待机，滑条正面 0°、自由 136°、实际拖动 -89°、复位 45°，切换后角度保持。
- [x] git diff --check 通过；独立子代理审查未发现状态同步、释放或布局缺陷。

## Limits
本次只改展示场控件，不涉及脸部模型；不新增 UI 自动测试或运行时依赖。
未使用实体触屏验收。浏览器截图：`d1-compact-rotation-slider.png`。开发页面因工作区并行改动多次自动刷新，面板重新打开后交互验证通过。
