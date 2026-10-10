# PLAN -- 半格太阳能板占格、踩踏与追光

## Status: done
## Task: 361
## Related: N/A
## Baseline Commit: 975f136

## Goal
已认可的 Python 线框图加入资源入口；透视场景使用整块宽1、高0.5、深1的太阳能板，整砖或下半砖支撑，内沿/居中/外延安装，追随太阳左右倾转，玩家踩上受力偏转、离开后渐进恢复追光。

## Non-goals
不改变经济发电、存档格式或其他场景功能；不提交、不推送。

## Acceptance Criteria
- 美术资源库与概念资料可打开已确认线框图，概念页和透视页之间有可点击入口。
- 彻底替换错误的 upper/lower 分片草稿，共享同一整板模型与真实尺寸。
- 独立透视场有六个可到达的摆放组合，沿用真实人物与控制器。
- 踩踏形变与碰撞同步；跳起/离开后不粘附，面板缓慢恢复追光。
- 类型、全量测试、构建通过；浏览器验证资源链接与实际踩踏。

## Constraints
- 内沿预留Z=[-1,-0.5]，外延预留Z=[0.5,1]；偏置板深1，分别占[-1,0]、[0,1]，不能擅自缩为深0.5。
- 普通家具的半深候选不改变太阳能板尺寸；物件半格包络不当作实心砖。
- 工作区存在大量其他未提交工作，仅修改此功能。
- 渲染/展示复用共享工厂；力矩与动态碰撞放纯逻辑层。

## Decisions
- 用户最终澄清半格是物件高度，整板受踩踏左右转动；先前分片设计作废。
- 沿用凸多边形实体碰撞，将可动薄板的实时多边形加入 solids；玩家固定步推进受力与恢复并同步支撑高度。
- 共享 BUILDING_KIT.solar 几何参数保证碰撞与模型一致。
- 保留现有太阳/光照控制，太阳目标进入纯逻辑状态，表现只应用状态角度。
- 以±22°作为本版限位，踩踏由相对支点位置决定方向，渐进恢复；仅为演示调参，不引入通用刚体系统。
- exploration/design由物理、模型、资源子代理分别完成；父代理负责布局与UI接线。可逆仓库操作无审批停止条件。

## Implementation Map
| Scope | Intent | Done |
|---|---|---|
| config/building-kit; render/building-kit; definition-furniture; homestead-view | 整板共享模型、安装支架与角度输入 | yes |
| physics/solar-panel; definition-collision; app/perspective-player; test | 真实受力/动态碰撞及回归 | yes |
| app/definition-scene-layout; definition-settlement-layout; perspective-controls; room-scene-preview; ui/room-scene-preview.css | 六组可玩装配、太阳目标与表现同步 | yes |
| config/art-library; ui/site-pages; render/resource-catalog; docs/furniture-definitions; public/concepts | 线框图资源入口与准确说明 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes：1861通过，0失败，0跳过 |
| npm run build | yes | yes |
| 浏览器：线框链接、透视踩踏/跳离/恢复 | yes | yes：原图3400×2720加载；左右压板约±11.7°；跳离解除受力；回地面渐近22°太阳目标；控制台无错误 |

## Review and evidence
- 模型审查发现悬挑支撑穿出板面，已将两种偏置支撑深度改为0.12，居中保持0.19。实际网格在±22°全角域核算，悬挑支撑不露出板面且转轴连接连续。
- 物理子代理定向测试16项通过；资源子代理执行全量1861项通过。最后几何/UI收尾后再次typecheck与build通过，未重复全量测试。
- 踩踏证据：solar-loaded.jpg。试玩通过公开UI，未注入或改写运行时状态。
- 没有提交、推送或部署；受力限位和响应速度是当前演示调参。
