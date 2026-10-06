# PLAN -- 连通自由世界与地图规模

## Status: blocked
## Task: 157
## Related: 145, 155
## Baseline Commit: 3a35077

## Goal
自由世界是一张含自然区域与三座机房的连续地图，玩家可以选择小、中、大规模；跨区域不重新创建世界。

## Non-goals
无限世界、存档系统、重写已有地形或机房模型。

## Acceptance Criteria
- 三种规模真正改变地图范围，自然区域随范围增长；同种子同规模可复现。
- 野外、堡垒、大教堂、深渊共用 TileMap、FluidMap、模拟状态，道路连续可通行。
- 区域菜单在本世界快速旅行，不刷新页面；大小和种子操作明确重新生成。
- 人形玩家、各自形象的 NPC 及对白保留。

## Decisions
- 已读取生成、装配、区域工具条和机房资源工厂；同线程 explorer 确认追加工业带能避免破坏自然地形元数据。
- 三档总宽 2048 / 3072 / 4096 格，高 192 格；默认中型。
- 三机房直接复用共享关卡与模型。嵌入世界时统一天空、机房根节点平移、动画距离计算使用局部相机，远离则隐藏停止更新。
- 区域菜单快速旅行保留同一 world；地图尺寸与种子应用时重建。GM 切换沿用重载行为并标明提示。URL 保留大小、种子、GM 和目标区域。
- 无须设计审批的停止条件，按可回退实现继续。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/free-world.ts | 尺寸与 URL 边界解析 | — | yes |
| 2 | src/world/free-world.ts | 合并自然地图和机房，道路及坐标元数据 | 1 | yes |
| 3 | src/app/game-level.ts | 自由世界入口使用统一工厂 | 2 | yes |
| 4 | src/app/free-world-navigation.ts | 同图定位网址 | 1 | yes |
| 5 | src/world/free-world-regions.ts | 机房区域纳入统一目录 | 2 | yes |
| 6 | src/app/facility-presentation.ts, src/render/facility-fortress.ts | 复用共享机房视图及局部相机 | 2 | yes |
| 7 | src/ui/free-world-toolbar.ts, src/ui/free-world.css | 大小选择与同世界旅行文案 | 1 | yes |
| 8 | src/app/game-app.ts | 同世界旅行与机房呈现装配 | 3–7 | yes |
| 9 | test/free-world.test.ts | 真实合并、连通、尺寸与可复现性 | 2–5 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器大小切换、跨区旅行和机房模型 | yes | no |
| 同线程代码审查 | yes | yes |

## Results
- 三档实际范围为 2048 / 3072 / 4096 × 192 格，默认中型。自然部分分别 1412 / 2436 / 3460 格，工业区固定 636 格。
- 工业带按堡垒、大教堂、深渊排列，以石质坡道与共享机房踏板相连；保留水量、地形形状、洞穴索引，敌人和冷却池坐标随嵌入偏移。
- 场景沿用共享模型，机房局部相机修正平移；全世界统一天空。隐藏机房灯不再占用动态光槽位。
- 快速旅行调用当前 world 的 teleportPlayer；更新 URL 不刷新；角色/世界实例不重建。
- 定向 node --test test/free-world.test.ts：5/5；node --test test/light-texture.test.ts：11/11。
- npm run typecheck 通过；npm test 1644/1644（45.69秒）；npm run build 通过，仅包体积/插件耗时提示。git diff --check 通过。
- 同线程代码审查通过；另用三档规模、8 个种子完成 48 次野外—堡垒接缝双向通行，全部通过。
- 未提交或推送。

## Blocker
浏览器启动被本次范围外的人物资源契约错误中断：src/render/grassy/grassy-rig.ts 要求 Eyelid 节点具备 Blink 和 BlinkHalf；public/characters/human/models-equipped/grassy-equipped-game.glb 现有四个眼睑节点只有 Blink。两处均未被本任务修改，按仓库范围规则保留。当前无法完成浏览器大小切换/机房视觉验收，因此未标记任务完成；没有绕过人物资源校验。

## Follow-up
后续鱼群容量修复（163）已恢复浏览器启动。实际验证中型地图堡垒与大教堂间快速旅行，以及大型4096×192地图生成和湖区旅行；此前人物BlinkHalf启动错误在当前工程已不再出现。鱼容量修复及验收见 task/163-fix-world-fish-capacity/FIX.md。
