# FIX -- 黑洞中心强化与 Wendland 衰减

## Status: done
## Task: 194
## Related: 189
## Baseline Commit: 3a35077

## Problem
扭曲范围过大，黑芯内部因保护窗不变形。用户选定 Wendland，要求越靠近中心越强、宠物进入中央后抽象拉伸，并有强烈向外流动的亮线。

## Root Cause
src/render/post-fx.ts 的 smoothstep 环形窗使中心权重为零；facility-presentation 的16格半径使周边地形整体变形。黑洞片元着色器核心只合成黑色和前盘，没有向外光流。

## Fix Plan
- [x] src/render/post-fx.ts — 中心最大、边缘归零的 Wendland 权重，内圈强化旋转与非均匀拉伸。
- [x] src/app/facility-presentation.ts — 两条入口范围统一缩为9格。
- [x] src/render/facility-blackhole.ts — 中心向外的细亮流束，保留黑底与吸积盘；艺术效果不宣称真实霍金辐射。

## Verification
- [x] npm run typecheck
- [x] npm test -- --test-concurrency=2：1723/1723 通过，301 suites，0失败/跳过；世界生成性能用例也通过。日志 /tmp/pelican-blackhole-core-test.log。
- [x] npm run build：退出码0，5.15秒；仅Vite插件耗时和大chunk提示。日志 /tmp/pelican-blackhole-core-build.log。
- [x] 浏览器检查范围过渡、核心角色变形、向外光流；不新增渲染实现细节测试。低画质游戏中实际飞入黑芯，鹈鹕身体倒转并拉长喙，Luma 亮点拉为光带；截图 /tmp/pelican-wendland-core.jpg。
- [x] Diff guard：子代理审查通过，无发现；本轮三文件 diff --check 通过。

## Decisions
- Wendland 使用从中心起算的 d/9，中心权重1、边缘0，取消内圈保护窗；2.4弧度旋转、0.5收缩和0.25×权重平方的非均匀拉伸。主体映射54180个临时数值采样未出现翻折。
- 六股蓝白暖金窄束沿微螺旋向外流动，使用现有时间uniform；作为艺术表现，不当作真实霍金辐射或事件视界内光线逃逸。

## Constraints
只改本轮三个模块；现状副本在 /tmp/pelican-blackhole-core-baseline。保留工作区其他未提交修改。
