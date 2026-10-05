# PLAN -- 头顶模型路由与 Token 弹道导弹

## Status: done
## Task: 119
## Related: 112, 115, 117
## Baseline Commit: 无 HEAD；修改前文件在 $TMPDIR/npc-token-baseline

## Goal
模型路由光线从头顶 GPT-6 Astra 核心发射；Sam 第二技能以 Token 弹道导弹表达算力攻击。

## Non-goals
不扩展玩家实战或 NPC AI；不改 Tibo、大招、角色资产或其他并发工作。

## Acceptance Criteria
- 头顶核心、光束和弹道共用源点，斜向下射向目标，人体不再作为路由发射点。
- 路由保留真实首个碰撞、目标跳跃躲避、左右镜像、命中才在身体显示型号。
- 算力技能呈现多枚 Token 弹体，沿不同弧线连发、带尾迹、命中碎解，区别于路由光线。
- 场景文字最多保留简短「算力」或 TOKEN 标记，没有技能过程解说。
- 暂停、重播、切换动作与资源释放正确，相关测试及浏览器验证通过。

## Constraints
复用模型、训练靶、粒子和命中效果；不新增运行时依赖，不修改 vendor。

## Decisions
- 前序探索已经明确共享效果与展示场装配；本轮两名子代理分别探索并实现路由源点和 Token 弹体。
- 复用固定时间轴与现有技能碰撞/受击入口，不新增通用武器系统。
- 可回退的本地修正，无需设计审批。
- Token 六枚按 0.18 秒间隔发射，0.6–0.7 秒飞行，末次 2.9 秒命中、3.5 秒完成碎解，展示时长 3.6 秒。
- 躲避模式的路由末次命中按剩余技能时间压缩淡出，避免结束时截断粒子。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/npc.ts, src/render/npc/npc-effects.ts | 共享头顶源点、动作说明和时间 | yes |
| src/combat/model-routing.ts, test/model-routing.test.ts | 头顶斜向光束、实际碰撞与回归测试 | yes |
| src/render/npc/npc-token-missiles.ts | Token实体弹体、尾焰与碎解 | yes |
| src/render/npc/npc-targets.ts | 路由姿态与尾迹、Token抛物线和命中联动 | yes |
| src/ui/showcase-language.ts | 同步技能说明 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| node --test test/model-routing.test.ts | yes | 6/6 通过 |
| npm run typecheck | yes | 最终改动后通过 |
| npm test | yes | 1566/1567 通过；下述性能检查未通过 |
| npm run build | yes | 最终改动后通过；已有包体大小提示 |
| 浏览器检查两招、左右朝向、躲避、切换和结束 | yes | 通过；控制台无 error/warn，截图在 evidence/ |
| 子代理审查 / diff-guard | yes | 末次粒子截断已修复，复核无新增问题 |

## Verification limitation
- 全量测试唯一失败为 `test/worldgen.test.ts` 生成耗时门槛：中位数 582.5ms > 250ms。当时本机至少四套全量测试并发。
- 仅复跑 `node --test test/worldgen.test.ts`：28/29 通过，中位数 293.2ms，仍未达到 250ms。没有修改门槛、断言或地图生成代码；不能宣称全量测试全绿。
- 日志 `$TMPDIR/npc-token-attacks-test.log` 与 `$TMPDIR/npc-token-worldgen-recheck.log`。本轮路由纯逻辑、类型检查、构建和浏览器验收均通过。
- 未提交、推送或部署。没有添加渲染/UI/文案常量测试。
