# PLAN -- 按横版透视规范修正独立河岸场景

## Status: done
## Task: 475
## Related: 473
## Baseline Commit: c292d188

## Goal
修正独立 harbor 的纵向城市构图，按已确认的 XY 横版玩法、正面游戏镜头、两层背景格子和三层远景组织河岸城市。

## Non-goals
不替换住宅、自由世界或角色，不新增 Z 方向玩法，不迁移存档，不把建筑改成纸片，不提交推送或重启 Docker。

## Acceptance Criteria
- 游戏镜头继续 FOV30、距玩法面30，沿 XY 跟随；可玩格子是一条清楚的横向落脚带。
- 背景基准 -7/-16，远景基准 -35/-70/-140；共享方案 G 的距离来源与环境指数雾。
- 河岸、水带、高架和楼群沿 X 展开，不用两侧高楼夹出伸向 Z 深处的河谷。
- 建筑保留真实几何厚度，背景格子保持格子原尺寸；主角与落脚线清楚。
- 原游戏、住宅和透视规范演示保留行为；左右行走验收视差，类型、全量测试与构建通过。

## Decisions
- 已读 core-coordinates.md、depth-definitions.md、depth-layer-trial/README.md 与分层图；原 docs/depth-definitions.md 只是指向唯一正文。
- 之前错误根因是将纵向河谷布局统一缩放 .45 塞入横版镜头，打乱固定层距，并用宽大近岸地坪掩盖横版落脚带。
- 新横版布局复用已做楼体、批处理、水面与载具；观察用原城市保留，游戏使用符合规范的横向布局。
- 从原透视演示提取共享层距及指数雾，原值、材质串接和调用顺序保持不变；子代理已完成提取与初步检查。
- 本次是可回退的场景修正，按 dev 完成实现与验收，无需额外设计批准。
- 不新增渲染网格测试，已有行为测试继续证明真实横版碰撞；渲染以浏览器移动验收。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/depth-layers.ts 与现有调用 | 原样提取共享 G 层距 | yes |
| src/render/depth-haze.ts 与 definition-depth-layout.ts | 共用环境指数雾，不改原演示行为 | yes |
| src/render/harbor-perspective.ts | 提取复用的城市材质、水面和交通 | yes |
| src/render/harbor-side-scene.ts | 沿 X 装配两层格子、三层实体楼群与横向水带 | yes |
| src/app/harbor-presentation.ts | 取消整城缩放，接入横版布局和规范雾 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes：最终修正后通过 |
| npm test | yes | yes：1962 项、301 组全部通过 |
| npm --ignore-scripts run build | yes | yes：最终修正后主构建通过；独立观察页构建也通过 |
| 浏览器正面镜头左右移动与原演示检查 | yes | yes：桌面1600×900、窄屏、横移及跳跃；原AI天际线演示正常，控制台无错误或警告 |
| 子代理范围审查 | yes | yes：修正列车贴轨与交会问题后 Approved |

- 审查发现双列车轨距不足且重复升高，改为居中单列车，车底y=.3与桥顶对齐；旧观察页的双轨配置未改。
- 浏览器实测左右移动时岸边格子快、后方楼群慢，跳跃仍只沿Y；原场景分层演示的实景/正常镜头、景深G均可用。evidence/ 保存初始、横移、跳跃和原演示截图。
- 近景与背景保留真实格缝，三层实体楼群有各自尺度/细节与冷暖明度；本景采用蓝调黄昏空气色#3a4a66，没有迁移全游戏的昼夜或旧瓦片深度实现。
- 本次未修改原住宅、默认世界和角色；共用规范只是提取原值，保留其他会话已有工作区修改。未提交或推送。
