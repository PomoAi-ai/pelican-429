# PLAN — 全部瓦片形状平铺与场景三维视角

## Status: done
## Task: 020
## Related: 017, 019
## Baseline Commit: 无 HEAD；快照 $TMPDIR/pelican-020-before/

## Goal
四种瓦片形状默认同时展示，每种包含地面与悬空、四个自然变化；场景功能展示七个区域均支持真实三维镜头切换。

## Acceptance Criteria
- 八张实时卡片，四种形状各两张；每张卡的四个瓦片直接调用游戏场景与生成器。
- 顶部保留原设置，默认全部形状，可以恢复全部形状而不清空其它选择。
- 每个资源预览可点击轮换角度、拖动旋转，顶部可统一视角并重置。
- 调整镜头保持当前实例和动画，不重新生成资源。
- 延续 019：草皮和泥土自身变化在真实尺寸下可辨认，游戏与预览共用。

## Non-goals
不修改游戏物理、角色操控或 vendor 模型；不提交与推送。

## Decisions
- 采用两列四行，每张卡内放四个不相连的真实单格，满足完整展示和最多八个预览的约束。
- 017 已完成场景采样链路探索，直接复用；委派独立架构复核和镜头实现，主代理实现布局。
- 这些是仓库内可回退的表现与展示改动，无需额外审批。
- 独立审查发现手动增删卡片后按索引恢复全部形状会错配，修正为增删后转入自由资源对照，保留剩余实例与角度；复审 Approved。
- 镜头更新使用模型专用方法只修改角度并通知，不递增 revision，不取消同步或暂停。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| config/resource-showcase、scene-demos | 单卡四样本及八卡形状布局 | 是 |
| app/showcase/terrain-layout、resource-scenario；render/resource-preview | 共用摆放、取景、网格与环境位置 | 是 |
| config/showcase-camera；ui/resource-camera-controls；app/showcase/session | 三维镜头交互与实际相机 | 是 |
| ui/showcase-model、lab-controls、resource-controls、showcase-panel、showcase.css | 默认状态、控件集成、宽卡布局 | 是 |
| render/tile-textures | 019 共享纹理自然变化 | 是 |

## Validation
| Command/check | Required | Done |
|---|---|---|
| npm run typecheck | yes | 通过 |
| npm test | yes | 1471 项、303 组通过，0 失败 |
| npm run build | yes | 通过；主包大于 500 kB 的提示保留 |
| 浏览器八卡/全部形状/视角/拖拽/现有设置 | yes | 七个演示角度控件、单卡点击、拖拽、整组俯视与形状恢复已核对 |
| 独立审查与 diff-guard | yes | Approved |
