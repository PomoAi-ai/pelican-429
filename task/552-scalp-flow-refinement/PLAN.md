# PLAN -- 头皮贴合与短发轮廓精修

## Status: implementing
## Task: 552
## Related: 549
## Baseline Commit: a13fdd68

## Goal
继续精修 47，优先处理发束中段穿入头皮与耳周结合，再按原画重做侧后方的连续短发流向，减少叶片、长三角尖刺和重复分层。

## Non-goals
不修改头部、耳朵、已认可眼睛、身体、共享渲染器、旧款或正式游戏默认资产。

## Acceptance Criteria
- 当前 47 源、GLB、检查图和脚本保留可重建快照。
- 整束头皮检测覆盖发根和中段，修复已知负距离缺陷；对诊断的适用边界作明确说明。
- 正面、左右侧、45°、背面和耳周有真实渲染检查；侧后发束减少孤立叶片和长尖刺，与头部连续衔接。
- 保留骨架/动作/身体二进制，球眼 v3 未改；两个现有预览入口继续工作。

## Decisions
- 沿用上轮已验证的后台 Blender、Hair Tool 和发布流程，跳过重复工具探索及 UI 设计。
- 模型子代理实现，独立探索子代理核查表面约束和误判；主代理按原画和用户截图审看。
- 不用材质暗化掩盖交叠，不以仅发根净距代替整束检测。
- 原画非严格正交工程图，侧视存在透视与不一致；多视图做可解释对照，不伪造精确还原分数。
- 当前工作树有大量无关改动，本任务只修改 47 源资产、构建/验证脚本和对应 public GLB。
- 缺陷已独立复现：旧 47 的 2745 个负距点均被五向射线 5/5 判定为内部，29 刘海中段最深约 -0.042811，118 条网格边穿过头皮面；原 Head 和球眼 socket 结论一致。耳后四束也有真实中段交叠。本轮需用同一判据复查，不能再仅以 nearest-normal 可能误判解释。
- 实现采用逐圈截面外部约束、平滑中心线后重建，侧后主束缩窄并调整末段内卷；先完成源目录检查再发布 public。

## Implementation Map
| File | Intent | Done |
|------|--------|------|
| assets/.../scalp-flow-bob-01/revisions/before-contact-refine/ | 保存旧版可重建对照 | no |
| assets/.../scalp-flow-bob-01/build_hair.py | 头皮外部约束、耳周与侧后发流 | no |
| assets/.../scalp-flow-bob-01/verify_hair.py | 全束表面诊断和多视图检查 | no |
| assets/.../scalp-flow-bob-01/ | 更新 blend、GLB、导引、贴图、报告和说明 | no |
| public/.../d1-outfit-blender-scalp-flow-v1.glb | 只更新 47 | no |

## Validation
| Check | Required | Done |
|-------|----------|------|
| 后台 Blender 构建与头皮接触诊断 | yes | no |
| source/public 一致、非 Hair 二进制冻结、球眼哈希 | yes | no |
| 浏览器多视图、耳周和眨眼/注视/动作 | yes | no |
| npm run typecheck | yes | no |
| npm test | yes | no |
| npm run build | yes | no |
