# FIX -- 展示场补入 Grassy gpt6.1sol版本

## Status: done
## Task: 053
## Related: 038
## Baseline Commit: 无（仓库尚无提交；修改前配置保存在 $TMPDIR/grassy-showcase-sol-before）

## Problem
独立预览页面已有模型，但主角色展示场没有 gpt6.1sol版本。

## Root Cause
src/config/grassy.ts:4 — 共享版本目录没有登记 models-atelier 的 GLB 和实际渲染前缀；角色动作、对比预设和图片资源都从此目录生成。

## Fix Plan
- [x] src/config/grassy.ts — 登记独立精细版的原始 GLB 和五方向渲染，不复制模型。
- [x] src/config/showcase.ts — 补齐版本说明。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器切换 gpt6.1sol版本，检查真实模型与渲染图，并保存截图。
- [x] diff-guard：只有相关配置与追踪文件，没有新增自动测试或防御逻辑。

## Results
- 共享模型目录登记 `atelier-detailed`，显示名称为 `gpt6.1sol版本 · 精细版`。直接使用已有 GLB 与五张真实渲染图，没有复制模型或新增渲染逻辑。
- 版本选择、资源图库和 Grassy 对比预设自动包含新版本；十张对比卡片在浏览器中全部生成，单卡切换后真实三维模型正常显示，控制台无 error。
- npm run typecheck：exit 0；npm test：1499/1499 通过，耗时 77.4 秒；npm run build：exit 0，仍有现有大 chunk 提示。
- 标准输入临时验证确认：对比卡含 sol，可切换到 sol，五个渲染路径和 GLB 文件均存在。未新增自动测试。
- 与修改前两份配置比较，diff 只有新增模型登记、对比说明和对应注释；diff-guard 无发现。
- 主展示场截图：assets/characters/grassy/model-atelier/preview-gpt6.1sol-showcase.jpg。未提交、推送。
