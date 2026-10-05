# PLAN -- Sam 与 Tibo 横版游戏场景展示

## Status: done
## Task: 101
## Related: 097-npc-hit-targets
## Baseline Commit: 无 HEAD；原文件保存于 $TMPDIR/npc-game-scene-baseline

## Goal
将 Sam / Tibo 的基础动作、技能、受击目标和粒子放到正常横版游戏环境中展示。

## Non-goals
不修改角色模型、蒙皮及动作资源，不扩展战斗 AI 或伤害逻辑，不改其他角色场景，不提交推送。

## Acceptance Criteria
- 复用正式草地、植被、远景及洞穴生成函数，移除独立圆台。
- 原始游戏尺寸、固定 XY 镜头、左右朝向，小技能向前命中，大招覆盖两侧。
- 环境切换、暂停、重播、动作结束及对照卡不会残留旧资源或错位粒子。
- 浏览器检查和 typecheck/test/build 通过。

## Decisions
- 探索子代理已给出完整架构与生命周期方案；采用现有可玩 meadow 关卡，合并探索及设计阶段。
- 无需用户裁决的分歧，按授权直接实现。
- 世界独立组接入正式 WorldViews 与 worldLight，避免给缓存共享角色材质反复注入不同卡片的光照图。
- 模型朝向和技能空间分开：身体朝左右，效果保持横版 XY 空间与文字可读。
- 按项目规则，渲染/动画/UI 用浏览器验收，不新增自动渲染测试。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/showcase/npc-world.ts | 正式游戏地形、植被、光照与生命周期 | - | yes |
| 2 | src/app/showcase/npc-session.ts | 世界装配、横版镜头与朝向 | 1 | yes |
| 3 | src/render/npc/npc-targets.ts | 前向小技能及双侧大招目标 | - | yes |
| 4 | src/ui/showcase-panel.ts | 使用左右朝向控件 | 2 | yes |
| 5 | src/config/showcase.ts / npc.ts / src/ui/showcase-language.ts | 与实际场景一致的说明 | 2,3 | yes |

## Validation
| Command / Check | Required | Done |
|-----------------|----------|------|
| npm run typecheck | yes | 后续薯条修正交付时重新检查通过；原 Grassy TS2352 已消除 |
| npm test | yes | 初次设施失败，相关复跑26/26通过；后续薯条修正交付全量1528/1528通过 |
| npm run build | yes | 通过，372 模块，2.64 秒；既有 chunk 体积提示 |
| 浏览器地上/地下、左右、六技能、基础动作、暂停重播 | yes | 通过；控制台 warn/error 为空，截图见 evidence |
| core-review 局部审查 | yes | 独立子代理通过，无高置信度待修问题 |

## Delivery evidence
- 实现与视觉验收已完成；最初被并行修改的 Grassy 模块类型错误阻塞。后续薯条修正交付时 typecheck、全量测试及 build 均通过，因此解除阻塞。未修改 Grassy 模块。
- `evidence/game-scene-final.png`：真实草地、树木、远山中的双大招、命中闪白及粒子。
- `evidence/skill1.png` / `skill2-left.png`：前向目标与左右朝向。
- `evidence/underground-ultimate.png` / `ended.png`：洞穴世界、大招、结束后清除效果。
- `evidence/surface-idle.png` / `run-jump.png` / `walk-directions.png`：基础动作及原始游戏比例。
- 添加同角色对照、切换独立洞穴、关闭对照后主卡仍正常；临时对照已清理。
- 首轮 typecheck 报 Grassy 签名/类型错误，中间复跑遇到 human-session 编辑中的类型错误；最终已收敛为上述单个 TS2352。日志 `$TMPDIR/npc-game-scene-typecheck.log`。
- 全量测试及设施复跑日志位于 `$TMPDIR/npc-game-scene-test.log`、`$TMPDIR/npc-game-scene-facility-recheck.log`。
- 未新增渲染自动测试，未修改模型资源或 CI，未提交推送。
