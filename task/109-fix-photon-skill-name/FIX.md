# FIX -- 光子大招命名

## Status: done
## Task: 109
## Related: 108
## Baseline Commit: 无（仓库尚无提交；相关文件备份于 $TMPDIR/photon-skill-rename）

## Problem
用户希望光子大招使用更贴近爆炸、爆发感的名称。

## Root Cause
原名“光子乱舞”未突出大招的爆发感。

## Fix Plan
- [x] 中文名称统一为“光子爆裂”，英文为“Photon Burst”。
- [x] 更新技能栏、操作提示、宠物动作、展示场卡片与状态、概念图资源标签。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 通过。
- [x] npm run build — 通过，原有大分包提示。
- [x] 检查旧名称残留与 diff-guard — src 中显示旧名已全部替换；逐文件对照备份，仅名称文案变化。
- [x] 浏览器确认展示场卡片标题、动作按钮与预览说明均显示“光子爆裂”，无浏览器错误。

仅修改显示文案，不新增文案断言测试。
