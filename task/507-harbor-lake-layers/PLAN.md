# PLAN -- 湖区水感与暖白城市分层接入

## Status: done
## Task: 507
## Related: 498
## Baseline Commit: c292d188

## Goal
将已确认的 assets/concepts/harbor-lake-city-v1/master.png 拆绘为天空、透明远中近三层城市和独立水面素材，接入 AI 住宅 2 的共享背景。

## Non-goals
不改原 AI 住宅、玩法地图、角色、碰撞、存档、天气与时间规则；不提交或部署。

## Acceptance Criteria
- 城市为暖白主体，远处逐渐变淡，无山，无水中建筑。
- 三层城市具有真实 alpha，Z 层距遵循 -35/-70/-140，天空 -700。
- 水面采用已确认湖区的柔和蓝绿与云反射，保留动态波纹与天气响应。
- 近岸保持实体厚度，角色、列车、无人机和住宅机制继续运行。
- 本地目视检查晴天、夜间、雨天和移动视差；相关检查通过。

## Constraints
使用内置 image_gen 拆绘，保存新目录，保留旧资源。工作区有大量其他任务的修改，只检查本次文件差异。

## Decisions
- 使用 dev 工作流；已有背景实现、相机规范和调用链已读，探索限于新分层与水材质接入。
- 复用 createHarborSideScene、共享水材质和交通；不再建立另一个展示场。
- 生成图只用于远景和水面材质，不把整幅效果图放到可操作前景。
- 子代理完成共享背景接入：新图水平湖底 + 低透明实时倒影 + 薄波纹；保留三层景深和动态载具。实测 alpha 基线分别 605/724、697/724、584/724。
- 三张建筑图与两张底图均为 2172×724；通过 alpha 像素与尺寸检查。水和天空不透明，建筑保留透明像素与边缘。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| public/scenes/harbor-lake-layers-v1/ | 五张独立原画及透明背景 | yes |
| src/config/harbor-painted.ts | 新资源目录与发布清单 | yes |
| src/render/harbor-side-scene.ts | 对齐分层、湖面材质与天气 | yes |
| vite.config.ts | 发布资源覆盖 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes，1993/1993 |
| npm run build | yes | yes，既有 chunk 大小告警；五张资源与原图逐字节一致 |
| 浏览器晴天/夜晚/雨天/移动目视检查 | yes | yes，晴天/星夜/降雨；正视和斜视；角色 X47.5→41.8；远景二/三独立开关 |

## Review and Evidence
- 用户重新打开预览页后恢复正常访问；未绕过浏览器安全策略。
- 子代理只读复核通过：着色器替换点匹配当前 three.js，水底/反射/波纹排序正确，资源生命周期与原 AI 住宅隔离保持成立。
- evidence/ 保存实际游戏截图。透明图层没有天空色矩形底，斜视可见水平湖水与岸台厚度，夜晚水面随环境变暗。浏览器无 error 日志。
- 保留现有住宅构图，正视时前景住宅与岸台会遮挡较多水面；未把概念整图放大覆盖前景。
- 本轮未做性能优化；预览斜视全住宅时帧率偏低，正常跟随移动约14–23 FPS，不能由本轮结果确定是否为新增回归。
- 未修改或运行 CI，未提交或部署。
