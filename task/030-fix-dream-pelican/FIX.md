# FIX -- 飞轮梦境改为完整鹈鹕

## Status: done
## Task: 030
## Related: 024, 028
## Baseline Commit: 无 HEAD；代码快照位于 $TMPDIR/pelican-dream-before

## Problem
轮子乱飞的第三幕仍出现半人半鹈。用户要求该幕角色完全是鹈鹕。

## Root Cause
混合形象烘焙在旧底图 03-transformation-concept-v1.png 中，旧生成提示明确要求变身中间态；渲染代码没有额外人体层。

## Decisions
- 用内置 imagegen 编辑原底图，参考第四幕和共享角色图，生成完整白羽鹈鹕。
- 保留青帽、红围巾、鸟翼、长喙与两只蹼足；去除人脸、头发、毛衣、牛仔裤、鞋子和人体残片。
- 保持黄车、飞轮、旋涡房间及 Mac Studio 的构图；轮位在 1672×941 坐标下仍为 (730,650)、(1090,640)。
- 保存新版本资产与提示词，只替换统一 images.dream 的资源 URL，让全部开局共享修正。保留历史资产。
- 不修改时间线和轮子动画，不为资源/文案新增源码字符串断言测试。

## Fix Plan
- [x] 定位错误底图与全部消费入口。
- [x] 生成完整鹈鹕版本并接入。
- [x] 浏览器检查飞轮阶段与画面衔接。

## Verification
- [x] npm run typecheck
- [x] npm test（1479 tests / 303 suites，全部通过）
- [x] npm run build（保留既有大包体积提示）
- [x] Bug is fixed

## Results
- 新图为 1672×941，与旧图同尺寸同构图；图片路径为 assets/chapter-one/03-pelican-cycling-dream-v2.png，完整提示词保存于同名 prompt 文件。
- 唯一生产代码改动为 src/app/intro-app.ts 中梦境资源 URL，一次替换覆盖所有共享开场。
- 浏览器核对终版 39 秒飞轮、42 秒定格及 44 秒游戏入场，角色均为完整鹈鹕，既有车轮位置与车架保持对齐。
- 实际播放截图：output/intro-preview/finale/pure-pelican-dream-39s.png。
- 子代理只读目视复核人物残留、构图与代码差异，通过；未新增测试或防御代码。
- 检查日志：$TMPDIR/pelican-dream-typecheck.log、$TMPDIR/pelican-dream-tests.log、$TMPDIR/pelican-dream-build.log。未提交、推送。
