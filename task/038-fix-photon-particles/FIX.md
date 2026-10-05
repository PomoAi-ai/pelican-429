# FIX -- 光子由粒子构成

## Status: done
## Task: 038
## Related: 031
## Baseline Commit: 无 HEAD；修改前副本在 $TMPDIR/photon-particles-before

## Problem
用户要求光子本身由粒子构成，现有造型错误地使用实体球壳、眼睛、光核和彗尾。

## Root Cause
src/render/luma/luma-rig.ts — 主体使用 SphereGeometry 和实体尾部网格，粒子只作点缀，没有满足角色由粒子形成的视觉要求。

## Fix Plan
- [x] 共享 rig 完全替换为四层、840 个有三维位置的粒子，主体、流光和逸散均由点精灵叠加，无实体外壳/眼睛/光核/尾巴。
- [x] 五种动画通过粒子流动、密度与亮度表达，时间采样可循环和暂停。
- [x] 同步角色设定、目录描述、预览文案、真实预览缩略图；预览视角同步当前 modelYaw 接口。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1485 项通过，0 失败；日志 $TMPDIR/photon-particles-tests.log。后续仅调整粒子数量、大小和亮度，视觉检查通过，未重复全量测试。
- [x] npm run build：通过；保留大于 500 kB 的产物体积提示。验证中曾受其他正在进行的改动缺少 player-teleport.ts 影响，该文件出现后复查通过，未修改该模块。
- [x] 浏览器明暗、五视角、五动作及暂停/重播检查；暂停前后截图字节一致。截图 output/luma-preview/photon-particles.jpg；真实预览裁切更新 public/characters/luma/portrait.jpg。
- [x] diff-guard：与修改前副本核对，仅角色相关修改；不新增防御性兜底或渲染细节测试。

## Scope
本轮完成角色定义、共享三维粒子资产和五种展示动画；游戏内跟随、寻路与目标选择未接入。
