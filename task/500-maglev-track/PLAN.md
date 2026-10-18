# PLAN -- 可驾驶直线磁悬浮轨道场景

## Status: completed
## Task: 500
## Related: N/A
## Baseline Commit: c292d188

## Goal
按用户选定的流线白银磁悬浮车原图制作可复用车/轨道模型，并建立独立的可驾驶长直线轨道场景。

## Non-goals
不修改其他场景、角色、全局光照/相机设置，不提交推送。

## Acceptance Criteria
- 两种车棚形态，同一底盘；每节前后两排，每排一人，共两座，可多节连挂，连接结构可见。
- 模型保留尖头、流线侧身、白银材质、细蓝色灯线及磁悬浮滑靴，避免旧大块空站立区。
- 长直线沿X，基础总深3格，轨道居中占2格；使用共享游戏透视，默认平视、FOV30、距离30。
- 可以前后驾驶、刹车、停车，到线路末端停止；可以切换无棚/有棚。
- 独立入口可打开，导出真实车/轨道GLB，场景使用同一模型生成函数。
- 实际浏览器验证模型、轨道宽度、移动和视角；相关检查通过，其他已有改动保持不变。

## Constraints
仅新增轨道任务专属文件和资源。工作区已有大量其他未提交改动，不复原、不覆盖。

## Decisions
- 用户实景反馈：座椅/棚过高导致外观差；优先低矮流线原图，乘坐姿态留待适配，不让玩家尺寸撑坏造型。
- 独立 HTML 和专用 Vite 构建入口：无需修改已有主页面/场景路由。
- 以程序化 three.js 几何创建和导出模型，运行时与导出共用，避免两套外形。
- 子代理探索透视/架构；模型和运动逻辑分工；主代理装配场景并视觉验收。
- 无未决用户问题，按已选原图和每节两座执行。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/maglev-model.ts | 车、棚、轨道共享模型 | — | yes |
| 2 | src/sim/maglev-drive.ts | 直线驾驶运动 | — | yes |
| 3 | src/app/maglev-track.ts | 独立场景装配、输入、镜头 | 1,2 | yes |
| 4 | maglev-track.html; src/ui/maglev-track.css; vite.maglev.config.ts | 独立入口与展示 | 3 | yes |
| 5 | scripts/export-maglev-models.ts; public/models/maglev | 从共享生成函数导出模型 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 专用场景构建、模型导出及几何尺寸检查 | yes | yes |
| 浏览器视角/外形/驾驶/边界/车棚验收 | yes | yes |

## Results
- 使用低座、后倾靠背、压低的车棚，取消按站立玩家高度撑高座舱的比例。两种车共享底盘，每节两个串列座位。
- 子代理完成透视约束核对、模型和运动逻辑；审查发现的车棚切换后键盘焦点与页面往返缓存生命周期问题均已修复。
- npm run typecheck 通过；npm test 通过 1982/1982；npm run build 通过。最终外观调整后重新执行 typecheck、专用场景构建及 GLB 导出/重新加载检查，均通过。
- 专用构建命令：npx vite build --config vite.maglev.config.ts；构建仅有大于 500 kB 的包体积提示。
- 浏览器验证 A/D、空格刹车、按钮长按、两端停车及反向离开、车棚切换、归位。端点中心约为 11.4 与 148.6 格，完整列车留在线内。
- evidence/open-game-low-seat.png 和 closed-game-low-seat.png 为最终低座版本；glb-validation.json 为实际导出模型的重新加载及尺寸结果。
- 未实现角色上下车或坐姿动画；当前完成独立可驾驶轨道场景与共享模型。未提交、推送。
