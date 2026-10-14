# PLAN — 住宅左右对称扩场

## Status: done
## Task: 420
## Related: 412, 413
## Baseline Commit: d2d72f4

## Goal
主院区两侧有同样长度的可玩场景，人物从入口向左也能进入完整地面与多层景观。

## Acceptance Criteria
- 保留0…1280的既有院区与存档坐标，左侧补齐9个128格分段，世界范围-1152…1280，总宽2432；主院区0…128左右各9段。
- 左侧可走、可建造、有庭院家具和跳台；出生点附近及左端有安全落脚点。
- 左侧地面、水面、花草、建筑、远景、列车与昼夜表现完整，按镜头分段加载。
- 展示场与住宅建造的世界边界、网格、镜头、分段跳转同步。
- 旧存档坐标不迁移，负坐标资源可保存恢复。

## Constraints
- 使用已有共享资源与分段工厂；不重新绘制房屋，不改家具与人物比例。
- 不新增渲染细节测试，验证实际负坐标放置、移动、落脚与存档行为。

## Decisions
- 子代理已合并完成探索及设计，触达清单明确；主代理复核后直接实现，无需额外设计轮。
- 按主院区为中心两侧各9段，避免不完整渲染段；出生点仍按实际门口选安全位置，扩大其左侧可走区域。
- 保留原存档，新增负坐标合法范围不需要格式迁移。
- 世界总宽不再等于右边界，所有相关调用使用显式minX/maxX。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/residence.ts | 世界边界与统一分段目录 | — | yes |
| 2 | src/sim/residence.ts | 负坐标放置、边界、出生索引、左侧实体 | 1 | yes |
| 3 | test/residence.test.ts | 跨零点行走、左端落脚、负坐标保存与出生 | 2 | yes |
| 4 | src/render/ai-city-environment.ts | 负段加载、列车正相位 | 1 | yes |
| 5 | src/app/residence-app.ts | 镜头、网格、游玩边界、分段传送 | 1 | yes |
| 6 | src/app/room-scene-preview.ts | 分段目录与出生区域取景 | 1 | yes |
| 7 | src/app/definition-scene-layout.ts | 住宅描述与其他分区起点 | 1 | yes |
| 8 | src/ui/residence-hud.ts | 总宽与左右分段选项 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/residence.test.ts | yes | yes |
| npm run typecheck | yes | yes |
| npm test（原有架构文案误报单独记录） | yes | yes |
| npm run build | yes | yes |
| 浏览器左右区域、负段远景与出生/传送验证 | yes | yes |
| 子代理只读复核与git diff --check | yes | yes |

## Validation Results
- 子代理先运行4个定向用例，均复现负坐标放置、跨零点或左端落脚缺陷；修复后`node --test test/residence.test.ts`为19/19通过。
- `npm run typecheck`通过；`npm run build`通过，保留原有大chunk提示。
- `npm test`为1904项，1903通过、1项原有失败：`test/architecture.test.ts:232`的文本扫描把`src/config/art-library.ts:606`描述里的英文“window”误判为DOM调用；本任务未改这些文件。
- 浏览器已核对展示场左侧第1段、左侧第9段、右侧第9段，日间分层景观与夜间月亮/星空/灯光完整，两页面运行日志未见error。
- 住宅游戏模式传送至左侧第9段，人物实际向左移动并站稳；旧存档保留原家具布局，新示例左右段含休息区、能源设备及跳台。
- 只读子代理复核8个触达文件及调用链：负索引、存档、碰撞、相机跟随、负分段列车相位均通过。
- 全景人工检查发现斜视投影右端超出视野，临时投影断言复现右端NDC=1.108；给住宅全景留20%距离余量，两页面同步，随后重跑类型检查和构建均通过，浏览器重看住宅全景确认实际地面两端进入画面。

- `git diff --check`通过；最终镜头仅属表现修正，未重复运行已完成的逻辑全套测试。

## Evidence
- `assets/concepts/ai-city-residence/residence-left-expansion-day.png`：展示场左侧第1段。
- `assets/concepts/ai-city-residence/residence-far-left-night.png`：展示场左侧第9段夜晚。
- `assets/concepts/ai-city-residence/residence-left-gameplay.png`：住宅游戏左侧第9段。

- `assets/concepts/ai-city-residence/residence-expanded-overview.png`：扩大后全景与两端。

## Limits
- 旧存档不自动追加示例家具，以免改变用户布局；新增地面、边界和环境直接可用，左侧支持继续建造。
- 未做长时间性能压力测试，仍沿用现有按镜头加载/卸载分层场景的策略。
- 未提交或推送。
