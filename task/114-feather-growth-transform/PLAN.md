# PLAN -- 羽毛生长式双向变身

## Status: done
## Task: 114
## Related: 113
## Baseline Commit: 无（仓库尚无提交；本轮 src/test 副本在 $TMPDIR/pelican-feather-growth-baseline）

## Goal
按用户确认的分镜，把羽茧遮挡换形改成可见的贴身羽毛生长/收退与身体换形。

## Non-goals
不重做角色造型，不改光子技能，不改变现有变身操作与空间保护，不提交推送。

## Acceptance Criteria
- 主角肩背、胸口与手臂的羽毛由短变长，轮廓逐步向翅膀及鹈鹕体态过渡；反向过程收退羽毛，恢复主角。
- 角色身体全过程可见，无羽茧、球壳、绕身羽毛团或遮挡闪光；不再只在中点硬切两个完整模型。
- 约 0.7 秒完成，双向保持脚底位置与朝向，展示场和游戏使用相同模型和实现。
- 暂停、重播、取消和死亡恢复正常姿态与材质；无跨实例材质污染和资源泄漏。
- 类型、相关逻辑检查、全量测试、构建、双向实机画面与审查完成。

## Constraints
- vendor 不修改；复用现有角色、骨骼及材质，渲染动画不增加网格/材质细节测试。
- 保留工作区并行改动，只修改本任务代码。

## Decisions
- 用户已明确批准羽毛生长分镜，无需再次设计确认。
- 本轮在已完成的双形态基础上修改共用动画，复用既有状态、F 输入、空间检测及测试。
- 渲染探索和架构设计由同一子代理完成并直接实施；现有双形态接线已明确，主代理负责集成和浏览器验收。
- Grassy 身体是单一蒙皮网格，采用身体分区交接、骨骼体态过渡与骨骼附着羽毛；避免同时显示两个完整角色。肩臂、躯干、下肢按局部边界交接，头部在中段短窗口内换形，喙继续伸长。
- 82 根羽毛的锚点由正式蒙皮表面初始化取得，动画时跟随骨骼；短覆羽先长出，再形成较长翼羽。反向收退，无绕体壳、闪光遮罩或随机像素消散。
- 42 tick 完成，21 tick 继续执行原碰撞高度切换和空间检查；展示场镜头收紧，保留脚底与地面。
- 保留动态几何和材质的对象身份，避免切断腿部、嘴囊、推进器和技能 FX 更新；仅静态共享模型几何克隆。临时 GPU 属性释放后恢复原几何与材质钩子。
- 蒙皮按正式模型结构识别，兼容精细、标准、轻量三档，避免绑定单档节点名。
- 子代理完成探索/设计/渲染与时序实现、代码审查、相关和全量检查；主代理逐帧浏览器校准、三档兼容修正及最终集成。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/player-transform.ts、player-view.ts | 贴身羽毛生长、部位和体态渐变、双向恢复 | yes |
| src/config/player-form.ts | 0.7 秒变身时序 | yes |
| src/config/showcase.ts、src/app/showcase/pelican.ts、src/ui/showcase-language.ts 等 | 更新演示与羽化提示文案 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器双向、暂停、重播与截图 | yes | yes |
| 子代理审查 | yes | yes |

## Validation notes
- 时序与文案子代理执行 `node --test test/player-transform.test.ts`：9/9 通过。
- 已确认分镜存为 `evidence/approved-concept.png`，用于实机画面对照。

- 最终 `npm test`：1565/1565 通过，0 失败，119.2 秒；性能项通过，无需调整阈值或重跑全量。
- `npm run typecheck`：通过。三档蒙皮入口修正后再执行一次，仍通过。
- `npm run build`：通过；最终三档入口修正后构建 8.11 秒，仅既有大 chunk 提示。
- 浏览器固定帧检查双向变身；暂停与重播无新错误；标准、精细、轻量三档实际创建并完成换形。正式展示场手动 F 两个方向的状态与画面正确。
- 子代理审查最终 Approved：动态资源引用及临时 GPU 属性回收问题均已解决。
- 实机证据：`evidence/feather-growth-runtime.png`。临时浏览器验收页面已清理，未增加渲染细节测试。
- 测试日志：`$TMPDIR/pelican-feather-growth-full-test.log`；类型与构建日志位于同目录同前缀。工作区无 Git 初始提交，按本轮备份逐文件核对并保留并发改动。
