# PLAN -- 机房电流与机器互联数据流

## Status: done
## Task: 079
## Related: 078-facility-combat-readability
## Baseline Commit: 无 HEAD；本轮原件 $TMPDIR/pelican-signals-before

## Goal
让三章机房电线呈现电流传导、机器互联呈现明显二进制流、网络连接呈现数据传输。

## Non-goals
不改变角色、战斗、物理、平台、出生或敌人，不增加真实网络请求或新的依赖，不提交发布。

## Acceptance Criteria
- 电线有沿线移动的金色电流脉冲，能看出流向。
- 两台机器间有明确连接端口和强烈可读的0/1流动，NVLink和InfiniBand有可分辨的视觉效果。
- 三章均有可见连接，特效位于角色后方，不遮盖战斗与踏板边缘。
- 游戏和预览共用工厂及更新时钟，暂停/恢复与资源释放沿用现有生命周期。
- 浏览器实际检查动态效果，typecheck、全量测试、build通过。

## Constraints
遵循 AGENTS.md、dev、core-dev、Ponytail；不改 vendor；纯视觉不新增自动测试。

## Decisions
- 延续现有 FacilityKit 统一静态构件与 update/dispose；将新增信号效果集中在一个渲染模块，避免复制场景动画。
- 机柜比例和平台沿用前轮；连接路径直接写在场景工厂，端点落在设备上。
- 子代理核对真实小柜端口：在主路上方3～10格配置短折线，局部NVLink不跨越遮挡严重的中央门；深渊跨井线使用网络数据流。
- 堡垒出生区域新增两台小型接入箱，连接可见网络上行与冷却设备供电，避免入场只见树林而看不到本次效果。
- 共享效果采用图集与实例化，不新增逐粒点光源；无方案分歧，直接实现。
- 预览的暂停按钮冻结信号；游戏打开设置时环境动画继续运行，保留现有语义。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | render/facility-signals、facility-kit | 共享电流、二进制及网络传输效果 | - | yes |
| 2 | render/facility-fortress、facility-cathedral、facility-abyss | 连接设备端口，布置互联路线 | 1 | yes |
| 3 | README | 说明信号视觉含义 | 2 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | pass，exit 0 |
| npm test | yes | pass，1530 tests / 305 suites，0 failed / 0 skipped |
| npm run build | yes | pass，exit 0；保留大包与 prepare-out-dir 耗时提示 |
| 浏览器三章与预览动态、暂停及画面检查 | yes | pass，三种流动可见，预览暂停定格和恢复有效，无 console error/warn |

## Outcome
- 三章游戏及预览共用电流与数据流效果；沿实际端口连线，战斗角色与踏板边缘可辨。
- 独立审查 Approved：路径采样、反向流动、实例批次及资源释放未发现需阻断的问题。
- 截图：output/chapters/fortress-signals.jpg、cathedral-signals.jpg、abyss-signals.jpg、abyss-network.jpg。
- 仅渲染与文档改动，未新增自动测试；三项验证各执行一次，未提交或推送。
