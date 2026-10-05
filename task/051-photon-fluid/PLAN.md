# PLAN -- 流动水滴光子与环境照明

## Status: blocked
## Task: 051
## Related: 050-photon-wisp
## Baseline Commit: 无 HEAD；$TMPDIR/photon-fluid-before

## Goal
将光子重做为饱满的三维流动水滴，在主角附近较大区域自由活动，带真实粒子轨迹并照亮环境。

## Non-goals
无图片造型、无导航寻路、无全仓审查；不提交推送。

## Acceptance Criteria
- 圆润下腹、收尖顶部的三维水滴，具有曲面明暗、流动内部和轮廓。
- 主角附近约12格宽、5格高自由游动，存在纵深和转向；移动时跟上。
- 发光真实影响附近地形/物件和展示场地面。
- 共享游戏/展示场资产，暂停、传送和生命周期正确。

## Decisions
- 应用 dev 与 Ponytail Full，复用现有 rig、尾迹和 PointLight 动态光通路，不另建光照系统。
- 既有生命周期探索完整，子代理只增量探索/实现大范围游动，主代理处理曲面和流动材质。
- 水滴采用程序曲面与程序着色，无源图采样；曲面平滑法线参与明暗，程序光纹随时间流动。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/luma/luma-rig.ts | 三维水滴、流动着色、照明 | yes |
| src/render/luma/luma-animator.ts | 连贯流动时钟与展示动作 | yes |
| src/render/luma/luma-companion.ts | 大范围自由游动 | yes |
| public/characters/luma/SOURCE.md | 同步定义和实景缩略图 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | failed: 1498/1499 |
| npm run build | yes | yes |
| 浏览器造型/流动/大范围游动/环境照明 | yes | yes |

## Verification Notes
- 子代理完成大范围游动，审查未发现新增缺陷；typecheck/build 通过，全套测试运行中。
- 浏览器检查正面/侧面完整水滴体积，流光随时间变化，地面受点光照明；实际游戏房屋墙面在光子经过时出现明显局部照明，移动后保持追随。
- 运行时无图片依赖；原卡通表情移除，重点转向水滴流动体积。说明与目录文案已同步。
- 当前未实现地形避障；活动范围是相对玩家的连续游弋，狭窄视口中可能短暂飞出画面。

- 实景证据：output/luma-preview/photon-fluid-preview.jpg（曲面、流光与地面照明），photon-fluid-game.jpg（离开主角头顶的自由游动和弯曲轨迹），photon-fluid-light.jpg（房屋局部照明）。
- 开发服务器重启后原游戏页保留旧热更新连接，已刷新载入新模型；预览无控制台错误，游戏旧日志含服务器停机时的 HMR 连接错误，无新增 shader 错误。

## Final Validation
- npm run typecheck、npm run build 通过。全套1499项，1498通过，1失败：test/worldgen.test.ts:420 生成耗时中位507.1ms超过250ms预算，和上轮同一已有失败，测试不调用光子代码，未改断言或跳过。日志 $TMPDIR/photon-fluid-{typecheck,test,build}.log。
- 子代理代码复审 Approved；无本次新增缺陷。未增加细节测试、运行时依赖或全局照明抽象。
- 实现与浏览器验收完成，因全套必需检查未全过，跟踪状态保留blocked。未提交推送。
