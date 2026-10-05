# PLAN -- 第一章城市色调与横版纵深

## Status: done
## Task: 129
## Related: 124-grand-city-cloud-layers
## Baseline Commit: 无HEAD；改前快照 $TMPDIR/pelican-city-depth-revision-before

## Goal
近处建筑与堡垒色调协调，近岸房屋、开阔河面、远岸摩天楼形成明确横版游戏纵深，并保留大云朵和震撼远景。

## Non-goals
不改关卡碰撞、角色、战斗、黑洞和堡垒结构。

## Acceptance Criteria
- 近景青灰/石墨、远景明亮银蓝，清晰度与对比度随距离递减；避免泛黄房屋与荧光蓝远城。
- 近处低楼与远岸巨城之间有宽阔河面和大气留白，天际线保持强烈大小节奏。
- 近、中、远图层在横移和跳跃时有可见差速；无图片露边或明显透明边缘。
- 游戏和机房预览共享素材与渲染，保持原有可操作场景。

## Decisions
- 用户直接提出效果问题，本次重新绘制必要分层素材并修正视差，无需确认。
- 复用现有四层模块；渲染效果在浏览器验收，不新增材质/源码字符串测试。
- 探索与设计：四层原有相机补偿使5格横移只有约0.2/0.7/2.2px差速；改为相机完整运动范围内线性分配画幅余量，权重0/0.06/0.32/0.9。保留单一模块，不增加背景系统。
- 美术重新绘制四层，保留大朵云；楼群改为近处石墨青灰、远处银蓝，减少黄色高光，并让中近景形成不同轮廓。
- 用户需求已明确且修改可回退，无审批停止条件，直接实现并在实机校准岸线与图层相对位置。
- 远城增加一次定向原生绘图：轮廓整体退远、基部空气透视增强、河面减少密集高光；实际最高塔尖约源图.24，岸线约.534。
- 远城抬高.075视高、中景下降.045视高，framing按每层实际纵向余量限制；近房0.9、中景0.32、远城0.06差速。neutral白平衡和1.04饱和度避免原暖色与1.2饱和度强化黄色/钴蓝。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | public/environments/city-depth-v3、output/concepts/city-depth-v3 | 统一冷暖关系并补充有景深的分层画面 | — | Yes |
| 2 | src/render/facility-sky.ts | 加强近中远差速并调整构图 | 1 | Yes |
| 3 | src/app/facility-presentation.ts | 接入新素材 | 1 | Yes |
| 4 | README.md | 记录实际素材结构 | 2,3 | Yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| 浏览器入口、屋顶、全景、横移、缩放验收 | yes | Yes |
| 子代理 review / diff-guard | yes | Yes |
| npm run typecheck | yes | Yes — exit 0 |
| npm test -- --test-concurrency=2 | yes | Yes — 全量1584/1585；唯一worldgen性能波动项单独复跑通过，见下文 |
| npm run build | yes | Yes — exit 0，394 modules，7.45秒 |

## Validation Notes
- 实机可见银蓝远城、开阔河面与近岸青灰房屋；游戏跳跃输入正常；预览前哨238%、屋顶212%并上移5格、全景75%横移到右侧边界168均无露边，浏览器warning/error日志为空。
- 子代理只读审查通过，4,320组宽高比/缩放/边界组合覆盖检查通过；入口远岸约屏高58.85%，每移动5格远/中/近分别约0.55/2.91/8.19px纵向位移。
- 四张素材均1536×1024，天空不透明，其余三层保留原生alpha。使用内置image_gen，完整提示词存output/concepts/city-depth-v3/generation-prompts.txt。
- 截图：output/chapters/city-depth-v3-{game,front,overview,roof,roof-up,right}.png。
- 全量测试106.533秒、exit 1：worldgen现有生成性能项253.6ms超过250ms阈值，与本次纯渲染代码无依赖；未改阈值，执行 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 单项复跑1/1通过（exit 0、0.895秒）。保留首次失败记录，不声称全量一次通过。
- 验证日志：$TMPDIR/pelican-city-depth-v3-{typecheck,tests,worldgen-perf-rerun,build}.log。构建只有现有体积提示和prepare-out-dir耗时提示，无错误。
- 最终scoped diff仅涉及上述两TS模块、README一段以及本轮素材、提示词、截图和跟踪记录；未改其他并行任务。
