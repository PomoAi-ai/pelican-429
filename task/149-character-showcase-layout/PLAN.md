# PLAN -- 角色展示场浏览结构优化

## Status: done
## Task: 149
## Related: N/A
## Baseline Commit: e5fb3bf

## Goal
左侧角色目录、右侧一个共享场景；默认单角色，点击目录替换，Add 显式添加到场景，每个实例有跟随角色的悬浮控制。

## Non-goals
不改角色模型、动画、游戏行为、场景资源展示场和历史资源内容，不提交或推送。

## Acceptance Criteria
- 角色目录始终可访问，演示列表不挤掉目录。
- 默认不创建多卡对比。Add 添加独立实例，共享相机、灯光和一次渲染。
- 实时预览优先，图片资料按需查看，动作与播放控制在每个角色浮层中。
- 桌面与窄屏布局可用，现有正式与历史入口正常。
- 类型检查、全量测试、构建通过；浏览器检查实际效果。

## Constraints
- 复用共享游戏资源，界面不新增依赖或独立资源实现。
- 工作区已有大量未提交修改，保留原有修改；用本任务开始时的文件副本区分增量。
- Ponytail Full 已由 hook 加载。UI 不新增自动测试。

## Decisions
- 优先修正展示场信息架构和布局，不扩大到模型效果调整。
- 用户明确采用单场景加角色交互。只读探索/设计子代理确认复用 scenario/runner/entityViews，以实例 Group 共享一个 Stage，保留实际动作及技能；NPC 与光子复用游戏 rig/animator。
- 移除正式页默认多卡路径，历史资料与资源/场景实验室沿用既有入口。
- 无需用户裁决的设计分歧或对外操作，直接实现。
- UI 子代理负责目录与浮层；渲染子代理负责实例适配；主代理负责场景装配、模型状态与验证。
- 正式页共用一个 Stage、相机与后期通道；场景旋转/缩放通过 three.js 原有 OrbitControls，角色动画/命中仍使用共享游戏实现。
- Add 只调整新实例的环境，不重播已有实例；异步加载在实例失效或页面释放时取消挂载。
- 审查子代理发现自由旋转阴影拟合和光子暂停视角问题，均已修复。阴影拟合用 orbitTarget 对应取景外接球；暂停只冻结动画时间，不冻结模型朝向。
- 新增状态用例保护“点击目录替换；Add追加独立实例且保留旧实例”。若追加错误地清空场景或共享播放状态，此用例失败；没有新增渲染/UI自动测试。
- 悬浮控制默认收起，展开一个时收起其他，标签拥挤时错开；图片保留在角色控制下。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/showcase/stage-actor.ts 与共享视图容器边界 | 复用角色行为并挂共享场景 | — | yes |
| 2 | src/ui/character-stage-panel.ts、character-stage.css、showcase-panel.ts、showcase-language.ts、index.html | 目录 Add 和悬浮控制 | — | yes |
| 3 | src/ui/showcase-model.ts、test/showcase.test.ts | 单选替换与追加实例 | — | yes |
| 4 | src/app/character-stage-app.ts、showcase-app.ts、src/render/stage.ts | 单舞台渲染、自由相机与生命周期接入 | 1,2,3 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，最终版本通过 |
| npm test | yes | yes，1638/1638 |
| node --test test/showcase.test.ts test/architecture.test.ts test/render-integration.test.ts test/enemy.test.ts | yes | yes，审查修复后124/124 |
| npm run build | yes | yes，最终版本通过；有包体积提示 |
| 浏览器查看与交互检查 | yes | yes，1360×900与390×844；替换/Add、动作、NPC形态、暂停、视角、旋转和浮层检查 |

## Evidence
- `evidence/shared-stage.jpg`：Add 后两角色同场景，独立悬浮控制。
- 完成后预览已恢复默认单角色，未提交、未推送。
