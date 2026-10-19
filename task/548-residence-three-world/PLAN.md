# PLAN -- 住宅3三维湖岸

## Status: completed
## Task: 548
## Related: 517
## Baseline Commit: a13fdd68

## Goal
新增 residence-3，保留住宅2的横版玩法层、碰撞与住宅布局，后方使用真实三维湖岸和城市。地表连接背景，浅地下可看到部分外景，深地下由岩层遮蔽。

## Non-goals
不修改住宅1/2构图，不改变角色操作或二维物理，不提交、推送或部署。

## Acceptance Criteria
- 独立目录入口与状态；保留现有住宅机制及天气日夜。
- 水面为水平几何，楼群有厚度，随相机产生真实透视和遮挡；水域开阔。
- 实体岸边承接玩家地表；浅地下留出采光空间，深层岩壁遮挡外景。
- 浏览器检查正常游玩、斜视、地表及地下；相关命令通过。

## Decisions
- 按 dev 流程执行；入口探索与共享渲染架构分别交由子代理核对。
- 复用已有实例批次、实体建筑、车辆、水面和前景工厂；只新增住宅3装配，不复制玩法。
- 原画层继续供住宅2使用；住宅3建筑和湖面不使用面向镜头的图片。
- 不引入新的镜面二次渲染，避免进一步放大已有低帧率问题。
- 湖面位于 y=-3，对岸 z=-180；实体街区位于 z=-218/-355/-570，独立空气透视，避免住宅近距雾截断远城。
- 主院区后方岸台留露天开口，下沉庭院底面 y=-10；岩层背板在同一高度承接，避免从庭院底部透出天空。该上下沿参数仅住宅3使用，住宅1/2保持原值。
- 子代理分别完成入口与存档隔离、只读结构复核。复核提出的连续顶板遮光及背板延伸影响旧版问题均已修正。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/residence-three-environment.ts | 独立三维背景与表层衔接 | yes |
| src/config/residence.ts; src/app/scene-catalog.ts | 新增住宅3 variant 与入口 | yes |
| src/app/residence-app.ts; src/app/residence-save.ts | 复用玩法、隔离存档 | yes |
| src/render/residence-terrain.ts | 仅住宅3浅地下背板让出视线 | yes |

## Validation
- npm run typecheck: passed，最终浅庭院接缝调整后再次通过。
- npm test: 2037/2037 passed。
- node --test test/residence.test.ts: 50/50 passed（新增第三版存档隔离覆盖）。
- npm run build: passed；保留共享工程的大 chunk 提示。最后仅调整背板上沿数值与 const tuple，此后跑 typecheck，未重复全量测试与构建。
- 浏览器：地表、斜视、住宅全景、地下64格、夜景、正午雨天均查看；雨天截图可见浅庭院以下窗口已被岩层遮蔽。未见控制台 error。
- evidence/ 保存地下、夜景、雨天记录；入口 /?mode=lab&demo=residence-3。

## Delivery Notes
- 本版完成二维玩法与三维背景的独立接入。建筑复用现有程序化模型，属于首版三维场景，尚不是参考原画的美术精度；不能把接入完成表述为原画质量验收通过。
- 保留用户与其他会话原有改动，没有提交、推送、部署。全量 diff 含并行任务内容，不能整体归入本任务。
