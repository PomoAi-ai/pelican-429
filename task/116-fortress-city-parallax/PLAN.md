# PLAN -- 第一章城市分层视差与黑洞接入

## Status: done
## Task: 116
## Related: 107, 111-fix-fortress-brightness-vortex
## Baseline Commit: 无 HEAD；改前快照 $TMPDIR/pelican-city-layer-before

## Goal
把已独立绘制的天空、远城、中景街区、近景屋顶和光撕裂黑洞接入第一章，使横向移动与跳跃产生前后空间感，游戏与预览共用效果。

## Non-goals
不把堡垒变成图片；保留现有可交互建筑、平台、冷却液、角色和地图逻辑；不修改其他章节设计。

## Acceptance Criteria
- 四层城市透明度与前后顺序正确，明亮现代且无旧工业巨构或真实地标。
- 相机横向与竖向移动时，各层产生不同速度的相对位移；高层和缩放时天空不露边，背景不遮盖可走路线。
- 黑洞使用已批准新图，中央光线被撕裂并消失；黑核不透底，外部透明且有流动。
- 保留堡垒灯光、天气、平台路线、透明致命冷却液与小地图。

## Decisions
- 继续最新分层图方向，用户已授权开发；新图复制为运行时资产，保留原图与提示词。
- 新黑洞的文件级方案明确，复用现有 shader、时间和销毁路径，直接并行实现；天空由探索子代理给出投影与视差方案后实施。
- 不新增渲染细节测试，浏览器验证实际游戏、跳跃和共享预览；现有全量检查作为回归验证。
- 探索/设计确认游戏与预览均在相机更新后调用共享 facility.update，无需改镜头控制。采用四平面、一个共享几何，按各层真实视锥与留幅限制相机偏移，避免纹理平铺和边缘露底。
- 城市纹理恢复白色材质乘色，取消针对旧暗图的额外曝光色；近层始终在堡垒实体后。文件级设计明确且无审批停止条件，直接实现。
- 实际构图缩小中景/近景层，远城增加独立高度偏移，使入口和跳跃时能看见远近层次；不改前景碰撞或关卡尺寸。
- 正式预览验收发现敌人模型缺少预加载，沿用游戏入口按实际实体种类加载的做法补齐资源装配；不修改敌人数据或行为。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | public/environments/city-depth、fortress-black-hole-tear.png | 复制已批准独立素材 | — | Yes |
| 2 | src/render/facility-sky.ts | 四层背景与横纵视差 | — | Yes |
| 3 | src/render/facility-fortress.ts | 传递四层纹理并复用生命周期 | 2 | Yes |
| 4 | src/app/facility-presentation.ts | 新素材装载与失败清理 | 2,3 | Yes |
| 5 | src/render/facility-approach.ts | 新黑洞布局、黑核不透明与光撕裂流动 | — | Yes |
| 6 | README.md | 更新分层素材与行为说明 | 2,5 | Yes |
| 7 | src/app/facility-environment.ts、facility-app.ts | 预览按实际实体加载敌人模型并处理释放 | — | Yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | 通过，预览装配修复后已重跑 |
| npm test -- --test-concurrency=2 | yes | 1565/1566 通过；唯一失败为世界生成耗时中位数 698.8ms 超过 250ms。关闭预览后 node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts 单独复核通过（1/1）；没有改动测试或阈值 |
| npm run build | yes | 通过，预览装配修复后已重跑；保留已有 bundle 体积警告 |
| 浏览器游戏跳跃/平移与预览缩放/高处画面 | yes | 游戏入口/起跳通过；共享场景全景、屋顶、右端通过；正式预览全景、前哨缩放、屋顶通过 |
| 子代理审查 / diff-guard | yes | 通过，未发现新增生命周期或排序缺陷；根代理复核预览装配与缓存销毁 |

## Evidence
- output/chapters/city-depth-game-entry.png：真实游戏入口，包括天气、踏台、透明冷却液和小地图。
- output/chapters/city-depth-preview-approach.png、city-depth-preview-overview.png：正式预览页面的前哨与全景。
- 临时共享场景检查页已删除，浏览器临时标签已关闭。
