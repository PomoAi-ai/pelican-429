# FIX -- 游戏场景帧率快捷键

## Status: verifying
## Task: 191
## Related: N/A
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Problem
游戏场景支持 Cmd+Option+Z / Ctrl+Alt+Z 显示帧率，再按隐藏；普通 Cmd/Ctrl+Z 保留撤销功能。
普通游戏设置的“画面”组也提供“显示帧率（FPS）”开关，与快捷键同步并恢复保存值。

## Root Cause
src/app/game-app.ts:292 仅在调试模式接入性能面板键盘监听；src/ui/perf-panel.ts:52 仅处理 P 键。
设置项原属 debug 分组，被普通游戏设置隐藏；启动阶段还会覆盖非 GM/章节场景保存的帧率设置。

## Fix Plan
- [x] 复用现有性能面板和采样链路，所有游戏场景接入 Cmd+Option+Z / Ctrl+Alt+Z，保留调试模式 P 键。
- [x] 忽略输入控件、可编辑内容和 Shift 组合；长按不重复切换，销毁时移除监听。
- [x] 帧率开关归入画面组，提供中英文标题和快捷键说明；所有游戏场景恢复保存的帧率设置。

## Verification
- [x] npm run typecheck
- [ ] npm test：设置开关调整后 1727/1728 通过；世界生成耗时用例再次失败，中位数 1031.6ms，阈值 250ms。本次仅调整设置分组、文案与帧率开关恢复，不修改世界生成实现或断言；保留 verifying 状态。
- [x] npm run build（通过，有大于 500 kB 的资源包提示）
- [x] diff-guard 审查：仅复用已有面板并接入快捷键，无新增兜底、依赖或防御性内部校验；git diff --check 通过。
- [x] node --test test/perf-panel.test.ts（4/4 通过）：普通场景 Cmd+Option+Z / Ctrl+Alt+Z、旧快捷键不拦截、长按、编辑控件撤销、销毁清理。
- [x] node --test test/settings.test.ts test/perf-panel.test.ts（26/26 通过）：先复现普通游戏设置缺少帧率开关，修复后验证点击立即生效且同步外部快捷键状态。

未进行浏览器人工视觉验收。
