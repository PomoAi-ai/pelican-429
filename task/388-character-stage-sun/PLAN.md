# PLAN -- 角色展示场太阳位置滑杆

## Status: done
## Task: 388
## Related: N/A
## Baseline Commit: d2d72f4

## Goal
在角色展示场显示太阳，并通过一个滑杆调整太阳位置，人物与地面受光、阴影同步变化。

## Non-goals
不改游戏默认灯光，不新增独立太阳模型、着色器或预览场，不加入自动昼夜和新的持久化设置。

## Acceptance Criteria
- 顶部工具栏有带文字反馈的太阳位置拖动条，鼠标与键盘均可调节。
- 复用 createCelestialSky 和 Stage.setSunDirection，太阳、主光和阴影使用同一方向。
- 地下时隐藏太阳并禁用位置控制，回到地上恢复选定位置。
- 缩放、打开人物面板后太阳仍可见；销毁场景时释放太阳资源。

## Decisions
- 已探索现有 character-stage-app/panel、celestial-sky 与 room-scene-preview 的太阳实现，复用现有可见天空弧线。
- 展示场统一增加控制，适用于男主、女主和其他角色；不修改模型材质。
- 渲染与 UI 行为采用浏览器目视验证，不添加断言 three.js 内部属性或文案的测试。
- 原有工作树有其他修改，本次以 /tmp/showcase-sun-baseline 的两个文件为基线审查；不提交推送。
- explorer 子代理确认太阳位于半径 700 的天体层，需将展示场远裁面提升到 1000；可见天空方向 z 为负，使用现有房间预览的弧线。
- 文件级方案已明确且可逆，无需裁决的设计分歧，直接实现。
- 浏览器实测窄窗口端点裁切光晕，因此按当前水平视野限制移动跨度，给太阳光晕留出边距；同一方向仍驱动主光与天体。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/ui/character-stage-panel.ts | 太阳位置滑杆、文字反馈、地下禁用 | - | yes |
| 2 | src/app/character-stage-app.ts | 共享天体、光向、阴影及生命周期接入 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes：最终通过；首轮其他并行工作临时产生 definition-scene-layout 四参数调用错误，该文件由原工作修复后重跑通过 |
| npm test | yes | yes：1878/1878，301 suites，0 失败、0 跳过 |
| npm run build | yes | yes：通过，窄窗口修复后再次通过 |
| 浏览器太阳移动、光照变化、地下切换和人物操作栏 | yes | yes：鼠标拖动、键盘端点、上方位置、地下隐藏/禁用及回地上恢复、缩放和人物面板、控制台无错误 |

## Delivery
- 太阳控制适用于现有角色展示场的所有角色，位置滑杆位于顶部环境控件旁。
- 复用游戏天体资源、主光和阴影更新；独立审查无阻塞问题。
- 截图：`output/showcase-sun/game-sun-control.png`。
- 未添加自动昼夜和位置持久化；未提交或推送。
