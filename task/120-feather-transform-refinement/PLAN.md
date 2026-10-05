# PLAN -- 羽毛变身细化

## Status: done
## Task: 120
## Related: 114
## Baseline Commit: 无初始提交；src/test 本轮副本 $TMPDIR/pelican-transform-refine-baseline

## Goal
细化已实现的双向羽毛变身，让短羽、长羽层次清楚，贴身生长更自然，中间轮廓衔接更完整。

## Non-goals
不改变 F 操作、0.7 秒时序及碰撞逻辑，不使用羽茧或遮挡闪光，不重做角色或技能，不提交推送。

## Acceptance Criteria
- 羽片有弧度、羽轴和长短层次，减轻大片平板扇形感觉。
- 肩臂、胸背短羽沿表面依次生长，再与正式鹈鹕羽翼衔接；反向收退自然。
- 中段头颈、衣服和鸟身交接更协调，减少整齐切边与悬空附件。
- 保持脚底、双向朝向、三档模型兼容和动态资源引用；游戏与展示场共用实现。
- 浏览器逐帧与慢放验收、相关审查和类型/全量/构建检查完成。

## Decisions
- 上轮已完整探索共享变身、材质和骨骼路径，本轮复用结论，由原渲染子代理完成局部细化方案及实施，主代理负责画面校准。
- 保留已有资源生命周期修正；仅改变表现，不新增网格细节测试或依赖。
- 羽片采用不对称曲面、羽轴和细羽缘，依据蒙皮法线构造完整朝向；94 根长短羽错开生长并收进正式羽翼。
- 延后上胸退出、提前鸟颈进入，保持中段连接；头部缩小幅度由31%降至12%。头发、脸与完整鸟头在同一阈值交接，避免中点切片与下喙提前出现。
- 装备围绕可见中心收起，17%进度收完；手部稍收，保留脚底位置与原时序。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/player-transform.ts | 羽毛形状、方向、层次与身体衔接细化 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器双向慢放、暂停/重播与三档模型 | yes | yes |
| 子代理审查 | yes | yes |

## Validation notes
- `npm test` 一次全量1567/1567通过，0失败，165.5秒，性能项通过。
- 双向左右关键帧、暂停/重播和三档模型检查完成；加密检查 q≈0.5/0.524，确认最后头部切片与下喙提前显现问题消除，浏览器无报错。
- 最终 `npm run typecheck` 通过；`npm run build` 通过，391模块，4.63秒，仅大chunk及打包插件耗时提示。
- 子代理审查 Approved，姿态恢复、局部方向、动态资源引用和释放顺序无新增问题。
- 实机证据 `evidence/before-runtime.png` 与 `evidence/refined-runtime.png`；临时验收页面已清理。
- 本轮生产代码仅修改 `src/render/player-transform.ts`，没有修改测试、vendor、变身逻辑或技能。未提交推送。
