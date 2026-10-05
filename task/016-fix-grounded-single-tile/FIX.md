# FIX — 单格方块增加地面承托对照

## Status: done
## Task: 016
## Related: 015
## Baseline Commit: 无 HEAD；修改前快照 $TMPDIR/pelican-016-before/

## Problem
现有单格会清空周围和下方，只有悬空状态，缺少地面上单独一块泥土的真实邻接情况。

## Root Cause
terrain-layout.ts 的 single 分支只保留一个目标格并清空四周，演示预设没有承托地面的独立单格布局。

## Fix Plan
- [x] 新增地面单格布局：保留真实场地，在地表上方放一块选定材质，使用游戏形状与碰撞。
- [x] 01 自动展示悬空/贴地各四种形状共八格，02 加入地面单格拼接情况。
- [x] 原有材质、形状与详细设置全部保留，文字明确悬空和贴地，镜头能看到承托地面。

## Verification
- [x] 公开场景回归用例先红（目标位置为空气），修复后绿；覆盖两环境、四形状的材质、承托、左右和上方留空。
- [x] npm run typecheck：通过。
- [x] npm test：1466 项通过，0 失败。
- [x] npm run build：通过，保留已有包体积提示。
- [x] 浏览器查看悬空/贴地泥土效果，切换石头后八格保持各自布局与形状，02 正常显示六布局，错误日志为空。
- [x] 独立子代理按 core-review 和 diff-guard 核对快照差异，Approved。
