# PLAN -- 流线磁悬浮列车与落轨停靠

## Status: done
## Task: 504
## Related: 500
## Baseline Commit: c292d188

## Goal
按已绘制的五视图制作连续曲面的白银磁悬浮列车，行驶时悬浮，停稳时落到轨道。

## Non-goals
不改其他车辆、角色、场景、全局相机和光照；不使用 Hyper3D；不提交推送。

## Acceptance Criteria
- 尖长车头、流线白色外壳、侧镂空银翼、上扬收尖尾部，前后两个单座，敞开/有棚同底盘。
- 全深不超过 1.8 格，轨道居中 2 格、底座 3 格，沿用游戏平视镜头。
- 初始及停稳后滑靴接触轨道；启动先起浮，移动时保持间隙，停车平滑下降；换向和端点不抖动。
- 场景和导出 GLB 使用同一模型，实际导出/加载和浏览器驾驶验证通过。

## Decisions
- 前任务已完成独立入口、镜头、轨道和驾驶探索；本次复用该结果，跳过重复探索和架构子代理阶段。
- 用户已明确许可按设计稿开始制作，无需再次申请设计确认。
- 模型子代理只修改共享模型；运动子代理负责升降状态、装配和对应行为测试；主代理处理导出、几何检查和视觉验收。
- 静态模型鞋底严格对齐配置；落轨由父级 Y 偏移计算，悬浮高度表示鞋底与轨顶的实际间隙。
- 几何视觉不新增锁定网格实现的测试；升降状态转换通过纯逻辑行为测试验证。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/maglev-model.ts | 连续曲面、磁悬浮鞋接触平面 | — | yes |
| 2 | src/sim/maglev-drive.ts; src/config/maglev.ts | 启停悬浮状态 | — | yes |
| 3 | src/app/maglev-track.ts; test/maglev-drive.test.ts | 升降表现、归位及行为验证 | 2 | yes |
| 4 | scripts/export-maglev-models.ts; public/models/maglev | 实际几何自检与模型导出 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/maglev-drive.test.ts | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| node scripts/export-maglev-models.ts; npx vite build --config vite.maglev.config.ts | yes | yes |
| 浏览器外形/启动悬浮/刹停落轨/两种形态验收 | yes | yes |
| core-review + diff-guard 范围审查 | yes | yes |

## Results
- 车体使用连续放样曲面与有厚度的闭合曲面侧壳；中央保留受控镂空，替换初轮过细的前颊/下裙管状轮廓。两座串列、两种车棚均保留。
- 起浮和下降各 0.45 秒；起浮完成后开始移动，跑动间隙约 0.38 格；停靠无浮动，端点向外长按保持落轨，反向重新起浮。
- 模型实际宽 1.76957357 格，最低接触面 0.3600000004；轨顶 0.1999999993。导出文件重新加载通过，详见 evidence/glb-validation.json。
- 运动子代理：6 个驾驶行为测试通过，npm run typecheck 通过。全量 npm test 1984/1984 通过；npm run build 和专用 Vite 构建通过，仅已有包体积提示。
- 模型最终曲面修正后另执行 TypeScript 检查、导出及重新加载、自检与专用构建，均通过。
- 审查子代理 Approved：500 组混合输入粗细步长积分一致；曲壳闭合、三角朝向一致、无退化三角和非法数值；最终几何修改补充审查通过。
- 浏览器实测：敞开版悬浮行驶，空格刹停后落轨；有棚切换；右端 148.6 格停靠，反向可悬浮离开；归位回到 80.0 格且落轨。控制台错误为空。
- 截图：evidence/open-docked.png、open-hovering.png、closed-docked.png。
- 未新增角色上下车/坐姿动画；模型 GLB 为静态几何，运动状态由场景控制。未提交或推送。
