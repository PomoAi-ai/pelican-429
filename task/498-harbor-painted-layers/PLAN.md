# PLAN — AI住宅2透明城市分层

## Status: done
## Task: 498
## Related: 496
## Baseline Commit: c292d188

## Goal
将已绘制日间河湾构图制作成独立透明远景并接入AI住宅2。

## Acceptance Criteria
- 图像工具独立绘制三层真实透明PNG，匹配主稿的蓝金未来建筑。
- 远景按Z=-35/-70/-140，近岸实体、天空、水面、车辆继续独立。
- 原住宅地图、玩法、天气和存档保持原接口。
- 检查透明通道、浏览器分层效果和类型检查、全量测试、构建。

## Decisions
- 已有探索覆盖调用方和坐标规范，复用496的环境入口，不重复设计地图。
- 只更换远景美术和布局；近景不使用整幅背景画代替实体。
- 采用三张单独生成的透明城市带，距离越远建筑越少、细节越低；保留现有天空和动态反射。
- 不新增网格或材质细节自动测试，视觉通过浏览器验收。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| public/scenes/harbor-layered-daylight-v1/ | 三张透明原画及来源提示词 | yes |
| src/config/harbor-painted.ts | 新美术路径与清单 | yes |
| src/render/harbor-side-scene.ts | 三层独立远景布局 | yes |
| vite.config.ts | 将三张透明原画纳入发布资源清单 | yes |

## Validation
| Check | Done |
|---|---|
| PNG alpha与图片目视 | yes — 均为2172×724 RGBA，分别超过113万/125万/145万像素alpha=0 |
| 浏览器白天、天气、分层、移动 | yes — 各层开关、X=47.5到40.7移动、雨天、夜晚，截图在evidence |
| npm run typecheck | yes |
| npm test | yes — 1977通过，0失败 |
| npm --ignore-scripts run build | yes — 既有大块资源提示 |

## Review
- 子代理实现配置和渲染替换，并相对本次修改前快照只读审查；未发现需修问题。
- 主代理按实际alpha底边校准三层落地位置；未对图片做抠图或颜色后处理。
- 子代理初次类型检查撞到并发开发的无人机接口暂缺；最终完整检查已通过，未改动相关文件。
- 本次修改配置、渲染和发布资源清单，新增三张美术及说明；原住宅地图、玩法和天气接口未改。
- 刷新时并发制作的white-vtol模型一度返回HTML；开发服务刷新资源清单后已正常返回GLB，未修改该载具实现。补齐发布资源清单后重跑类型检查和构建通过，确认dist包含三张PNG。
- 未做长时间性能基准或低端设备测试，未提交代码。
