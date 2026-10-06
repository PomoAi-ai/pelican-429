# FIX -- 角色切换按钮移到底部攻击前方

## Status: done
## Task: 230
## Related: 217
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
角色切换按钮仍显示在头像下面；用户要求放到底部“左键”按钮前面，稍大于其他按钮。

## Root Cause
src/ui/free-world.css 的高优先级 top 规则覆盖操作界面的底部定位。

## Fix Plan
- [x] 删除自由世界旧 top 覆盖，使用操作界面已有的底部布局。
- [x] PC 切换按钮从 52px 调到 60px，攻击与后续技能右移 6px，保持 12px 间隔及底边对齐。

## Verification
- [x] 浏览器 PC 位置、尺寸、点击切换及手机布局验收；切换 / 攻击 / 技能尺寸 60 / 54 / 52px，bottom 均 686px，点击成功切换为 pelican。
- [x] npm run typecheck、npm test、npm run build 通过；1759 个测试通过，0 失败。
- [x] diff-guard 与 git diff --check 通过，仅修改相关样式。

UI 不新增自动测试；未提交或推送。
