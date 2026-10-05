# PLAN -- Sam 模型路由攻击

## Status: done
## Task: 105
## Related: 094, 101, 104
## Baseline Commit: 无 HEAD；原文件保存于 $TMPDIR/model-routing-baseline

## Goal
把 Sam 第一技能做成明确的 GPT-6 Astra 分流到 GPT-5.6 Luna / GPT-4o mini 的模型路由攻击，包含可读标签、分流过程、命中及夸张游戏助威。

## Non-goals
不改模型/蒙皮/GLB动作，不接真实服务路由，不新增技能槽，不改 Tibo 或其它技能，不提交推送。

## Acceptance Criteria
- 第一技能入口明确命名为模型路由攻击，场内显示来源与两个目的模型。
- 可读箭头展示分流，两类带模型名称的能量弹命中前方目标，左右朝向均正确。
- 夸张文字助威和命中粒子同场出现，结束/重播不残留。
- 浏览器视觉验收以及 typecheck/test/build 通过。

## Constraints
复用共享 NPC 特效、字幕、已有命中时间轴和目标；不新增依赖，不对渲染编写自动测试。模型名是游戏设定，文案不宣称真实产品路由事实。

## Decisions
- 延续此前已探索的共享 effects → animator、targets → showcase 接线；本次文件级方案完整，合并探索和设计阶段。
- 源模型在角色上方，分流模型在两侧，通过箭头及能量流明确连线；真实攻击由现有前向命中路径承接。
- 子代理负责带模型名的弹道及资源释放，主代理负责分流图、助威与入口说明。
- 无需用户裁决的分歧，直接实现。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/npc/npc-effects.ts | 源/目的模型、分流箭头和助威；复用字幕导出 | - | yes |
| 2 | src/render/npc/npc-targets.ts | 模型标签随命中弹道飞行 | 1 | yes |
| 3 | src/config/npc.ts / src/ui/showcase-language.ts | 技能入口及中英文说明 | - | yes |

## Validation
| Command / Check | Required | Done |
|-----------------|----------|------|
| npm run typecheck | yes | 最终通过 |
| npm test | yes | 1528/1528通过，300 suites，81.609秒 |
| npm run build | yes | 最终通过，3.20秒；仅既有chunk体积提示 |
| 浏览器右/左、命中、结束、重播和其它技能切换 | yes | 通过；截图见evidence，控制台warn/error为空 |
| core-review 局部审查 | yes | 独立子代理通过，无高置信度待修项 |

## Delivery evidence
- `evidence/model-routing.png`：最终版本，Astra→Luna/mini分流图、两色带名实体弹、前方命中、顶部助威，旁边Tibo薯条攻击保持正常。
- `evidence/left.png`：反向弹道、文字不镜像、两只目标命中。
- `evidence/ended.png`、`evidence/switch-skill.png`：技能结束及切换后路由图与带名弹体清除。
- 浏览器迭代把助威移至顶部，飞行模型标签移到弹体下方并加宽，避免与静态分流图和左向目标重叠。
- 全量测试后仅调整字幕位置/宽度/透明度，复跑typecheck/build与视觉检查，未重复全量测试。
- 日志位于 `$TMPDIR/model-routing-{typecheck,test,build}.log`。
- 未新增渲染自动测试，未改模型文件、其它角色技能或CI，未提交推送。
