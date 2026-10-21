# PLAN -- 头皮贴合与短发轮廓精修

## Status: done
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
- 分束着色将冠部竖板定位到 Crown 横向带的平直宽截面；只对贴头 Crown 改为顺应头骨曲率的截面，导引同步到最终中心线，其余发束保留整圈约束。接触通过仍须视觉复核。
- 发束按真实弧长重采样后再收尖；原参数按密集末端控制段计算，造成钝圆封头。独立 Ear back 小钩片删除，后脑使用主流与内层衔接。
- 最终采用小范围 A/B 中的 B：后脑主束加厚并略收宽，改善薄片感和冠部连接；不改前刘海、头部、眼睛或材质。A 完整保留，原画分束设计尚未宣称最终还原。

## Implementation Map
| File | Intent | Done |
|------|--------|------|
| assets/.../scalp-flow-bob-01/revisions/before-contact-refine/ | 保存旧版可重建对照 | yes |
| assets/.../scalp-flow-bob-01/build_hair.py | 头皮外部约束、耳周与侧后发流 | yes |
| assets/.../scalp-flow-bob-01/verify_hair.py | 全束表面诊断和多视图检查 | yes |
| assets/.../scalp-flow-bob-01/ | 更新 blend、GLB、导引、贴图、报告和说明 | yes |
| public/.../d1-outfit-blender-scalp-flow-v1.glb | 只更新 47 | yes |

## Validation
| Check | Required | Done |
|-------|----------|------|
| 后台 Blender 构建与头皮接触诊断 | yes | yes — 两套头部各 53,072 顶点、102,763 边，深负距/多数判内/穿皮边 0 |
| source/public 一致、非 Hair 二进制冻结、球眼哈希 | yes | yes — B 同 SHA，非 Hair 和球眼 v3 未变 |
| 浏览器多视图、耳周和眨眼/注视/动作 | yes | yes — 正/45°/左右侧/背、闭眼/注视右、走路 0.60/1.20 秒；两预览入口无新增警告或错误 |
| npm run typecheck | yes | yes — 退出 0 |
| npm test | yes | yes — 2041/2041，0 失败、0 跳过 |
| npm run build | yes | yes — 退出 0，仅既有大包提示 |

检查日志位于 `/private/tmp/hair47-refine-{typecheck,test,build}.log`。本轮仅改模型资产与制作脚本，代码检查各运行一次；后续只在模型变更后重跑相关资产审计。

## Delivery
- 最终 GLB SHA256：`20abe58bf4722a7fc7195a3f97268e35dec72493076838bde31b2c68449efc55`。source/public 相同。
- 最终 blend SHA256：`7ccda772ee7fbcfabb8f9f40c668787af4343a262d5a3d9c0fb263a28aca66a3`。
- `evidence/after-surface-audit.json`：独立静态接触审计；两套头皮最小净距约 +0.001984。头部非水密，少数单方向射线分歧已如实记录；未声称所有三角面、自碰撞及全部动画帧严格无交叠。
- `evidence/source-asset-audit.json`：结构、非 Hair 冻结及发布一致性；可复现脚本同目录。
- `evidence/before-after-comparison.png`：V2 浏览器 45°、侧面、背面前后对比；原始截图、闭眼/注视/走路和全部头发预览截图同目录。
- 源目录 `review/reference-comparison.png` 保留原画对照。背部分束和下部发量仍与原画不同，属于精修候选，未宣布美术最终还原通过。
- 本轮未修改 TypeScript/HTML、未新增测试、未提交或推送。
