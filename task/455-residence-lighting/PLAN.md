# PLAN -- 住宅与地下共享光照

## Status: done
## Task: 455
## Related: 451, 452
## Baseline Commit: 64ef4a38

## Goal
落实正式住宅场景的天空遮光、洞口传播、局部灯遮挡和材质反射衰减。挖掘及建造实时更新，人物与家具使用同一场。

## Non-goals
不修改存档格式，不加入全场光追或逐格反射相机，不重做天气系统。

## Acceptance Criteria
- 封闭地下无天空直射或明亮室外反射，剖切面不当作天空入口。
- 半砖形状、挖通洞口、封堵与门状态影响光；地下灯白天仍亮且不穿墙。
- 人物、家具、实例格子、墙共享遮光；地下空洞不穿出城市。
- 现有昼夜、天气与材质效果保留，光场只在建造状态改变时更新。

## Decisions
- 用户已批准上一轮整体方案，无需再次确认。
- 探索与设计并行由当前任务子代理完成；纯逻辑半格光场 + 可组合材质shader，复用现有点光和世界时间。
- 天空间接传播与点光实际遮挡分离，避免通过最终颜色乘黑掩盖错误。
- 地下背景使用非可建造地质剖面，避免开挖后看见室外城市。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/sim/residence-light.ts | 形状遮光、天空传播及采样 | yes |
| src/render/residence-lighting.ts | 共享shader接入与点光遮挡 | yes |
| src/app/residence-app.ts | 生命周期、编辑更新、角色与场景接入 | yes |
| src/render/residence-view.ts | 地下灯按本地环境开启 | yes |
| src/render/residence-terrain.ts | 地下背板与实例材质接入 | yes |
| test/residence.test.ts | 封闭/开挖/封堵等行为 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器地上地下/洞口/灯/昼夜检查 | yes | yes |

## Validation Results
- npm run typecheck：通过（最终shader及接入版本）。
- npm test：1952项全部通过；天光衰减微调后 node --test test/residence.test.ts：37项通过。
- npm run build：通过；保留已有大chunk提示。
- 浏览器：实际住宅正常显示，60FPS指示；临时隔离夹具直接复用住宅状态、地形、人物和光照，已操作密闭/挖通/封井/放灯/拆灯/昼夜并保存截图。无WebGL错误。临时夹具已删除。
- 子代理审查发现的自由场重建漏接、自遮挡两项均已修复并复核。

## Final Decisions and Limits
- 半格光场按revision重建；世界时间和天气仅改变现有光源强度，不重新生成光场。
- 全世界光场左右分幅叠放，纹理2434×396，避免4864宽度超过4096设备限制。
- 地质背板不占玩家格，不参与拆建，避免洞穴透出城市。
- 保留极低漫反射用于辨认，无地下室外环境高光；角色额外补亮受真实光照包络约束。
- 当前使用半格近似，局部太阳射线16格，表面离开起始实体最多1.5格；不是全局光追或真实场景镜面反射。未在移动真机做性能验收。
- 本轮复用先前探索数据并派出逻辑实现、shader实现、独立接入审查；测试与浏览器由主代理统一执行，避免同时操作页面。
