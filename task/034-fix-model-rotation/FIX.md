# FIX -- 角色展示场自由旋转

## Status: done
## Task: 034
## Related: 030-grassy-static-models
## Baseline Commit: N/A（仓库尚无HEAD；相关文件快照 $TMPDIR/grassy-rotation-baseline）

## Problem
角色展示场的Grassy模型只能选择固定方向，不能拖动连续检查造型。

## Root Cause
src/app/showcase/human-session.ts 和 luma-session.ts 每帧按modelView预设覆盖旋转；角色预览没有拖拽交互，已有资源旋转仅作用于资源卡。

## Fix Plan
- [x] src/config/showcase.ts、src/ui/showcase-model.ts — 用连续水平/俯仰角保存观察状态；复制角度，不重建或中断同步播放。
- [x] src/app/showcase/human-session.ts、luma-session.ts — 读取连续水平角，镜头绕角色中心俯仰。
- [x] src/ui/model-camera-controls.ts、showcase-panel.ts — Grassy三档与原有光子模型视角支持拖动360度查看、方向键、预设和复位；关闭卡清理事件。

## Verification
- [x] npm run typecheck — exit 0，$TMPDIR/grassy-rotation-typecheck.log
- [x] npm test — 1485/1485通过、303 suites、33.55秒，$TMPDIR/grassy-rotation-test.log
- [x] npm run build — exit 0、1.35秒；仅既有大chunk提醒，$TMPDIR/grassy-rotation-build.log
- [x] 浏览器实际拖拽到水平160°/俯仰21°，画面显示背面斜上方；释放后移动不继续旋转。切换精细版保留角度；背面预设回到180°/0°；方向键跨180°环绕正常。
- [x] 添加对照复制-165°/0°；第一张旋转到-150°时第二张仍-165°。关闭对照正常；双击恢复45°/0°。
- [x] core-review + diff-guard独立复核Approved：指针捕获、取消/解绑、键盘、预设一致性、独立卡片和同步播放未发现明确问题。

不新增渲染/UI自动测试；造型旋转效果通过浏览器实际操作查看。其他角色的手动玩法输入和资源观察交互保持原有实现。

## Result
旋转状态由连续弧度保存，水平360度环绕，俯仰限制-45°到60°。下拉方向会根据当前角度显示预设或“自由视角”；保留缩放，新增复位按钮、双击、方向键与Home复位。未改角色几何、材质或动作。
