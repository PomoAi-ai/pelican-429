# FIX -- 黑洞随机逃逸光迹与吸积盘辨识度

## Status: done
## Task: 198
## Related: 194
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Problem
逃逸光线呈固定六臂，缺乏真实向外移动的亮头；整体更像同心旋涡，要求加入随机性并参考公开黑洞渲染。

## Root Cause
src/render/facility-blackhole.ts — 六臂由固定角频率正弦生成，时间仅推进条纹；外围宽圆盘的不透明度和亮度压过薄吸积盘与透镜拱。

## Fix Plan
- [x] 共享黑洞 shader：12 槽位按出生周期生成稳定随机参数，亮头沿弯曲路径向外加速，有限拖尾、淡入淡出。
- [x] 收弱宽圆盘，强化黑影、光子环、薄吸积盘及上方透镜像，加入旋转方向对应的明暗和色温差；抬高透镜拱，避免被核心遮罩覆盖。
- [x] 保留 Wendland、玩家/宠物中心变形及现有生命周期接口，不添加依赖或渲染通道。旋转角从权重一次方改为平方，中心最大角不变、外围旋转收紧，减少吸积盘被拧成旋涡。

## References and Decisions
- https://ebruneton.github.io/black_hole_shader/ — 参考黑影、吸积盘透镜像、Doppler/beaming 的视觉结构。
- https://oseiskar.github.io/black-hole/docs/physics.html — 参考弯曲光路与吸积盘明暗不对称。
- 自行编写适配横版游戏的解析近似与风格化外流光迹；不复制外部代码、不声称采用测地线求解或模拟视界内真实光逃逸。

## Verification
- [x] npm run typecheck — 通过；最终 shader 与后处理调整后复跑通过。
- [x] npm test — 1728/1728 通过，无失败、跳过。最终后处理调整后针对性运行 node --test test/lighting.test.ts test/ao-prepass.test.ts，45/45 通过。
- [x] npm run build — 最终版本通过，5.96 秒；现有体积与插件耗时提示。
- [x] 浏览器：游戏低画质与共享场景预览高画质正常渲染，控制台无错误/警告；录制 6 秒实际场景动画，检查不同时间的光迹位置。
- [x] diff-guard 审查 — 子代理确认周期换种子时透明度归零、亮头半径递增、有限拖尾、无额外依赖；修复负底数 pow 的 GLSL 未定义行为。

## Evidence
- 实际共享场景录屏：/tmp/pelican-blackhole-random-trails.webm，5.91 秒、58 帧；12 张时间采样可见光迹位置、出生及消失变化。录屏帧率不作为独立 GPU 性能基准。
- 动图：/tmp/pelican-blackhole-random-trails.gif；完整页面截图：/tmp/pelican-blackhole-random-trails.jpg。
- 仅修改两个相关渲染模块与本记录，未新增渲染自动测试、未提交或推送。
