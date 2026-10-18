# PLAN -- 固定轮矢量尾喷飞行车入游戏

## Status: done
## Task: 501
## Related: 490, 491
## Baseline Commit: c292d188

## Goal
按选定四视图制作可编辑三维模型、导出 GLB 并接入港口的可承载飞行 NPC；三个轮子永久外露，四底喷独立，整幅尾喷可转动且喷流跟随。

## Non-goals
不做工程适航证明、不替换其他模型、不提交推送、不清理既有工作区。

## Acceptance Criteria
- 可编辑 Blender 源文件、游戏 GLB、四视图及喷口转动证据。
- 保留长尖鼻、双尾鳍、白色外壳与暗玻璃、三个固定轮、宽幅尾喷。
- 游戏内往返飞行和玩家承载保留，尾喷在悬停与巡航间连续转向。
- 实际运行类型检查、测试和构建，检查游戏画面。

## Constraints
参考图不是一致正投影，必须记录比例冲突，不宣称逐像素精确。原 Blender 场景不得覆盖。保留现有未提交修改。

## Decisions
- 探索由 explore_vtol 完成，复用 flying-roadster 行为及 loadCharacterModel。
- 架构沿用已有同步视图/启动预加载方案，文件映射已完整，省略重复架构委派。
- 独立 Blender 后台进程建模，保留用户活动 Blender 场景。
- Blender 使用横向 X、纵向 Y、上 Z，车头 -Y；导出后父组绕 Y 转 pi/2 使车头 +X。TailPivot 本地 X 转负角度使尾喷朝下。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | assets/vehicles/white-vtol/ | 建模源、配准、视图校准、说明 | | yes |
| 2 | public/models/white-vtol/model.glb | 三轮四底喷及整尾可动模型 | 1 | yes |
| 3 | src/render/flying-roadster-view.ts | 载入模型、动态尾喷及离子流 | 2 | yes |
| 4 | src/app/game-app.ts, src/app/residence-app.ts | 两入口资源预加载及释放 | 3 | yes |
| 5 | src/config/flying-roadster.ts | 共享尺寸与承载面 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender 导出结构自检、四视图比较 | yes | 用户指定侧面主稿：IoU 0.951；六关键点最大3.57px；其余视图保留冲突说明 |
| npm run typecheck | yes | yes |
| npm test | yes | yes: 1989 passed；发布清单修复后模型测试7/7 |
| npm run build | yes | yes |
| 港口浏览器视觉与站立验证 | yes | 静态包实际运行无控制台错误；车体/固定轮/离子流可见；承载50项+392起跳扫描通过，未录到人工登车成功画面 |

## Validation findings
- 审查发现局部 X 拉伸让旋转后的轮子变椭圆；已先应用旋转与缩放再变换，实际导出轮底为 0。
- 原图透视与比例冲突已记录；四方向 IoU 为 0.715 / 0.801 / 0.729 / 0.578，未达到精确还原，任务不能记 done。
- 独立 subagent 完成定向审查与全量测试，源代码无其他阻断发现。
- predev/prebuild 运行既有 docs:resources 自动再生 material-library.md，该文件原有未提交改动，未回滚。

## Open decision
已交付可动接入版本，精确拟合仍待完成。已向用户提出侧面 / 正面 / 俯视哪张作为尺寸主参考的问题；推荐侧面。各参考互相矛盾，收到选择后继续修正另一方向，不擅自宣称精确完成。

## Side master decision
用户明确选择侧面作为唯一尺寸主参考。以长7、参考像素鼻44/尾1706/地683注册；调整轮距、舱顶、玻璃后缘、尾鳍、进气口。其他三视图保留比较但不再作为互相冲突的强制门槛。采用四视图配准和闭环拟合技能，侧面轮廓与特征点作为验收。
保留既有探索与架构结果，不重复委派；本轮量取与承载检查分别由 vt​​ol_side_fit、vtol_carry_check 执行。

## Completion after side master selection
- 用户已裁决侧面为尺寸主参考，无待确认设计问题。侧面整体与六关键点通过拟合门槛；前后和俯视随此模型统一，不再要求匹配旧稿矛盾比例。
- 后轮前移、玻璃舱抬高缩短、尾鳍后移，凹进气口、白色后背和隐藏尾轴重新建模。GLB保留18网格/7材质，编辑源154独立网格及尾喷动画。
- StandDeck改空节点标记真实平顶，配置高度1.936，半宽.28；模型纵向移.63使承载点居中。
- 静态预览发现发布清单遗漏车辆及港口必需无人机模型，补齐RELEASE_MODEL_PATHS并共用车辆路径常量；构建包两模型哈希均与public一致。
- review确认源文件可重开、尾喷层级/朝向、模型发布依赖无错误。类型检查、全测1989、构建通过；清单修复后再次类型检查、模型测试7项和构建通过。
- 浏览器在独立静态预览验证启动、移动、固定轮及离子流，画面见evidence/side-in-game.png。为了避免开发热重载影响验收，另启本地静态预览端口53687。
- 未提交推送、未发布；人工跳上移动窄顶未录到成功画面，不把此项声称为完成。
