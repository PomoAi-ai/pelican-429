# PLAN -- 全定义透视场景

## Status: done
## Task: 355
## Related: N/A
## Baseline Commit: 975f136

## Goal
保留全定义分区对照场，并新增一个把所有已定义组合融入房屋、道路、坡地、连廊和设施的完整聚落场景，放入当前男玩家。

## Non-goals
不扩展未定义的家具或任意组合，不实现游戏建造、经济、碰撞和通行规则，不提交推送。

## Acceptance Criteria
- 覆盖形态、拼接、墙窗、平台、房屋、门、家具已定义组合，包含选做与已画出的参考形态。
- 当前男玩家复用游戏模型、尺寸及动画，替换旧试摆中的 D1。
- 同一场景可旋转、缩放、分区定位，并有完整覆盖清单。
- 实体深1、墙厚0.2、平台居中；尺寸草案按资料示例展示。
- typecheck、全量测试、build 通过，并进行浏览器目视核对。

## Constraints
保留工作区已有修改；只调整本任务文件。模型与几何放在共享 render/config 模块，场景只装配。不新增渲染自动测试。

## Decisions
- 用户验收分区对照方式，同时要求再做整体融合场景；新增resources&scene=settlement，原room入口保留。整体场景默认全景，不再以样品方阵陈列。
- 复用已完成的探索与架构、共享构件和房屋装配，仅新增聚落布局和同页面变体；无需重做探索。
- 用户已明确所有定义好的组合都加入，覆盖旧资料中的优先级排除说明。
- 复用现有 resources&scene=room 入口，避免增加路由。
- 探索分为定义覆盖清单与场景资源架构两个子代理。

- 探索/架构结论：现有试摆误用D1，旧building-kit尺寸与新定义不符；新增共享定义工厂，保留既有玩法碰撞。
- 所有定义已明确，没有需要用户裁决的架构分歧，直接实施；三个子代理分别完成定义工厂、共享家具和场景装配。
- 采用13个常驻分区、6种有效房屋；不放已废弃的两层半砖偏移墙格。
- 家具原有家园调用迁移到共享工厂，保留功能状态；存档中的2格机器人坞在家园按旧占格适配。
- 仅渲染/装配/UI变更，不新增锁定几何细节的自动测试；用既有全量检查和浏览器目视验证。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/definition-kit.ts | 33实体/28墙窗/18平台定义 | - | yes |
| 2 | src/render/definition-kit.ts | 统一深度共享构件工厂 | 1 | yes |
| 3 | src/render/definition-furniture.ts | 12类家具共享工厂 | - | yes |
| 4 | src/render/homestead-view.ts | 游戏复用家具工厂 | 3 | yes |
| 5 | src/app/definition-scene-layout.ts | 完整分区组合装配 | 2,3 | yes |
| 6 | src/app/room-scene-preview.ts | 男玩家、目录、镜头及检查控制 | 5 | yes |
| 7 | src/ui/room-scene-preview.css | 目录与透视视口布局 | 6 | yes |
| 8 | src/ui/showcase-panel.ts | 资源页入口文案 | 6 | yes |
| 9 | src/ui/site-pages.ts | 定义页入口文案 | 6 | yes |

| 10 | src/app/definition-settlement-layout.ts | 全部组合融入连续聚落 | 2,3,5 | yes |
| 11 | src/app/showcase-app.ts | 整体场景入口 | 10 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes：1842/1842，通过 |
| npm run build | yes | yes |
| 浏览器目视核对场景、男玩家与分区入口 | yes | yes |

## Final Decisions
- 整体聚落实体范围79×25.5格，六种房型组成街区，温室、集市、工坊、三条平台路径与连续地台融为一景；默认展示全景。
- 已核对33实体、11拼接、28墙窗、18平台、12家具两终端、左右门与太阳能三倾角均有实际摆放，不含仅有名称而未定义的未来功能。
- 子代理审查发现的楼板吞平台、立柱穿电池、同格重叠与右门净洞受阻已修正；临时装配检查679实体格无重复、平台与实体XY包围无正面积交叠。
- 浏览器复验整体场景、男玩家近看、花房/集市定位、分区场返回及墙窗线框；最终页面控制台无错误。
- 保留工作区其他工作新增的家具深度与对照交互，不在本任务中移除或扩展其方案。
- 无新增渲染自动测试；没有提交、推送或部署。
