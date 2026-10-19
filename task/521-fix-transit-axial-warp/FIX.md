# FIX -- 星舰正尾部平视与时空航道

## Status: done
## Task: 521
## Related: 519
## Baseline Commit: a13fdd68

## Problem
- 当前镜头偏在舰尾侧下方，仍能看到大段侧面，不符合纯尾部平视。
- 星流主要是径向线条，缺少穿越空间层与时间拉伸的节奏。

## Root Cause
- src/app/transit-app.ts 的追航相机保留 x/z 偏移，仍为三分之四视角。
- src/render/transit-time-corridor.ts 只有固定速度星点层，缺少加速和空间波纹。
- 现有离子喷体为侧向观测设计，正轴视角须校正可见度，避免遮住全部喷口。

## Fix Plan
- [x] src/app/transit-app.ts — 相机严格共轴，Z 为屏幕上方向；正尾部平视不横向漂移，入场仅沿舰轴退距。
- [x] src/render/transit-exhaust.ts — 五个真实深度截面叠加湍流噪声，白热内核、暖色近喷口、蓝白外围；消除正轴观察时的规则蓝色同心圈。
- [x] src/render/transit-time-corridor.ts — 0.8 秒加速星流、七层透视空间波纹与穿环节奏，真实加载期间继续运动。

## Decisions
- 使用 fix 局部修复流程；沿用既有碰撞/门/加载流程，保留顶部座舱与舰体。
- 视频仅作构图和喷口观察参考，游戏不引用视频资源。场景与特效全部实时渲染。
- 观察参考：[SpaceX Flight 5 猛禽发动机慢动作静态点火](https://x.com/SpaceX/status/1817312715758862485)，浏览器实际播放并观察了喷口正对镜头的燃烧画面。
- 子代理负责航道着色器，主代理负责共轴相机和尾焰，并统一实机验收。
- 航道中央保留暗区；减少动态效果偏好下减缓星流、减弱空间波纹。没有新增依赖或渲染自动测试。

## Verification
- [x] npm run typecheck — 通过；最终尾焰参数调整后重跑通过。
- [x] npm test — 2008/2008 通过，302 suites；后续仅调尾焰显示参数，没有重复全量测试。
- [x] npm run build — 通过；最终尾焰参数调整后重跑通过。保留既有大 chunk 提示。
- [x] 本轮 diff-guard — 子代理只读定向审查三文件相对本轮快照的修改，无发现；最终 diff --check 通过。
- [x] 浏览器 — 开发版实际到达大教堂与堡垒；构建版 5187 实际到达光纤深渊。正尾部无侧面/斜角，湍流尾焰、星迹、波纹在加载阶段持续，随后白光退场，目的地 HUD 与画面正常出现。
- [x] 浏览器控制台 — 开发版尾部航道运行无 error/warn。最终构建版完成后验收标签页被移出当前浏览器会话，未读取该轮结束日志；已保存加载和到达实机截图。

## Evidence
- evidence/axial-warp-loading.png — 最终构建版，正尾部与时空航道承接光纤深渊真实加载。
- evidence/abyss-arrival.png — 进入目的地后的真实游戏画面。
- 未进行移动设备或 reduced-motion 实机验收；未提交、未推送。
