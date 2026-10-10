# PLAN -- 建筑构件接入场景资源展示

## Status: done
## Task: 344
## Related: N/A
## Baseline Commit: 975f136

## Goal
在场景资源展示中查看砖块、背景墙、能量门和太阳能板的真实模型与变体。太阳能仅由面板和底座组成，总高不超过半格，不附带建筑块。

## Non-goals
不修改世界建造规则、门通行逻辑或太阳能碰撞，不提交或推送，不修改其他会话的角色、场景与家园逻辑改动。

## Acceptance Criteria
- 四类资源可在现有资源展示目录选择，有单格/拼接、开关和倾斜对照。
- 砖块1×1，背景墙薄板；门框常驻、边缘封闭，太阳能1×0.5包络且无垫砖。
- 共享render工厂，家园游戏太阳能直接复用；施工轮廓与摆放预览同步半格高度。
- 浏览器检查真实资源、变体和视角；缩略图来自真实预览。

## Constraints
蓝白科幻风格，保留现有未提交工作。不为材质或网格细节写测试，不新增CI测试。

## Decisions
- 探索与架构由resource_explore子代理完成；共享工厂由同一代理实现，主代理接入目录、预览和家园调用方。
- 建筑块与背景墙暂无运行时建造资源，作为共享渲染构件提供；不伪造碰撞与可站立行为。
- 资源默认纯资源视图，无额外场景地砖；使用现有相机与多卡对照。
- 当前需求明确且改动可回退，无需暂停确认设计。
- 浏览器修正共面闪烁：内芯、包边、封板分层；太阳能转轴缩至面板下，避免穿出电池面。门增加内嵌蜂窝屏障，默认65°检视以看到沿X通行的门洞。
- 尺寸临时检查：砖1×1×0.9，墙1×1×0.14，门1×3×1.4；太阳能水平高0.314、左右倾高0.472，所有构件最低点0（浮点误差内）。
- building_review只读审查未发现高置信度缺陷；building_checks运行全量测试并定位唯一的其他修改失败。该外部导入随后已被修正，失败文件定向复查通过。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/building-kit.ts, src/render/building-kit.ts | 四类共享构件、尺寸、变体 | — | yes |
| 2 | src/render/resource-catalog.ts, resource-preview.ts, resource-inspection.ts | 目录及工厂预览、测量网格 | 1 | yes |
| 3 | src/ui/showcase-model.ts, resource-controls.ts, showcase-panel.ts, src/app/showcase-app.ts, showcase/resource-scenario.ts | 默认视图、入口和控件 | 2 | yes |
| 4 | src/render/homestead-view.ts, src/app/homestead-app.ts | 太阳能复用和半格预览 | 1 | yes |
| 5 | public/resources/free-world/building-kit/ | 实际模型缩略图 | 2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，退出0 |
| npm test | yes | 已运行：1841/1842通过，唯一失败是其他修改中的concept-economy.html?raw导入；随后该导入改为.ts，定向复查21/21通过。未重复全量。 |
| node --test test/architecture.test.ts | yes | yes，21/21通过 |
| npm run build | yes | yes，退出0；保留已有大chunk提示 |
| 浏览器四类模型与变体人工检查 | yes | yes，检查砖/墙拼接、门开关与太阳能三倾角；output/building-solar-preview.jpg为实际预览 |

## Remaining limits
构件展示与太阳能外观已接入；没有新增站立碰撞、门触发器或太阳追踪逻辑。家园太阳能当前使用共享水平变体，左右倾角可在资源目录检查。
