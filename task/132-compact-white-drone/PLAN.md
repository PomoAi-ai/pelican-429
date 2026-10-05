# PLAN -- 紧凑白色无人机与倾斜飞行

## Status: done
## Task: 132
## Related: 129-drone-payloads-and-variants
## Baseline Commit: 无 HEAD；按文件职责及修改前快照审查

## Goal
按用户批准的主角比例参考图绘制紧凑白色无人机正侧面、倾斜飞行与铝热剂攻击概念，并落实共享模型与飞行动作。

## Non-goals
不改变现实武器参数，不提交或部署，不修改其他角色。

## Acceptance Criteria
- 独立保存定稿多视图、倾斜飞行图、铝热剂攻击图及生成提示词。
- 机身为低矮紧凑白色外壳，10种配色只变化装饰、灯光和桨，保留双叶/三叶。
- 移动向前倾斜，减速/悬停平稳回正；左右方向正确；游戏与展示场共用。
- 保留投弹、铝热剂地面燃烧区行为；通过浏览器检查模型、飞行和攻击。

## Constraints
共享资源与渲染，不改 vendor；本地验证；保留原始 Rodin 来源。

## Decisions
- 已有探索完整覆盖战斗、rig和模型构建链；本轮模型子代理针对造型探索并设计，主线程负责绘图和飞行。
- 使用当前 Blender 构建链与现有骨骼重制外壳、材质分区；以实际速度驱动表现层倾斜，不改变碰撞盒。
- 用户已批准参考造型及制作，无必须确认的设计分歧；不再重新启动订阅任务。

## Implementation Map
| File / 范围 | Intent | Done |
|---|---|---|
| assets/concepts/watch-wasp-final | 定稿与攻击、飞行概念图；正侧面同步展示场 reference.png | yes |
| scripts/blender_enemies/build_wasp.py 及GLB/blend/预览 | 紧凑白色机身 | yes |
| src/config/drone-appearance.ts, src/render/enemy-rig.ts | 白色主体和彩色分区 | yes |
| src/render/enemy-view.ts | 速度驱动平滑倾斜 | yes |
| src/entities/enemy.ts, src/app/showcase/enemy.ts, test/enemy.test.ts | 巡航面向实际移动方向；展示场左右方向正确 | yes |
| src/config/showcase.ts, src/ui/showcase-language.ts | 专题展示加入飞行卡片 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | 通过 |
| npm test | yes | 1589/1590；唯一worldgen耗时278.3ms超250ms，单独重跑该用例通过；未改世界生成或阈值 |
| npm run build | yes | 通过；同步最终参考图后再次构建通过；已有大chunk提示 |
| 浏览器验收外观、倾斜、铝热剂 | yes | 左右前倾、投放回正、落地火区及随机白壳饰色已目视通过；控制台无error；截图在assets/characters/enemies/validation/compact-drone-*.jpg |

## Review
- 模型子代理校验实际GLB：5 clips、6 joints、4双叶+4三叶，脚底0、高度0.80000001。
- 朝向子代理用例先失败再修复，enemy测试30/30通过。
- 独立审查子代理按core-review/diff-guard审查后Approved；坐标、暂停、材质恢复和共享资源无新增问题。
- 实际GLB为保留原碳架的本地几何改造，较概念图更简化；铝热剂概念图表现火花雨，当前游戏为投放后地面持续燃烧。
