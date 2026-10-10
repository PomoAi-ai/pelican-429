# FIX -- 可见太阳与光照面板联动

## Status: done
## Task: 363
## Related: 362
## Baseline Commit: 975f136

## Problem
太阳滑杆仅调整光照与太阳能板，没有可见太阳。

## Root Cause
room-scene-preview 未装配共享 celestial-sky；已有太阳天体方向固定。

## Fix Plan
- [x] 复用已有太阳贴图与天体渲染，增加太阳方向更新接口。
- [x] 正常场景与大场景沿天空弧线更新太阳、主光和太阳能板，三者使用同一世界方向；不改变游玩或镜头状态。
- [x] 天体随镜头平移保留世界方向，旋转时按实际视野呈现；离开场景释放资源。

## Verification
- [x] npm run typecheck
- [x] npm test：1859 项通过；最终视觉位置调整后复验 definition-settlement 与 perspective-player，9 项通过。
- [x] npm run build：通过，保留原有大 chunk 提示。
- [x] 浏览器验收太阳左右移动、光照与面板同步、游玩镜头互不干扰；diff-guard 检查。

## Result
- 正常游玩画面可见太阳；独立太阳能场景左、右调节时太阳与面板同步反向，太阳文字标记已由共享天体替代。
- 自动追光、正常跟随下行走、自由镜头下调整、技能释放均验收；控制台无错误。
- 截图 `/tmp/perspective-sun-left.jpg`、`/tmp/perspective-sun-right.jpg`。
- `git diff --check` 通过；未添加渲染细节自动测试，未提交推送部署。
