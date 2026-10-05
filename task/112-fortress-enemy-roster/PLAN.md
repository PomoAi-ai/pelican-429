# PLAN -- 第一章四怪与双技能

## Status: complete
## Task: 112
## Related: 102
## Baseline Commit: N/A（仓库无 HEAD，现有文件为基线）

## Goal
按当前正面/侧面设定制作钳卫、巡线犬、FPV 哨蜂、搬山，四怪各有两个技能，接入第一章及共享角色展示场。

## Non-goals
提交推送、发布、扩展其他章节、改动 vendor。

## Acceptance Criteria
- 四怪使用与设定相符的真实模型，游戏与展示场直接复用。
- 八个技能有明确前摇、伤害判定、后摇；能被玩家攻击、击败不复活。
- 普通战斗致死可按已有流程重生。
- 展示场可分别查看待机、两技能、受击与正侧视；缩略图来自真实预览。
- 相关行为检查、全量测试、类型检查和构建；浏览器验证效果。

## Constraints
保持分层、确定性、唯一 three 运行依赖；不在 CI 执行测试；用户已授权需要时使用现有模型订阅服务。

## Decisions
- explorer 子代理已完成现有战斗/展示场探索与文件级设计；采用一个敌人组件、四组配置，复用现有 AttackInstance 与 ProjectileRequest。
- 钳卫：夹臂横扫/突进夹击；巡线犬：扑冲/落地震击；哨蜂：瞄准弹/三发扇形弹；搬山：下砸/低位横扫。
- 用 enemies 关卡数据替换旧 maintenanceBot，移除旧接口；新敌人不挂训练假人射击开关。
- 启动时基线类型检查失败：src/app/showcase/npc-session.ts:50 调用参数数量不符；需确认现有并发工作影响。
- 使用已配置且登录的 Hyper3D CLI 完成四次 Gen-2.5-High 模型生成，原始 GLB、任务 ID、请求参数均保留。
- 四怪使用原始 Rodin 网格/UV/PBR，Blender 绑定机械关节并导出 idle/move/skill1/skill2/hit；实际正侧图和缩略图接入角色资料页。
- 修复实测发现的装甲错绑和拉伸；哨蜂增加出生空域内往返巡航，攻击前摇悬停。

## Implementation Map
| # | Area | Intent | Done |
|---|---|---|---|
| 1 | config/entities/sim/world | 四怪配置与八技能、出生、死亡重生、行为测试 | yes |
| 2 | assets/public/scripts | 订阅模型生成、整理、动画与 GLB 导出 | yes |
| 3 | render/app/showcase/config | 共享模型视图、加载、动作、角色目录和预览 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器游戏与展示场检查 | yes | yes |

## Validation Results
- npm test：1565/1565 通过；之后增加巡航回归用例，node --test test/enemy.test.ts：15/15 通过。
- npm run typecheck：最终通过；先前并发人形文件改动期间的缺失文件/类型错误已消失。
- npm run build：通过；仍有现有大包体积警告，未扩大到代码拆包。
- 四份 GLB 均有五个有效动画、真实蒙皮、指定高度和 +X 朝向；子代理检查并修复钳卫、巡线犬、搬山的动作关键帧。
- 浏览器已确认四怪真实模型可加载、八技能目录可运行，控制台无错误。第一章构建预览已正常启动并运行，控制台无错误；已保存场景截图。
