# PLAN -- 光子程序鬼火与真实粒子轨迹

## Status: blocked
## Task: 050
## Related: 047-photon-realtime
## Baseline Commit: 无 HEAD；相关文件快照 $TMPDIR/photon-wisp-before

## Goal
用简单半透明三维鬼火体和程序粒子实现光子，不使用图片或图片采样塑造角色；移动留下真实位置的渐隐粒子轨迹，停留时在主角附近游动。

## Non-goals
不增加导航寻路、战斗与存档；不提交推送。

## Acceptance Criteria
- 游戏与预览共享程序几何、材质、粒子和尾迹。
- 造型蓝白半透明、柔和发光，体量小巧；无图片纹理和美术采样数据依赖。
- 粒子轨迹跟随历史位置、渐隐；暂停冻结，传送/重置清理。
- 主角附近有限范围漂移，移动可追随。

## Constraints
不改 vendor、不新增运行时依赖；视觉浏览器验收，不写实现细节测试。

## Decisions
- 既有游戏装配和生命周期探索完整，复用；子代理完成尾迹与游动的增量探索、设计和实现。
- 主体使用程序生成的圆润收尖几何和透明自发光材质，内部小光核、少量升腾粒子；不追求图片描线。
- 尾迹独立于角色根节点，存储世界坐标，游戏与展示场调用共享实现。
- 用户明确允许半透明实体与粒子组合，无需重确认设计。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/luma/luma-rig.ts | 程序几何光体和升腾粒子 | yes |
| src/render/luma/luma-animator.ts | 呼吸与轻摆 | yes |
| src/render/luma/luma-trail.ts | 世界坐标粒子轨迹 | yes |
| src/render/luma/luma-companion.ts | 主角附近游动与跟随 | yes |
| src/app/showcase/luma-session.ts | 复用真实尾迹 | yes |
| public/characters/luma/SOURCE.md | 更新角色定义和实现说明 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | failed: 1498/1499 |
| npm run build | yes | yes |
| 实际游戏和预览浏览器检查 | yes | yes |

## Validation Notes
- 子代理完成尾迹/跟随增量探索、设计和实现；独立审查 Approved。
- 使用程序曲面、解析表情、118 升腾/雾光粒子、128 世界轨迹点，共 5 组绘制。旧图片采样数据、脚本、源图已移至 $TMPDIR/photon-wisp-before，运行时及当前资源目录无引用。
- 游戏实际移动/转向/头顶游动已观察；预览正背面、斜角、明暗环境、尾迹、暂停与重播已检查；两入口浏览器错误日志为空。
- 更新 src/config/showcase.ts 和 assets/characters/luma/preview.html 的角色描述；portrait.jpg 是实时截图缩略图，不参与角色渲染。
- typecheck 通过；独立 build 通过，存在原有大包提示。
- 全套 1499 项，1498 通过、1 失败。唯一失败 test/worldgen.test.ts:420 世界生成耗时预算 250ms，全套中位1100.7ms，单独复跑741.5ms，均超限；该纯逻辑路径不调用光子模块，未修改阈值或跳过用例。世界生成性能不属本任务范围，未扩大修改。
- 交付截图 output/luma-preview/photon-wisp-game.jpg、photon-wisp-preview.jpg。

## Delivery
实现和浏览器验收已完成；因项目要求的全套检查仍有上述一项未通过，跟踪状态保留 blocked。用户可直接查看实时游戏与预览。未提交、未推送。
