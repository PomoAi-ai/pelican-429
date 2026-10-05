# PLAN -- 光子引导宠物角色与 3D 模型

## Status: blocked
## Task: 031
## Related: N/A
## Baseline Commit: 无（仓库尚无提交，现有项目文件均为未跟踪状态）

## Goal
添加一个受到《光之子》光点伙伴启发的原创引导宠物，完成角色定义、共享 3D 模型及角色展示场预览。

## Non-goals
本轮不扩展任务系统、寻路、战斗技能或存档；不修改 vendor；不提交、推送或部署。

## Acceptance Criteria
- 明确名字、外观、性格、引导方式和动作含义。
- 提供可复用的真实 three.js 3D 模型及动画，展示场使用同一套资产。
- 展示场可选择新角色并切换动作，支持现有播放、暂停、缩放及环境检查。
- 类型检查、全量测试及 Vite 构建通过；浏览器观察模型与动作。

## Constraints
遵守项目分层与共享资产要求；不新增依赖、防御性兜底或渲染细节测试。

## Decisions
- 将本轮范围聚焦于角色定义与 3D 创建，宠物的游戏内导航 AI 留待后续玩法需求明确后接入。
- 仓库没有 HEAD，无法基于提交比较差异；为将修改的现有文件保留临时原始副本，审查本次修改范围。

## Exploration
- 无现成宠物实体；沿用 human-session 的共享模型/动画独立预览模式。
- 共享 stage 已有 Bloom；光晕复用 orb-view 的 createGlowTexture。
- 新角色还需同步目录、资源列表、session 分派、模拟角色排除与视角控件。
- 澄清阶段无必须由用户裁决的问题，继续设计。

## Design
- 采用探索代理给出的共享配置 → rig → animator → 独立 session；无真实方案分歧或停止条件，已批准继续实现。
- 名称光子；五动作 idle / guide / wait / alert / celebrate；青蓝光体、暖白核心、深色眼睛、柔软尾迹。
- 视角从 humanView/HUMAN_SHOWCASE_VIEWS 统一改名 modelView/MODEL_SHOWCASE_VIEWS，同步全部调用方，不保留别名。
- 原有测试无需调整；本次不新增复述实现的渲染或常量测试。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/luma.ts | 角色尺寸与动作定义 | — | yes |
| 2 | src/render/luma/luma-rig.ts | 共享 3D 模型与资源释放 | 1 | yes |
| 3 | src/render/luma/luma-animator.ts | 五种共享动画 | 2 | yes |
| 4 | src/app/showcase/luma-session.ts | 预览时间、镜头与环境 | 1,2,3 | yes |
| 5 | src/config/showcase.ts | 目录及通用视角 | 1 | yes |
| 6 | src/config/character-assets.ts | 真实模型图资源 | — | yes |
| 7 | src/app/showcase/session.ts | 新角色分派 | 4 | yes |
| 8 | src/app/showcase/catalog.ts | 模拟适配器排除宠物预览 | 5 | yes |
| 9 | src/ui/showcase-panel.ts | 通用视角控件 | 5 | yes |
| 10 | src/ui/showcase-model.ts | 通用视角状态 | 5 | yes |
| 11 | src/app/showcase/human-session.ts | 同步视角字段更名 | 5 | yes |
| 12 | src/ui/character-assets.ts | 泛化真实模型图片说明 | — | yes |
| 13 | public/characters/luma/SOURCE.md | 角色设定和资源说明 | 1 | yes |
| 14 | public/characters/luma/*.jpg | 从真实模型预览获取截图 | 4 | yes |

## Final Decisions
- 用户指定名称为「光子」，所有对外名称同步；内部模块 ID 保持 luma。
- 审查发现循环首尾的彗尾与萤点不连续，已统一为动作周期的整数倍；临时 Node 采样确认五动作首尾误差小于 1e-6。
- 初轮 typecheck、1479 项测试和 build 全部通过；之后工作区其他区域发生变化，类型检查先后出现地形/序章的非本任务错误，需在最终交付前记录最新结果。
- 展示场重载出现既有人形 GLB 加载异常，本地模型文件与 HTTP 响应为有效 GLB；新增 assets/characters/luma/preview.html 直接复用相同 luma-session，提供不依赖人形资源的独立检查入口。
- portrait.jpg 为真实共享模型截图；浏览器截图返回 JPEG，按实际格式命名。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes（最终一轮通过） |
| npm test | yes | no（初轮1479/1479；最终1484项，1479通过、5项地形测试失败） |
| npm run build | yes | yes（体积警告，无构建错误） |
| 浏览器模型与交互检查 | yes | yes（共享session的独立预览；展示场早期可用、后续人形GLB加载异常） |

## Completion Record
- 光子的角色定义、共享模型、五动作、展示场目录与独立交互预览均已实现；仅全仓验证未满足完成门槛。
- 新增 `assets/characters/luma/preview.html`，直接复用同一 session；交付截图 `output/luma-preview/photon-preview.jpg`。
- `node --test test/showcase.test.ts test/architecture.test.ts` 最终45/45通过。五动作首尾临时采样误差均低于1e-6。
- 最终全量测试1484项中1479通过、5失败，均为本次未修改的世界生成/浮岛可达性/岩石密度/坡面轮廓/台阶约束。日志 `$TMPDIR/luma-validation-final-test.log`。与初轮相比工作区测试数由1479变为1484，相关类型错误在验证期间也发生变化；不修改并行工作或失败断言。
- 独立预览已在浏览器检查动作切换、五视角、明暗、暂停和重播。角色展示场先前可正常加载光子；后续重载时既有Grassy GLB收到HTML解析错误，而本地GLB及curl响应有效，未扩大修改人形加载代码。
- 子代理审查发现1项循环跳位问题，已修复；其余角色分派、视角重命名、资源释放和变更范围通过审查。主代理复核新增独立页面的环境对比、错误展示与幂等清理。
- 因最终全量测试仍有5项非本任务失败，Status按工作流记为blocked，未提交或推送。
