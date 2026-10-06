# FIX -- 手机自动瞄准、全屏入口与版本显示

## Status: done
## Task: 289
## Related: N/A
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
手机和 PC 需要可见的浏览器全屏按钮；手机使用自动瞄准；FPS 后显示版本。

## Root Cause
- src/ui/control-surface.ts：全屏入口隐藏在菜单内，并依赖 fullscreenEnabled 才创建；触控拖动保留手动瞄准方向。
- src/app/frame-loop.ts：手机没有自动选敌，未拖动时只按朝向射击。
- src/ui/perf-panel.ts：帧率文本没有使用项目版本。

## Fix Plan
- [x] 常驻全屏切换按钮，调用宿主页面全屏 API，支持 WebKit 入口并显式显示错误。
- [x] 手机模式自动瞄准最近的屏内敌方活体目标。
- [x] 精简与展开 FPS 均显示 package.json 版本。

## Verification
- [x] npm run typecheck：通过
- [x] npm test：1775 项通过，唯一失败为最初直接导入 package.json 的架构违规；改为 Vite 注入后，node --test test/architecture.test.ts test/perf-panel.test.ts 重跑 25 项全部通过
- [x] npm run build：通过（有大 chunk 提示）
- [x] diff-guard 与 git diff --check：通过
- 子代理相关测试：node --test test/mobile-aim.test.ts test/weapons.test.ts test/human-combat.test.ts test/input.test.ts，53 项通过。
- 浏览器及手机真机视觉与交互验收未执行，交付明确说明此限制。
