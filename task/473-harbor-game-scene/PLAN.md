# PLAN -- 独立可游玩的潮汐之城

## Status: done
## Task: 473
## Related: 470
## Baseline Commit: c292d188

## Goal
将三维河岸城市接入现有游戏的角色、物理与操作，新增独立关卡入口，保留现有关卡和住宅。

## Non-goals
不替换住宅或自由世界，不修改现有角色资源，不新增剧情、敌人、存档、依赖或 CI；不提交推送，不重启 Docker。

## Acceptance Criteria
- 新地址 `?mode=game&level=harbor` 可进入并操控真实游戏角色，能沿岸行走、跳跃及使用现有技能。
- 城市直接复用既有三维资源，水中无建筑，保持前中远景、真实楼体与河面反射。
- 原游戏入口及独立观察页继续可用。
- 关卡物理验证、类型检查、全量测试与构建通过；浏览器验收并记录证据。

## Constraints
- 已有大量其他工作区改动，只精确修改本任务的接入分支，保留既有内容。
- 新场景复用游戏循环和现有表现层生命周期，不复制控制器或资源。
- 渲染由浏览器验收，不写网格和材质细节测试。

## Decisions
- 子代理已完成关卡和渲染接入探索；采用独立 level 分支与既有表现层插槽，不修改 frame-loop 或 residence。
- 新地图 176×64，连续石质岸道顶 y8、中央出生，左右各一个可跳跃与下穿的观景平台。
- 城市统一缩放和后移以适配横版镜头，独立 stage 使用暮色灯光与空气透视，背景材质不受前景瓦片光照图影响。
- 本次设计可回退，用户已明确要求独立新场景，无需额外设计批准。
- 正式构建使用 --ignore-scripts，避免 prebuild 重写他人正在编辑的共享资源文档。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/world/harbor-level.ts | 独立岸道和观景平台碰撞地图 | — | yes |
| 2 | src/app/game-level.ts | 新 harbor 关卡分支 | 1 | yes |
| 3 | test/harbor-level.test.ts | 沿岸行走、跳跃及下穿的行为验证 | 1,2 | yes |
| 4 | src/app/harbor-presentation.ts | 复用三维城市并适配游戏舞台 | — | yes |
| 5 | src/app/game-app.ts | 仅新关卡的表现、天气与镜头接入 | 2,4 | yes |
| 6 | vite.config.ts | 正式资源清单包含共用城市天空 | — | yes |
| 7 | harbor-perspective.html, src/ui/harbor-perspective.css | 观察页提供进入新关卡链接 | — | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/harbor-level.test.ts test/showcase.test.ts test/facility-chapter.test.ts | yes | yes：54 项通过 |
| npm run typecheck | yes | yes：通过 |
| npm test | yes | yes：1962 项、301 组全部通过 |
| npm --ignore-scripts run build | yes | yes：631 模块通过 |
| 浏览器新关卡、原入口与控制台检查 | yes | yes：移动、跳跃、变身及吐水；住宅与原测试关卡加载正常，均无控制台警告或错误 |
| 范围审查 | yes | yes：子代理 Approved；仅新关卡条件接入，保留既有 scene-loading 工作区改动 |

- 浏览器左右移动确认实体岸面与角色落脚对应，三维楼群持续覆盖背景；截图位于 evidence/。原入口均只读加载，不操作建造或保存。
- 实现与审查子代理分别核对关卡碰撞及表现层隔离；没有发现需修复的问题。未修改住宅、默认地图、角色资源或 Docker，未提交推送。
- 全量测试日志与构建日志位于 /private/tmp/pelican-harbor-game-{typecheck,test,build}.log。构建仅有既有大 chunk 提示；未验证移动端性能和加载失败注入。
