# PLAN -- 通用传送动画

## Status: done
## Task: 234
## Related: N/A
## Baseline Commit: 8a8fe8c

## Goal
把已确认的 Sam 传送分镜实现成共享效果，覆盖 Sam/Tibo 战斗闪现与玩家地图、区域传送。

## Non-goals
不修改伤害、技能轮换、模型资源；死亡重生、出生定位和剧情独立动画不作为战斗传送。

## Acceptance Criteria
- 所有运行中的主动传送先显示落点预告和青白分段环，再全身同步消散、移动、重组、淡出。
- 不缩放角色、不自下而上扫描；携带装备一起消散；法杖保持持握。
- 共享特效模块，源点残影保持原地；失败/取消/暂停/重复操作正常清理。
- 玩家安全落点规则保留，相机在实际移动时切换；Boss 落点再次校验与战斗时序保留。

## Constraints
仅使用现有 Three.js，无新依赖；不覆盖仓库已有未提交改动；无提交推送。

## Decisions
- 使用显式模拟状态驱动特效，不把普通位移误识别为传送。
- 概念参考保存为 evidence/teleport-concept.png。
- 委派逻辑路径探索与视觉模块实现；主代理接入视图、浏览器验收。
- 探索与架构结论：Entity.teleport 记录起点、目标、阶段与实际移动结果；Boss 保留现有安全落点和前摇时长，玩家交互传送前摇 24 tick。出生定位单独保留立即放置语义。
- 相机通过实际移动事件切换，失败落点不显示假重组；模型实例材质隔离，静态残影仅在传送起手快照一次。
- 需求与实现路径明确，不存在需用户裁决的分歧或不可逆操作，直接实施。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | entities / sim teleport paths | 公共传送状态、生命周期与安全移动 | — | yes |
| 2 | render/teleport-effect.ts | 共享环、数据化、残影、重组效果 | 1 | yes |
| 3 | render player/boss views | 绑定共享效果 | 1,2 | yes |
| 4 | app game/frame loop | 传送请求与相机同步 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes · 1764/1764 |
| npm run build | yes | yes · 3.58s，已有大 chunk 提示 |
| 浏览器检查 Sam/Tibo/玩家传送阶段及恢复 | yes | yes · 实际共享视图与模拟逐帧夹具，四种角色路径无控制台错误 |

## Result
- 独立审查已核对逻辑、取消/失败、镜头和材质恢复；补齐 InstancedMesh.dispose 的资源释放。
- 浏览器证据：evidence/sam-reassembly.png、tibo-reassembly.png、pelican-reassembly.png。原点冻结残影与落点重组正常，结束恢复原材质。
- 玩家前摇 24 tick，移动后 8 tick 恢复控制、16 tick 特效清理；Boss 保留原战斗时间配置。
