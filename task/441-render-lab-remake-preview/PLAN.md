# PLAN -- 独立雕刻重制版实时对比

## Status: done
## Task: 441
## Related: 440
## Baseline Commit: 64ef4a38

## Goal
将用户提供的stage03重制GLB作为独立blender-remake模型，加入现有render-lab实时对比。

## Non-goals
不重做造型、贴图或动画，不修改D12及旧资产，不宣称用户粘贴的美术完成结论已通过验证。

## Acceptance Criteria
- 下拉及URL可切换独立雕刻重制版。
- 实际加载指定新GLB、原发型和贴图，旋转与各渲染风格对比有效。
- 标准高度与现有骨架、眼睛、动作契约通过，旧版本保留。

## Constraints
仅整角色尺寸包装以满足3.1加载契约；源GLB不变，新增public路径。

## Decisions
- 复用440已经验证的页面接入路径，跳过重复架构探索；没有待用户裁决的方案。
- 原始模型高3.183868，新增完整角色wrapper缩放到3.1；源节点/材质/骨架/动作/BIN保持。
- 实体Hair有20guides、10011顶点和13005三角；复用已有逐束惯性，不走D12纤维带分支。
- B已完成真实Three与共享运行时资产契约；A负责最小UI实现，主线程浏览器验收。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/app/d1-render-lab.ts | 新模型资源/参数/眼睛选项 | N/A | yes |
| 2 | render-lab.html | 新增独立模型选项 | N/A | yes |
| 3 | public/characters/human/render-lab/d1-outfit-remake-hair-preview-v1.glb | 标准尺寸新资源 | N/A | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 真实浏览器加载、材质对比、视角、闭眼、旧版本保留 | yes | yes |
| GLB源冻结/尺寸/骨架动作契约 | yes | yes |

## Results
- 三项本地检查均退出0；临时日志已不在，未记录测试总数。
- 浏览器实测10种渲染风格、正侧面、跑步与发束惯性、手动闭眼、球面眼睛与视线控制，控制台无警告或错误。证据保存在资源目录的render-lab-integration/browser-verification/。
- 独立审查通过，无需修复项；D12与旧模型选项保留。
- 发布资源SHA256：79656f80e0f2299f9fec087d5e4297c205882db23b272cd7c4d9090cf452cb48。源GLB保持不变，仅增加整角色3.1标准高度包装。
- 未提交或推送。美术是否达到原画标准由后续对比确认，本次完成范围为接入。
