# PLAN -- 主角两款参考发型对比

## Status: done
## Task: 313
## Related: 311-character-hair-rebuild, 312-grassy-soft-hair
## Baseline Commit: 2a5455a

## Goal
将用户提供的主角两款参考发型制作成可比较的真实模型：分束蓬松短发与柔软细丝侧分发。

## Non-goals
不修改 Boss、身体头骨、五官或战斗逻辑，不提交推送。

## Acceptance Criteria
- 两款发型造型有明确差异，根部固定，发梢可随既有动作摆动。
- 展示场使用游戏共享模型和动画，可选择发型并并排对比站立、快跑、跳跃下落。
- 已认可的细丝款继续作为默认发型，新增款不覆盖它。
- 类型、现有测试、构建和浏览器检查通过。

## Decisions
- 延用前两任务完整的头部/独立发型探索；本次委派模型造型与 TS 接入两个独立子任务，各自完成增量探索、设计和实现。
- 细丝款复用当前 grassy.glb；新分束款新增 grassy-tousled.glb。只新增真正需要的发型选择，不复制身体资源。
- 不存在需要用户裁决或不可逆操作的分歧，直接实现。
- 动画与造型由真实模型预览检查，不新增网格细节自动测试。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | scripts/character_hair/* | 新增分束款生成，复用帽层与骨架 | — | done |
| 2 | public/characters/hair/grassy-tousled.glb | 导出新款模型 | 1 | done |
| 3 | src/config、src/render/grassy、src/app/showcase、src/ui | 共享资产与展示场发型选择/对比 | — | done |
| 4 | assets/characters/hair-design | 保存真实模型预览与来源说明 | 2 | done |

## Validation
| Command | Required | Done |
|---|---|---|
| 真实三视图及展示场站立/快跑/跳跃检查 | yes | passed：两款站立/快跑/下落定格，A→B 往返切换，无控制台 error |
| npm run typecheck | yes | passed |
| npm test | yes | passed：1806 tests / 301 suites |
| npm run build | yes | passed：dist 两款 GLB 与 public SHA256 相同，保留现有 chunk 大小提示 |
| 范围审查及已有发型哈希比对 | yes | passed：TS 与生成脚本独立审查通过，B 与四个 Boss 哈希保持 |

## Validation notes
- TS 接入子代理运行 typecheck、showcase.test.ts（32 项）通过；独立测试子代理运行全量 1806 项通过。
- 独立只读审查未发现本轮 TS 接入高置信度问题。B 与四个 Boss 发型 SHA256 和本轮开始一致。
- 展示场 URL 使用包含发型的 8 项 stageActor 字段；已有 7 项临时对比链接需要重新生成。
- A 为图一方向试版，55 条骨链、138480 三角面、7502692 bytes；B 保留原 11865284 bytes。两款实际模型仍比概念图整齐，未宣称完全匹配原画。
- 已保留浏览器对比页；未提交、推送，未修改 CI，未改本轮范围外的已有工作区改动。
