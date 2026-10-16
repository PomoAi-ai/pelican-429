# PLAN -- D1 球形眼球与视线

## Status: done
## Task: 439
## Related: 433-fix-render-lab-hair-contact
## Baseline Commit: 64ef4a38

## Goal
将独立渲染实验中的片状眼改成完整球体眼；虹膜随眼球绕球心转动，眼睑沿球面闭合。验证正面、左右侧面、不同视线和眨眼。

## Non-goals
不制作或调整头发，不操作购买，不覆盖原阶段资产，不改游戏默认模型。

## Acceptance Criteria
- 球体闭合且球心位于眼窝内；原连续皮面开真实眼裂，不能以透明贴片假装球眼。
- 视线不再使用相机射线与平面求交；眼球旋转、眼睑闭合由同一控制入口驱动。
- 独立眼睛选项与发型选项分开，原模型/头发可继续对比。
- 浏览器检查正面、左右侧、45度及睁眼、半闭、全闭；头部运动时无脱离。
- 身体、头发、骨架与既有动作保持；相关检查通过。

## Constraints
使用已安装工具和现有资源。无提交/推送。渲染效果通过实际浏览器验图，不新增几何实现细节测试。

## Decisions
- 探索已完成：当前眼睛是开放曲面贴片，虹膜为平面假视差，底层脸部为完整皮面；必须同时改眼窝、球体与眼睑。
- 球眼作为可组合的独立眼部资源，保留原头发与身体；球节点挂现有 head 骨骼，避免改四套动作和原骨架。
- 手动注视和闭合通过共享 rig 控制；旧贴片只在保留阶段使用旧 shader。
- 无需等待用户批准：本地独立资产与可回退选项属于已授权范围。
- 独立眼部资源通过 `eyes=sphere` 组合；仅启用共享同一 Head 顶点/UV 的四个近期模型。四者几何合同已独立核对。
- 浏览器复现出步态生成器把 Head 下眼组当骨骼的问题，循环改为只处理 Bone；不是添加默认矩阵兜底。
- 审查发现 socket 与眼睑原先使用不同法线修正；新 socket 和睑体统一使用资产法线，旧模型 face 着色保持。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | assets/.../spherical-eye-study-01; public/characters/human/render-lab/d1-spherical-eyes-v2.glb | 眼窝、闭合球体、球面眼睑与资源契约 | — | yes |
| 2 | src/render/grassy/d1-spherical-eyes.ts; d1-rig.ts; d1-anime-material.ts | 装配球眼与共享注视/眨眼控制 | 1 | yes |
| 3 | src/render/grassy/d1-studio-material.ts; d1-lab-looks.ts; d1-study-surface.ts | 十套外观保留真实球眼与连续外缘法线 | 2 | yes |
| 4 | src/app/d1-render-lab.ts; render-lab.html | 独立眼版本与双轴视线检查控件 | 2 | yes |
| 5 | src/render/grassy/d1-lab-gait.ts | 步态生成仅重置骨骼，允许 Head 挂载眼组 | 2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender/GLB 资产重读、球面闭合/源资产保留自检 | yes | yes |
| 浏览器正侧面、视线、眨眼与动作验收 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes — 1930 / 1930 |
| npm run build | yes | yes — 既有大 chunk 警告 |
| 相关 diff 检查 | yes | yes |

## Result
- v2 球眼作为独立可选资源发布；原片眼、头发和正式游戏默认模型保留。
- 浏览器验图覆盖正面、45°、左右90°各开/半闭/闭眼，四种极限视线、画廊、V1/V6/V7/V8/V10、跑步/跳跃和切回原眼片；控制台与页面错误为空。
- 两个球体零开放边；最终 GLB 独立审计确认球面、眼窝、眼睑与保留版一致，上睫毛在采样眨眼状态中位于眼睑外侧。
- 同会话独立审查提出的骨骼子节点遍历和眼窝/眼睑法线差异已修正并复核。没有新增自动渲染测试、提交或推送。
- 完整证据见 `assets/characters/grassy/customization/models/d1-render-lab-blender-hair/spherical-eye-study-01/runtime-verification.md`。
