# PLAN -- 调试全地图点击传送

## Status: blocked
## Task: 039
## Related: 037-fix-debug-tile-grid
## Baseline Commit: 无 HEAD；接线文件快照 $TMPDIR/pelican-teleport-before

## Goal
调试面板开启地图点击传送，使用全地图直接选择真实世界位置。

## Acceptance Criteria
- 默认关闭，复用设置开关和保存机制。
- 开启后全地图单击传送；拖动平移、缩放继续可用，拖动不误传送。
- 不重建世界，保留角色生命与装备，重置速度/骑乘/插值等运动状态。
- 固体目标附近寻找可容纳角色的位置，无安全空间明确提示并保持原位置。
- 同步游戏镜头；地图关闭后可以继续游戏。

## Decisions
- 主代理沿既有设置流程完成装配，地图交互与传送状态分别由子代理探索并实现。
- 已有地图投影与设置架构可直接复用，无需新UI框架；无用户待裁决分歧，直接实现。

## Implementation Map
| Area | Intent | Done |
|---|---|---|
| ui/minimap | 点击/拖动区分、坐标换算、开关提示 | yes |
| sim/player-teleport | 安全位置与状态重置 | yes |
| app/config/settings | 调试开关及镜头接线 | yes |

## Validation
- [x] npm run typecheck 通过；npm test 1490/1490 通过；npm run build 通过（有产物体积提示）。
- [ ] 浏览器交互验收：浏览器工具拒绝连接当前本地页面（URL 安全策略），未绕过；实际点击效果待人工验收。
- [x] 独立 core-review / diff-guard 审查通过，无需修复。

## Implementation Notes
- 地图交互与传送逻辑子代理分别探索并给出局部设计后实现；主代理沿现有设置架构装配，无需再次独立设计同一方案。
- 传送碰撞时在周围 8 格按距离查找半格落点；支持真实瓦片形状、半砖与洞穴。成功同步镜头并清空输入，失败不修改角色状态。
- 地图缩放/拖动使用已有坐标转换。开关保存在既有设置中，默认关闭。

## Delivery
- 代码实现与本地检查完成。Status 保留 blocked 仅因浏览器安全策略阻止实际交互验收，不代表代码存在已知失败。
- 子代理执行 node --test test/minimap.test.ts（32 项通过）和 node --test test/player-teleport.test.ts（5 项通过）。
- 未提交或推送。
