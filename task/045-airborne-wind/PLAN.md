# PLAN -- 暴风影响空中角色

## Status: done
## Task: 045
## Related: 043-wind-controls
## Baseline Commit: 无 HEAD；代码与测试快照 $TMPDIR/pelican-air-wind-before

## Goal
角色跳起、飞行或下落时受到暴风横向推动，方向与场景风场一致。

## Acceptance Criteria
- 暴风使空中角色顺风漂移，逆风输入仍可调整位置。
- 地面和水中角色不被空中风力推动，正常碰撞仍生效。
- 同一风配置、种子与输入得到相同模拟结果，不依赖渲染帧率。
- 风场公式和配置由游戏模拟与渲染共用，不复制另一套风。
- 设置与调试切换作用于实际物理和场景。

## Decisions
- 先探索共享风场与固定步长接线；避免把上一渲染帧采样结果直接喂给模拟。

## Validation
- [x] `npm run typecheck` 通过。
- [x] `npm test`：1499/1499 通过，无失败或跳过。
- [x] `npm run build` 通过；有产物体积超过 500 kB 的提示。
- [x] 独立 core-review / diff-guard 审查通过，无需修改的确定问题。
- 浏览器视觉验收仍受前序URL安全策略限制，不绕过。

## Implementation
- CPU风公式与控制器提取到world/wind，GLSL/uniform适配留在render；所有调用方同步，无旧接口别名。
- 模拟环境持有共享风控制器并以tick时间推进，游戏视图只读；独立展示场仍自驱动。
- 暴风空中速度偏置加入走跑/骑车目标，系数player.airWindSpeed=1；普通风保持原移动，屋顶遮挡、水中、地面不施加空中偏置。
- 设置中风场随模拟暂停，关闭设置后继续过渡；避免视觉帧率进入物理。
- 子代理风/树/降水/架构专项112/112，人物控制36/36、走跑/骑车/游泳70/70通过。
