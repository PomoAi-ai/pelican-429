# PLAN -- 堡垒入口遗迹与浮岛背景

## Status: done
## Task: 096
## Related: 080, 088
## Baseline Commit: 无 HEAD；本次修改前文件保存在 $TMPDIR/pelican-fortress-ruins-before

## Goal
按用户参考图将机房堡垒前方改成冷蓝云海、浮岛远堡、苔藓石台与蓝色传送门的遗迹入口，接入真实场景。

## Non-goals
不复制截图 HUD、角色或五线谱；不改变另外两个机房与普通游戏；不增加敌人。

## Acceptance Criteria
- 游戏入口和独立预览共用背景、遗迹、传送门、灯光。
- 近处地面保持普通方块厚度，外围桥面与实际碰撞一致，入口通路和平台下穿保留。
- 云海有远近层次；入口可见且角色可辨；保留室外雨夹雪与室内遮挡。
- 资源加载失败明确暴露，资源正确释放。

## Decisions
- 使用现有岩石/苔藓资源绘制近景，Imagegen 生成独立远景背景图，不把参考截图铺成整屏。
- 保留现有地图坐标与连续通路，避免扩大为关卡重设计。
- 使用 dev 流程；探索子代理复核共享资源与接入点，设计在探索中完成，无需用户审批的不可逆操作。
- 渲染视觉不新增网格或源码断言测试；使用浏览器验收与现有通行/天气测试。
- 移除外围大树与室外小机柜，用原地形草顶石块、共享岩石/攀附植被和石桥承接入口；行走面深度保持普通方块的 -1～0.5。
- 远景为内置 Imagegen 生成的 1774×887 图片，提示词保存在 assets/environments/fortress-sky-realm-prompt.txt。固定单背景平面随镜头缓慢视差移动，近景新增两组石块实例与一组苔藤，动画只更新时间 uniform，沿用原6灯光源池。
- 图片加载失败经两个入口的错误边界报告；页面加载期间退出后释放新资源并停止装配。复核发现此生命周期问题后已修复，最终结论 Approved。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | public/environments/fortress-sky-realm.png | 云海浮岛远景资源 | — | yes |
| 2 | src/render/facility-approach.ts, facility-sky.ts | 近景遗迹、门户与远景层 | 1 | yes |
| 3 | src/render/facility-fortress.ts | 装配外围并替换维护桥外观 | 2 | yes |
| 4 | src/app/facility-presentation.ts | 共享加载与冷蓝灯光 | 1 | yes |
| 5 | src/app/facility-app.ts, game-app.ts, facility-environment.ts, src/main.ts | 启动接入与替换默认远山 | 4 | yes |
| 6 | src/world/facility-level.ts, src/config/facility-scenes.ts, src/ui/facility-minimap.ts | 外围布景与入口导览 | 3 | yes |
| 7 | README.md | 更新场景说明 | 6 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes；最终修复后复查通过 |
| npm test -- --test-concurrency=4 | yes | yes；1535 tests / 305 suites 全通过；修复后 facility 两文件21例通过 |
| npm run build | yes | yes；最终修复后通过，保留已有大包警告 |
| 浏览器检查游戏出生点、预览入口与室内 | yes | yes；两入口正常、室内设备可见、无 console 错误/警告，截图 output/chapters/fortress-ruins-approach.jpg |
| 子代理范围审查 | yes | yes；Approved |
