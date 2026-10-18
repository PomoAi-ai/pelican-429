# PLAN -- 河岸三维城市与空间层次

## Status: done
## Task: 470
## Related: 468
## Baseline Commit: c292d188

## Goal
根据本轮五张参考图，把潮汐之城改为错落有序的真实三维河岸城市。河道连续留空，建筑只能落在岸上；通过真实体积、近中远尺度、材质、空气透视与细节体现层次。

## Non-goals
不修改住宅和 Claude 场景、不修改共享模型或原图片、不提交推送，不增加额外玩法或时段切换。

## Acceptance Criteria
- 所有建筑（包括远景）均有三维楼体，不使用建筑图片或 billboard。
- 河道边界明确，河中没有建筑；岸上有基础、沿岸步道和街区连接。
- 楼群按街区组织，体量、退台、朝向与高度有秩序地变化，近中远不堆成等高墙。
- 保留近远电车和飞行器，桥梁与街道连接合理。
- 深蓝玻璃、金属框架、暖窗灯、少量冷光与晚霞形成统一配色，远楼逐层淡化。
- 浏览器检查默认、全景、斜视及移动后岸线、楼体厚度、遮挡与控制台。

## Constraints
- 只修改 harbor 独立文件；可新增可复用的 harbor 三维建筑资源模块。
- 复用 createAiCityBatches、createVehicleTemplates、游戏水面材质，不复制共享模型系统。
- 不重启 Docker 或既有服务器。
- 纯渲染与 UI 由浏览器验收，不新增渲染自动测试。

## Decisions
- 已有纸片楼根本原因是所有层都用透明 PNG 平面；本轮删除建筑图片依赖，天空图片可保留。
- explorer 完成复用点与空间方案核对：无现成整楼工厂，以共享 batches 构建真实楼体；侧岸低层留广场缺口，高层后退，远岸主塔不贴岸线。
- 河道最终 x=-50..50、z=-480..2，水位 -2.8；近处和两侧岸基承托建筑，远岸位于 -480 之后，避免封闭池塘构图。桥梁跨河不在水中立柱。波纹基面与 Reflector 反射面留 .2 高差，避免波谷被深度截断。
- 新需求为可回退的独立场景美术实现，没有需用户裁决的方案分歧，直接实现。
- 185 栋楼采用共享批处理的实体盒体、挤出体和环冠；尖塔连续收分，近景四面幕墙分格、金属结构、屋顶设施与不同窗灯节奏；远楼保留体积并降低细节。建筑图片依赖已全部移除，仅复用天空图片。
- 玻璃幕墙以实例世界坐标细化板缝、百叶明暗与反射粗糙度；环境反射取同一晚霞天空，水面 Reflector 反射真实场景；软阴影、轻辉光和 MSAA 保留三维轮廓。
- reviewer 子代理确认落岸与资源释放；发现合法缩放/旋转可穿楼，已统一在 OrbitControls 更新后限制镜头 z>=10。浏览器测试放大与极限旋转，无穿楼；近墙占画面可通过重置恢复。
- 首次全量测试暴露 CSS import 不符合仓库相对导入规则；CSS 改由独立 HTML link 引入，21 项架构测试和最终全量 1960 项测试通过。
- 保持既有住宅、共享代码和 Docker 服务不变；没有提交或推送。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/harbor-perspective.ts | 河道、岸线与三维街区配置 | — | yes |
| 2 | src/render/harbor-buildings.ts | 三维建筑、立面、屋顶和地标资源 | 1 | yes |
| 3 | src/render/harbor-perspective.ts | 岸上装配、桥与交通、水面和天空 | 1,2 | yes |
| 4 | src/app/harbor-perspective.ts | 构图、灯光、雾色和可观察范围 | 3 | yes |
| 5 | vite.harbor.config.ts | 通过共用资源清单移除建筑图片，无需修改配置代码 | 1 | yes |
| 6 | harbor-perspective.html | CSS 使用页面 link 引入 | — | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes：通过 |
| ./node_modules/.bin/tsc --noEmit -p tsconfig.harbor.json | yes | yes：通过 |
| npm test | yes | yes：最终 1960/1960 通过 |
| npm --ignore-scripts run build | yes | yes：主构建通过，避免 prebuild 重写共享资源文档 |
| ./node_modules/.bin/vite build --config vite.harbor.config.ts | yes | yes：通过，仅天空图片与程序资产 |
| node --input-type=module 临时占地断言 | yes | yes：185 栋楼含裙房/环冠边界均落岸，布局可复现；没有留下测试脚本 |
| 浏览器视觉验收与控制台检查 | yes | yes：默认、全景、斜视、缩放/旋转、横移，控制台无错误警告；evidence/ 保存 4 张图 |
