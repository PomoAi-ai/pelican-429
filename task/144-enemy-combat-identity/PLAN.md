# PLAN -- 主线敌人强度与战斗特色

## Status: done
## Task: 144
## Related: 140
## Baseline Commit: e5fb3bf

## Goal
解决敌人节奏缓慢、压制不足、招式同质化。四种外围敌人与 Tibo / Sam 都需有可辨认的进攻方式、可应对的预警和攻击空档。

## Non-goals
不重做角色美术或新界面，不改主线阶段/存档契约，不提高玩家操作复杂度，不提交推送。

## Acceptance Criteria
- 敌人更快接敌与轮换技能，避免普通攻击让重装怪/Boss始终无法完成出招。
- 欧米近身夹击、巡线犬快速扑击、哨蜂空中封路、搬山重型压迫有明显区别。
- Tibo 与 Sam 有不同的真实伤害弹道/攻击循环，动作速度与伤害时刻一致。
- 所有增强保留预警与躲避方式；死亡取消攻击，阶段切换不留伤害。
- 共享模块修改同步作用于展示和游戏，不复制模型动画。

## Constraints
保留工作区已有改动；测试仅行为和回归，渲染人工验收；仅本机运行测试，不涉及CI/部署。

## Decisions
- 子代理执行探索与架构，然后按小怪、Boss/表现职责分工实现。
- 主线初版既有探索已覆盖装配与存档，本次复用该结论，不重复探索无关入口。
- 无需仅用户可裁决的问题或不可逆变更，设计直接批准并实施；统一复用原模型/动作，只同步时间倍率与技能判定。
- 修复受击反复刷新整段冷却的根因；搬山起手即霸体、收招可打断。审查发现前半蓄力仍可被连续水弹永锁，真实模拟先红后绿确认修复。
- Tibo 为多轮薯条扇射、一次可打断的治疗、两段重置地波；Sam 为锁向路由连射、高低 Token 弧线、三段扩张地波。两者半血加速只在下一次起手生效。
- 霸体仍承受伤害；地波逐波仅命中一次；金色霸体提示、低位预警与模型时间同步。
- 全量测试的两处失败均由新行为引起：音频互击断言更新为搬山新伤害/不被打断；平台通行夹具移除守卫，避免击退干扰起跳。原先平台失败时玩家已受伤且偏移，移除守卫后通行通过。
- 子代理完成小怪/Boss实现和交叉审查，未发现剩余阻断问题。测试由主代理统一执行，子代理补充对应行为验证。
- 浏览器使用 localhost 隔离检查点检查 Tibo/Sam 动作、真实掉血与小怪共享展示；测试检查点已清理，127.0.0.1 用户存档未改。临时页面零尺寸造成的小地图初始化错误在设置正常视口后消失。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/entities/enemy.ts + src/config/enemy-rules.ts | 四类小怪节奏与差异行为 | — | yes |
| 2 | src/entities/boss.ts + src/config/boss-rules.ts | 两类Boss独特技能循环及速度 | — | yes |
| 3 | src/combat/combat-system.ts + src/sim/sim-world.ts | 出招抗硬直与生命周期接线 | 1,2 | yes |
| 4 | src/render/npc/boss-view.ts + src/render/projectile-views.ts | 同步动作、预警、可辨识弹体 | 2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，修复测试类型收窄后通过 |
| npm test | yes | yes，全量1632例首跑1630通过、2失败；修复后对应facility-level 15/15、game-audio-cues 6/6通过 |
| npm run build | yes | yes，22.32秒完成，保留既有大chunk提示 |
| 浏览器人工观察技能节奏与预警 | yes | yes，桌面1280×800抽查；未做真人完整通关或手机触控难度验收 |

补充验证：enemy 37/37、boss + mainline 17/17、combat 21/21；范围内 git diff --check 通过。全仓 git status 遇到既有 Blender 资源的 Git LFS 沙箱写入限制，仅检查本次源码/测试范围；未修改美术资源、未提交推送。
