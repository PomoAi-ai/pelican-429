# PLAN -- D1 原画发流与贴头编辫

## Status: completed
## Task: 549
## Related: 482
## Baseline Commit: a13fdd68

## Goal
研究现有工具和历史头发缺陷，制作独立第 47 款头发并接入实验与全部头发预览。

## Non-goals
不改已认可的眼睛、头部与身体，不覆盖旧头发，不变更游戏默认角色。

## Acceptance Criteria
- 47 独立编号、GLB、可编辑 Blender 源和复现脚本。
- 发根依实际头皮定位；刘海、双侧编辫、短卷发尾按原画组织，检查正面/侧面/45°/背面。
- 既有球形眼睛、眨眼、注视与动画可用。
- 预览无新错误；相关静态检查与本地验证通过。

## Constraints
工作树有大量其他任务改动，只改新头发与所需注册点。原画是风格化非严格正交视图，不伪造像素级还原分数。

## Decisions
- 使用后台 Blender 构建和 MCP 只读核查工具，避免覆盖用户当前 46 场景。
- 主发束用原生曲线、头皮 BVH 与自定义扁截面；编辫使用已实际验证的 Hair Tool Braids_Profile。现有 Hair Tool 4.6.1 和 Stylized Hair PRO 4.3.1 已启用，无需重复购买安装。
- 多视图比较依 multiview-fit-loop 流程；先检查大形和根部，再做细纹。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | assets/.../scalp-flow-bob-01/ | 独立发束、导引曲线、贴图、源文件和检查图 | — | yes |
| 2 | public/.../d1-outfit-blender-scalp-flow-v1.glb | 仅替换 Hair 保留源身体与动画 | 1 | yes |
| 3 | src/app/d1-lab-hair-catalog.ts | 注册 47 | 2 | yes |
| 4 | src/app/d1-render-lab.ts, render-lab.html | 球眼兼容与按钮 | 3 | yes |
| 5 | src/app/d1-hair-gallery.ts | 47 复用已认可球眼并释放资源 | 3 | yes |
| 6 | src/render/grassy/d1-rig.ts, test/character-model.test.ts | 新发型固定身体尺度，不强迫改变总高 | 2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender 资源自检和多视图截图 | yes | yes — 六视图与独立 GLB/.blend 审计 |
| 浏览器 47 加载、转角、眨眼 | yes | yes — 实验页和 gallery 无控制台错误，正面/45°/侧面/背面、闭眼、注视及走路姿态 |
| npm run typecheck | yes | yes |
| npm test | yes | yes — 2038/2038 |
| npm run build | yes | yes — existing chunk size warning |

- 只读探索核对：39 与31非Hair几何/蒙皮/动作一致，39容器更小，选择39为发布基底。
- 新头发导出逐束属性与guide，复用现有Blender发梢运动；编辫固定以保持交织。
- Gallery只为47注入已认可球眼v3，复用一个源资源，退出与加载取消时释放。
- 未发现需用户裁决的设计分歧，直接实现。

- 独立审查：接入、已认可球眼源复用、资源退出释放和标记身体校验无新增问题。
- 尺度缺陷先用加载边界用例复现（3.04短发拒绝），现已修复：仅显式approved-outfit-body使用冻结身体三轴尺寸；未声明仍验原3.1总高。
- 用户追加工具需求，已在独立临时场景实际验证 Hair Tool Braids_Profile，3960 顶点、3930 面，确认宽编织面须朝头皮法线；不修改当前 live46 场景。Stylized Hair PRO 仅核查安装和节点存在，未用于此次成品。

## Result and limits
- 47：58,104 顶点、110,098 三角面、47 条导引。Hair Tool 实际输出双侧三股辫；导引与网格均绑定 head。
- 最终 GLB SHA256：`0d95f2c9d481df9350b8bd4e65763fb1f25e2a26be9eb55d56df0734be0c8b78`。source/public 完全一致，39 原始非 Hair 数据与动画未变；已认可球眼 v3 哈希未变。
- 保存的导引可供编辑参考，但不会实时驱动已生成网格；当前从脚本控制点重建。未宣称 Blender 原生动态 Surface Deform 绑定。
- 发根最大最近表面距离约 0.008。该值不能证明整束零穿插：中段有负最近法线距离，最深样本约 -0.04281；已保留诊断。侧后方部分接缝、体积和原画仍有差距，作为新候选而非原画完全还原定稿。
- 证据：`evidence/browser-three-views.png`、其余浏览器原始截图、`evidence/asset-audit.json`、`evidence/blend-audit.json`。
- 未提交或推送；未新增或安装软件；未跑 CI；模型迭代后未重复与资产无关的全量测试。
