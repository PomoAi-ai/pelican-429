# PLAN -- 高台与交错水城住宅

## Status: done
## Task: 554
## Related: 548, 550
## Baseline Commit: 47a8232a

## Goal
独立 AI 住宅 4：玩家仍在原来的横版建造面，背景是低于高台的三维未来水城。依据用户的城市参考图制作建筑造型、近中远层次及水道与街区交织的空间，不要求夕阳。住宅 3 保留为历史。

## Non-goals
不修改横版碰撞或建造规则，不覆盖住宅 1/2/3，不固定夕阳，不制作天空飞行器，不制作独立地穴，不发布。区域间切换暂沿用原有体系，本次制作完整宽度城区。

## Acceptance Criteria
- 独立入口与存档，保留原住宅和地下室玩法。
- 玩家建造面高于江面，近处可见低层住宅、屋顶、街区与桥；中景地标和远城逐层展开。
- 建筑有真实体积并落在岛岸陆地上，水道从岛岸间穿过，不能退化成整片湖加一排对岸楼。
- 浅层窗外见同一片三维外景，深层由地层遮挡。
- 保留昼夜、天气、列车；不新增天空飞行器。
- 验收地表、浅地下、深地下和城区左右端。

## Decisions
- 用户已确认方案，直接实施；前期探索和入口/存档实现沿用，无需重复派工。
- 使用共享岛岸布局供岸线和建筑定位，所有背景使用世界坐标；建造面不旋转，只有住宅 4 的跟随镜头构图偏移为 3.8。
- 岛岸包含近处花园住宅岛、中景公共街区、地标岛和远岸；只在最远处使用连续陆地。岛岸内有绿地、步道和花槽，跨河桥下保留连续水面。
- imagegen 生成日光建模参考板，保存为 public/art-library/residence-four-river-city/daylight-modeling-reference.png；实际场景是几何模型，未用整幅城市图替代三维。
- 城市与主地标仍采用游戏现有批处理、建筑构件和树模型。暖白实体框架配低饱和玻璃，住宅有退台和内退窗洞；主塔带悬挑花园，远城按疏密不同的簇组织。
- 新环境撤去独立夕阳叠图，复用共享昼夜天空；交通只传入轨道，不放置背景飞行器。现有玩家宠物不属于背景飞行器。
- 子代理完成城市布局/造型、独立入口和只读审查；主代理完成岛岸/桥、水面、天空接入及浏览器验收。审查发现的岛岸与铺装共面问题通过错开 .025/.05 高度修复。
- 渲染不添加网格/材质断言；沿用并扩展独立存档行为测试。

## Implementation Map
| File | Intent | Done |
|------|--------|------|
| src/render/residence-four-layout.ts | 共享岛岸坐标和轮廓 | yes |
| src/render/residence-four-city.ts | 花园住宅、公共街区、地标、远城与植被 | yes |
| src/render/residence-four-environment.ts | 高台、岛岸、桥、交错水面及列车 | yes |
| src/render/residence-four-sky.ts, residence-four-atmosphere.ts | 共享昼夜天空和远景空气层次 | yes |
| src/config/residence.ts, src/app/scene-catalog.ts, residence-save.ts, residence-app.ts | 独立入口/存档和分层标签 | yes |
| test/residence.test.ts | 住宅存档隔离行为 | yes |

## Validation
| Command / check | Result |
|-----------------|--------|
| npm run typecheck | 通过 |
| npm test | 2041 tests / 304 suites passed, 0 failed |
| npm run build | 通过；已有 chunk > 500 kB 提示 |
| 浏览器地表与城区两端 | 通过；无露出水体边缘，远近街区、水道和高台可见 |
| 浏览器浅地下与深地下 | 通过；第一层窗外见水道/街区，深部为实土地层 |
| 浏览器控制台 | 无 error |
| 只读审查 | 岛岸共面问题已修复；未发现其他阻断项 |

## Evidence
- evidence/daylight-river.png：日光下可玩高台与交错水城。
- evidence/river-basement-window.png：浅地下窗口看到实际河道。
- evidence/river-underground.png：深层地层遮挡。
- evidence/river-left-edge.png、river-right-edge.png：城区两端覆盖。
