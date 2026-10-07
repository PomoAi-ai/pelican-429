# FIX -- 资源下拉文字与箭头对齐

## Status: done
## Task: 322
## Related: 321-fix-navigation-alignment
## Baseline Commit: 2a5455a964e5b71781c766c36abb5245c5f3e903

## Problem
菜单框虽然对齐，菜单文字仍比按钮文字多缩进9px，字形箭头偏低。

## Root Cause
菜单边框1px+外padding8px+链接padding14px，与按钮14px不一致；箭头使用字体字形。

## Fix Plan
- [x] 同一变量控制按钮和菜单文字起点，扣除菜单边框；手机跟随10px缩进。
- [x] CSS绘制居中箭头，不使用基线偏低的字符。

## Verification
- [x] typecheck/test/build 均通过；全量测试1808/1808通过。
- [x] 浏览器文字Range坐标与截图：桌面触发文字与全部菜单文字x均为997.8046875px，顶部各项文字y均为25.5px；390px手机视口文字x均为26px。箭头截图确认居中。
- [x] diff-guard：无新防御逻辑或UI自动测试。
