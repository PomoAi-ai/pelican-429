# PLAN -- Grassy 横版移动与空中实战

## Status: completed
## Task: 114
## Related: 099
## Baseline Commit: 无 HEAD；src/test 快照位于 $TMPDIR/grassy-side-combat-before

## Goal
将 Grassy 全部动作放入横版游戏场景，加入真实受击对象；四种键盘攻击支持站立、移动和飞行。调整侧面键盘背负、握持与挥击的可读性。

## Non-goals
不重新制作人物造型，不改 vendor，不提交推送，不调整其他角色技能。

## Acceptance Criteria
- 横版地形场景中展示呼吸、走、跑、跳、骑行、起飞、悬停、前飞、降落及四攻击。
- 攻击对象实际扣血、受击和击退；地面移动与空中移动可同时使用攻击。
- 普攻保持单手短端握持、左右击打；侧面可看到键盘厚度和挥击幅度。
- 正式游戏与展示场复用逻辑、模型、动画与特效。

## Constraints
使用 dev / core-dev / Ponytail Full。纯逻辑行为使用现有测试，渲染与 UI 在浏览器验收。保留其他任务的改动。

## Decisions
- 三个同会话子代理分别实现真实战斗逻辑、共享上下身动作叠加和横版展示场。
- 人形默认使用真实 SimWorld；保留模型查看切换。展示场输入驱动与正式游戏共用控制器、碰撞、伤害、模型及粒子。
- Codex/Bug 使用实际弹体实体，关闭角色附带的展示弹幕；超载使用真实范围伤害。
- 下身支持走跑、跳跃与飞行，上身独立施法；普通攻击交替左右单手挥击。

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | passed |
| npm test | yes | 1566 passed; one load-sensitive worldgen timing failed initially, isolated failing case rerun passed without changing threshold |
| npm run build | yes | passed; existing chunk size warning |
| 横版场景实拍：全部动作、移动攻击、空中攻击与扣血 | yes | passed; evidence/side-combat |
| 独立审查 | yes | passed; fixed bird-state contract and reverse-strike fake impact timing |

## Implementation
- 默认入口 `/?mode=showcase&demo=grassy-side-combat`，原人形动作入口同样默认横版。保留模型旋转查看和三档质量。
- 新增 human-combat 共享逻辑、codexShot/bugShot实体与机械光弹视图；实际碰撞、击退、受击火花与粒子拖尾共用游戏路径。
- 动作组合器从 flight-pose 改名为 motion-pose，下身移动独立于攻击上身；单手普通攻击按次数交替左右。
- 背负围绕键盘长边倾斜约30度，移除后移；超载机柜以场景方向展开，避免侧面遮住主角。
- 场景驱动只产生输入，假人损伤均由模拟结算。悬停/前飞不读取隐藏的地面跑步设置，手动飞行时镜头继续跟随高度。

## Verification evidence
- `node --test test/showcase.test.ts` 28/28；覆盖真实移动/骑车/落地、16种左右地面/前飞攻击和隐藏移动设置回归。
- human-combat及相关控制器/变身/武器/架构定向检查110项通过；独立审查48种攻击组合均有真实命中。
- 浏览器验证world/model与轻量/标准档切换，手动Space跳跃和1/2技能响应；未捕获应用错误。逐项查看13动作、两次近战、跑步Bug、悬停Codex/Bug、飞行超载。图片保存于 `assets/characters/grassy/model-equipped/evidence/side-combat/`。
- 全量 `npm test`：1567项，1566通过，worldgen耗时用例初跑1198.8ms；单文件复跑509.9ms；最后仅复跑失败用例 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 通过。未修改用例或阈值。
- 代码实现与视觉验收完成，未提交或推送；保留其他任务同期改动。
