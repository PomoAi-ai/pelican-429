# PLAN -- 第一章大云朵与超高层城市场景

## Status: done
## Task: 124
## Related: 116
## Baseline Commit: 无 HEAD；改前快照 $TMPDIR/pelican-grand-city-before

## Goal
把用户确认的 cloud-city-grand-skyline.png 做成第一章真实分层场景：多个饱满大云朵与远方超高层呼应，近处小楼、中间街区、远方都市保留明确距离。

## Non-goals
不重做现有堡垒、黑洞、平台碰撞、冷却液或角色；不更改战斗与其他章节。

## Acceptance Criteria
- 新图各层独立制作，素材和提示词留存在项目；不把参考图整体贴成背景。
- 近低远高、云楼呼应，普通游戏视角和全景均不会把中景放大成贴脸高塔。
- 横移和跳跃有层间视差；镜头范围内无露边、黑底或透明贴图光晕。
- 正式游戏与独立预览共享同一套素材、渲染与生命周期；堡垒、黑洞、雨雪和透明冷却液可读。

## Decisions
- 用户明确要求制作场景并自行补图，直接实施；不重复请求确认。
- 复用现有四层背景模块和装载路径；子代理先校准同画幅分层的投影关系，根代理制作透明素材。
- 纯渲染效果由浏览器验收，不新增材质/常量/源码字符串测试。
- 探索/设计确认旧层投影高度达到屏高约2.4–2.8倍且地平线不一致；统一四层投影后画幅与地平线，只保留小幅差速位移。现有共享路径已明确，无需另建背景系统或改相机。
- 四张图从确认概念图分别绘制，保留同一1536×1024完整画布和元素位置；远城向下补河面，中景补街区，近景中央留透明缺口。黑洞继续复用。
- 无审批停止条件，直接实现；构图参数最终以真实游戏/预览画面校准。
- 子代理审查发现旧夹紧方式会让屋顶跳跃失去纵向视差；现预留屏高10%的移动余量，围绕中间高度计算位移，复核入口、屋顶和最大缩放均通过。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | output/concepts/city-depth-v2/layers、public/environments/city-grand | 补齐正式分层图片与提示词 | — | Yes |
| 2 | src/render/facility-sky.ts | 修正构图比例和分层视差 | 1 | Yes |
| 3 | src/app/facility-presentation.ts | 接入新素材，必要时校准颜色 | 1 | Yes |
| 4 | README.md | 更新实际素材与场景说明 | 2,3 | Yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Yes — exit 0 |
| npm test -- --test-concurrency=2 | yes | Yes — 1569/1569，300 suites，113.457秒，exit 0 |
| npm run build | yes | Yes — 392 modules，1.68秒，exit 0 |
| 游戏入口/起跳按键、预览横移/全景/前哨/屋顶/缩放 | yes | Yes |
| 子代理审查与 diff-guard | yes | Yes |

## Visual Verification
- 正式游戏加载成功，四层明亮云城与黑洞、堡垒、雨夹雪、透明冷却液同时可见；跳跃键可用，浏览器无 warning/error 日志。
- 预览前哨238%、屋顶212%、屋顶上移5单位、全景75%及横向右边界168均检查通过，无黑底或图片露边。
- 实机截图：output/chapters/grand-city-game.png；前哨与屋顶截图：output/chapters/grand-city-front.png、grand-city-roof.png、grand-city-roof-up.png。
- scoped diff 对比改前快照：本次代码仅背景模块与素材加载路径；README仅补充一段说明。其他并行工作保持原状。
- 独立子代理执行类型检查、全量测试和构建全部通过，未改源码或重跑测试；构建仅有主JS体积超过500kB的Vite提示。
- 命令日志：$TMPDIR/pelican-grand-city-typecheck.log、$TMPDIR/pelican-grand-city-tests.log、$TMPDIR/pelican-grand-city-build.log。
