# FIX -- 鹈鹕飞行羽毛阴影

## Status: verifying
## Task: 103
## Related: 098
## Baseline Commit: 无 HEAD；修改前模块保存于 $TMPDIR/pelican-flight-shadow-rig-before.ts

## Problem
飞行时翅膀阴影过重，羽毛背面和相互遮挡区域显得厚重发黑。

## Root Cause
固定下拍、平展、上拍姿态对照发现，关闭翅膀投影/接影仍保留灰黑斑，关闭 AO 后暗斑消失。共享后期对羽毛交叠按厚实物体计算全强度 GTAO，使背面和颈部出现过重遮蔽。

## Fix Plan
- [x] src/render/pelican/pelican-rig.ts — 用 vendor 已有白羽毛材质标记筛选，HDR alpha=-0.8 传递20%局部AO权重；保留正常投影、接影和受光，不改 vendor。
- [x] src/render/post-fx.ts — 负HDR alpha解码为局部AO权重并恢复不透明输出；普通透明度与加色特效使用的非负alpha保持原有AO。场景全局AO和灯光保持原值。

## Verification
- [x] 固定飞行姿态前后截图、左右朝向目视验收
- [x] 实际展示场目视验收；共享光照挂接后羽毛仍正常，浏览器无报错
- [ ] npm run typecheck — 当前仅余无关文件 src/render/grassy/grassy-flight-pose.ts:23 的 TS2352；未修改该文件，保留 verifying
- [x] node --test --test-concurrency=4 'test/**/*.test.ts' — 1528/1528通过
- [x] 最后调整标记后重跑 pelican-view、lighting、ao-prepass、vendor-integrity — 70/70通过
- [x] npm run build — 通过，现有大文件体积提示
- [x] 子代理按 core-review/diff-guard 复核两个模块；正alpha与加色特效冲突已改为负alpha标记，最终Approved

本次为纯渲染调整，按项目规则不新增材质细节断言。

固定姿态临时检查页已移除，前后截图保存在 evidence/。未提交或推送。
