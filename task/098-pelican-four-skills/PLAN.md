# PLAN -- 鹈鹕四技能与受击展示

## Status: done
## Task: 098
## Related: 091
## Baseline Commit: 无 HEAD；源文件基线保存在 $TMPDIR/pelican-four-skills-baseline

## Goal
落地已确认的两张技能概念图：吐水普攻，加鱼群轰炸、振翅突进、吞弹反击、光子乱舞四个技能；角色展示场加入真实受击目标。

## Non-goals
不改 vendor，不改其他角色或序章，不提交推送。

## Acceptance Criteria
- 吐水是普攻，四个技能有独立入口和冷却；鱼群多弹、突进击飞、吞弹聚合反吐。
- 光子大招出现 Bug 和有轮辐的发光轮，漫游群中部分分批追踪敌人，实际命中才伤害。
- 五种攻击均可在鹈鹕展示场播放，有真实目标、击退和血量；镜头同时包含施法者、弹道和目标。
- 游戏和展示场复用同一模拟、模型、动画和效果；暂停冻结，重播恢复场景。

## Constraints
- 逻辑分层与确定性、配置边界校验遵守 AGENTS.md。
- 保留项目内他人并行修改。
- 美术效果以 output/pelican-skill-concepts 两张概念图为方向。

## Decisions
- 用户已确认方案并要求继续实现，无需再次批准。
- 三个 explorer 分别完成逻辑、渲染、展示场探索；逻辑 explorer 接续架构与实现，沿用现有投射物/命中链路。
- 从切换武器改为固定普攻和直接释放技能；光子真实攻击弹与漫游装饰分别由模拟和共享渲染维护。
- 展示场重播原本会重建 SimWorld，可直接恢复目标位置/血量；补充宽镜头和 LumaCompanion 接线。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | config/input/entities/sim/core | 四技能状态、输入、真实命中与必要测试 | — | yes |
| 2 | render/pelican、projectile、luma | 鱼群、风刃、吞弹聚合、Bug/光轮共享表现 | 1 | yes |
| 3 | config/showcase、app/showcase | 技能卡、受击目标、宽镜头、共享效果接入 | 1,2 | yes |
| 4 | ui、app/frame-loop | 普攻与四技能HUD、操作提示 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | passed |
| node --test --test-concurrency=4 'test/**/*.test.ts' | yes | 1528 passed, 0 failed |
| npm run build | yes | passed；现有主包体积警告仍在 |
| 浏览器检查五种攻击、目标受击和重播 | yes | passed；光子六靶全部受击，重播恢复600/600，游戏和展示场无console error |

## Review
- 子代理审查发现死亡后突进判定残留、冷却液死亡动作残留、光子取消后视觉继续播放，均已修复；死亡路径共享取消函数，光子视觉以模拟状态为准。
- 天气测试夹具禁用陆地自然补水，继续独立检查雨量；身体边界检查排除辅助血条。
- 浏览器确认普攻水花、鱼群三靶、突进击飞、吞弹反吐及光子四周追击；大招预览跨满整行，战斗演示初始收起资料图片。
- 游戏复用既有HTML血条，展示场镜头启用共享模型的血条辅助层，避免双血条。
- 实际截图：output/pelican-skill-concepts/photon-swarm-in-game.jpg；概念图已加入展示场“战斗效果概念”。未提交或推送。
