# PLAN -- 全类型连通大场景

## Status: done
## Task: 377
## Related: 375
## Baseline Commit: 975f136

## Goal
把透视大场景做成覆盖现有已定义类型的连贯可玩世界，各构件承担通行、建筑、景观或观察用途，不用机械陈列凑数。

## Non-goals
本次不虚构采矿产出、家具生产、植物生长和流体玩法，不新增第二套模型。仅有资料草案、没有游戏资源的生长状态不伪称已实现。

## Acceptance Criteria
- 保留全部房型、三种二层结构、实体/墙窗/平台规格，家具满深与半深、太阳能、三种水体和三类岩土都在同一场景。
- 主街可骑行，地面路线、屋顶路线和自然区域互相连通，空岛能上能下；不靠菜单传送才可访问。
- 取消墙型散摆与任意基础轮廓排列，将定义用于建筑窗洞、桥基、坡岸、矿洞和遗迹。
- 复用自然景观和游戏资源，保留玩家中线、自由视角、无限飞行、技能及平台不遮挡。
- 目录说明每区用途及现有交互的实际范围。

## Constraints
保留其他会话未提交改动；不改 vendor；不提交或推送。

## Decisions
- 使用 dev 工作流，探索与设计子代理核对覆盖，根代理负责布局装配和通行验证。
- 优先复用已建立的共享模块；没有不可逆操作或必须由用户裁决的方案分歧，直接推进。
- 场景扩展为 240 格连续主街、14 个定位分区；地下矿道两井相通，空岛两侧平台可正常跳跃往返。
- 33 种实体、28 种墙窗、18 组平台、12 种普通家具的满深/半深与太阳能三姿态全部保留；六房型、11 拼接、三岩层、三水池与六种景观共同装配。
- 大场景贯通门净高 3.5，以容纳游戏自行车 3.3 的净空；共享门构造总高仍为 4，独立定义样例保持净高 3。渲染与碰撞使用同一尺寸。
- 审查修正重复岩肩、悬空半墙、吊灯和埋地树根；背景景观不参与主路碰撞。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/definition-settlement-layout.ts | 连通区域、用途、全部组合装配 | - | yes |
| 2 | src/app/settlement-landscape.ts | 复用自然与分层景观 | 1 | yes |
| 3 | test/definition-settlement.test.ts | 扩展真实通行回归 | 1 | yes |
| 4 | src/app/room-scene-preview.ts | 移除由新景观统一管理的旧树林 | 2 | yes |
| 5 | src/render/definition-kit.ts、src/app/definition-scene-layout.ts | 共享门净高支持贯通骑行，保留定义样例尺寸 | 3 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | passed |
| npm test | yes | 1875 passed / 0 failed |
| npm run build | yes | passed，仅既有 chunk size 提示 |
| 浏览器验证连通世界与观景 | yes | 矿道/空岛/海岸、骑车/飞行/技能、镜头跟随；error 日志为空 |
| diff-guard / git diff --check | yes | passed |

## Review
- 通行子代理新增 3 项实际输入回归，发现并验证修复骑行门楣阻挡；连同原 2 项共 5 项通过。
- 复核子代理确认覆盖完整、资源释放成对、无运行时循环依赖；最终审查无阻止交付问题。
- 浏览器结果截图：`/tmp/settlement-connected-mine.png`、`/tmp/settlement-connected-island.png`。
- 未提交或推送；未新增采矿、游泳、生产与植物生长系统。
