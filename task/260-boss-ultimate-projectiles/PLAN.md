# PLAN -- Boss 大招真实弹幕

## Status: blocked
## Task: 260
## Related: N/A
## Baseline Commit: 8a8fe8c

## Goal
让 Tibo 的重置降临加入两轮错角扇形薯条，Sam 的 AGI 降临加入分轮路由光弹和末轮高低弧线 Token 齐射。保留地面冲击，重新分配伤害，弹幕可躲且留收招窗口。

## Non-goals
不改普通攻击和普通技能玩法，不重做地面波运动，不增加弹种或依赖，不提交、推送或部署。

## Acceptance Criteria
- 两位 Boss 大招生成可见且能真实命中的投射物，能威胁跳起的玩家。
- 分轮发射，预先锁定方向，已出膛的弹体不追踪，取消施法不补发剩余弹幕。
- 游戏与展示场复用弹体生成和视图，不新增展示专用弹道规则。
- 伤害分配控制单次中弹惩罚，保留反击窗口。
- 类型检查、全量测试和 Vite 构建通过。

## Constraints
遵守逻辑层依赖、边界校验与测试规则；工作区已有大量未提交修改，按任务开始时文件快照核对本次差异，不覆盖原有修改。

## Decisions
- 沿用已批准的技能方向，无需再次确认设计。
- 探索和设计由同一 explorer 子代理处理；重点核实展示场复用入口。
- Git 状态只读查询禁用 LFS 过滤器，避免状态检查写入受限的 .git/lfs/tmp；不变更仓库配置。
- 探索确认旧展示大招按预设时刻播放命中特效；本次改为直接调用 updateBoss、stepProjectile、resolveHits 与游戏弹体视图，避免新增独立弹幕配置或复制弹道。
- Clarify/Design 已完成：用户已批准玩法，无只有用户能回答的问题或停止条件；按可回退代码修改直接实现。
- 新测试保护空中玩家仍受真实大招弹体伤害、每轮锁定后不追瞄，以及取消施法后不补发，不断言渲染内部结构。
- 实现：Tibo 两轮各四根错角薯条；Sam 两轮各三枚路由光弹，末轮两枚高低 Token。每轮提前源动画 .4 秒锁定目标，发射后不追踪。
- 大招独立倍率由 1.5 调为 .8，保留轮间换位与末轮后的收招窗口；地面波伤害 Tibo 8/8、Sam 6/6/8，薯条和光弹伤害 3、Token 4。
- 独立子代理按本次文件快照审查：Approved，无需修复的新问题。
- 浏览器已在本地展示场观察 Tibo 扇形薯条、Sam 路由光弹及末轮两枚 Token，控制台无 error；截图保存于本聊天 visualizations 目录。实战伤害由完整 stepSim 测试验证，未进行人工难度平衡试玩。
- 当前唯一验收阻塞：全仓类型检查报 test/combat.test.ts:296、:317 的 ProjectileRequest 缺少 returned。该文件不属于本次修改，按只改任务相关代码的约束保留；本次实现、全量运行测试及构建均已完成，但不标记所有检查通过。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/entities/boss.ts | 大招分轮弹幕、预瞄与既有弹体复用 | — | yes |
| 2 | src/config/boss-rules.ts | 大招伤害与节奏分配 | — | yes |
| 3 | test/boss.test.ts | 真实命中、躲避与取消验证 | 1,2 | yes |
| 4 | src/render/npc/npc-ultimate-targets.ts | 大招预览直接装配游戏逻辑与视图 | 1,2 | yes |
| 5 | src/render/npc/npc-targets.ts | 大招接入真实预览，移除旧预设命中分支 | 4 | yes |
| 6 | src/config/npc.ts | 更新大招说明 | 1,2 | yes |
| 7 | src/ui/showcase-language.ts | 同步大招英文说明 | 6 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/boss.test.ts | yes | yes — 35/35 |
| npm run typecheck | yes | no — 已执行，其他文件两处错误 |
| npm test | yes | yes — 1784/1784 |
| npm run build | yes | yes — 构建成功，存在大 chunk 提示 |
