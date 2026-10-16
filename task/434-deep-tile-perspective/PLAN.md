# PLAN -- 加深格标准与透视验证

## Status: completed
## Task: 434
## Related: N/A
## Baseline Commit: 64ef4a38

## Goal
- 在场景透视实现普通深2、加深深3（前后各扩0.5）对照和试放。
- 加深规格复用基础材质/形状；同格背景墙双向互斥，禁止自动删墙。
- 展示两格拼接、四格组合保持基础格网，半砖按所属整格禁墙。

## Non-goals
- 不修改正式住宅、游戏地台、材质色板或存档；不实现大石头破坏系统。

## Acceptance Criteria
- 新目录入口可查看真实共享构件的正视、斜视、俯视、格线、半透明。
- 普通/加深具有正确尺寸和不变的二维碰撞；现场可试验放墙、加深、拆除及多格冲突。
- 普通与墙可共存；相邻及上方墙不受影响；失败后保留原构件。
- 标准文档明确深度、禁墙、组合占位和本轮范围。

## Decisions
- 探索与架构由同一只读子代理完成，已明确共享kit及一次性inspection/collision缓存风险，不另起架构轮次。
- 交互区预先建立共享kit的形状/墙视图，通过有效状态控制可见性，避免重建导致线框失效；同步二维碰撞数组。
- 默认普通深度不变，深度为基础格属性；本轮仅在透视开放验证，不登记新的住宅存档资源。
- 无不可回退操作或方案分歧，直接实施。已有工作区改动通过/private/tmp/deep-tile-start快照隔离核对。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/definition-kit.ts | 共享深度规格 | yes |
| src/sim/definition-depth.ts | 纯放置互斥及试放状态 | yes |
| src/render/definition-kit.ts | 共享几何深度与墙体互斥 | yes |
| src/app/definition-depth-trial.ts | 对照及试放模型 | yes |
| src/app/definition-scene-layout.ts | 新透视分区 | yes |
| src/app/room-scene-preview.ts | 试放控制面板 | yes |
| src/app/scene-catalog.ts | 扁平目录入口 | yes |
| docs/depth-definitions.md / docs/core-coordinates.md | 标准同步 | yes |
| test/definition-depth.test.ts | 实际状态转换/互斥行为 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| 定向互斥行为测试 | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器对照、试放、相机、切场释放 | yes | yes |
| scoped diff review / diff --check | yes | yes |

## Results
- npm run typecheck 通过。
- 定向 definition-depth / definition-collision 测试 15/15 通过；最终 npm test 1925/1925 通过。
- npm run build 通过，保留已有大 chunk 提示。
- 浏览器验证深度斜视/俯视、双向禁墙、普通格共墙、邻格/上方墙、单格扩两格失败保留原态、拆墙后放置、切出原透视并返回。
- 加深格俯视隐藏投影重叠说明，斜视保留文字。
- 子代理 scoped review 无缺陷；git diff --check 通过。
- 本轮未修改正式住宅布置、存档或蓝色材质。
