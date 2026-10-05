# FIX -- 第一章亮度与黑洞漩涡

## Status: done
## Task: 111
## Related: 107
## Baseline Commit: 无 HEAD；改前快照 $TMPDIR/pelican-fortress-brightness-before

## Problem
第一章整体太灰暗，黑洞漩涡效果差。

## Root Cause
- facility-presentation.ts 的低环境补光会被雨夹雪再次压暗；facility-sky.ts 又给偏暗远景图乘上灰色，天气调色进一步降低饱和度。
- facility-approach.ts 的黑洞只改变整张贴图亮度，没有吸积盘内持续运动的纹理。

## Fix Plan
- [x] facility-presentation.ts：提高第一章广域补光及环境反射，恢复色彩；保持局部设备灯强度。
- [x] facility-sky.ts：取消灰色乘色，提亮并恢复科幻蓝色远景。
- [x] facility-approach.ts：黑洞固定黑核、连续盘面旋转及向内卷入。

## Verification
- [x] 浏览器对比游戏与预览亮度，检查机柜高光、漩涡运动、黑核与透明边缘；暂停控件正常；控制台无 warn/error。截图 output/chapters/fortress-brighter-vortex.jpg。
- [x] npm run typecheck：通过，由实现子代理在全部代码修改后运行。
- [x] npm test -- --test-concurrency=2：1528/1528 通过，无失败、跳过或取消。
- [x] npm run build：通过，保留既有 chunk 体积提示。
- [x] 子代理审查 / diff-guard：无阻断；天气捕获时序、共享预览、固定透明边缘及资源销毁不变。

## Decisions
- 使用 fix 流程进行可回退的局部视觉修正；不新增渲染细节测试。
- 复用原有图片、时间更新与共享渲染，不增加依赖、灯数量或后期通道。
- 盘面与透镜弧采用独立纹理流动，内圈更快；少量螺旋细丝向内运动，保留前景吸积盘遮挡和固定黑色核心。仍单次绘制，三次纹理采样。
