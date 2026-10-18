# FIX -- 头发预览对齐实际角色展示场

## Status: done
## Task: 467
## Related: 466
## Baseline Commit: c292d188

## Problem
用户截图的正式自定义着色器在预览中仍显得不同，上次误将普通高画质舞台作为截图展示场配置。

## Root Cause
src/app/character-stage-app.ts:33使用quality low/msaa，238–248独立背景与背向太阳；头发game-stage却high/default-AA/默认太阳，额外AO造成灰斑。
5174与5184实际服务D1着色器sourcesContent哈希一致（b8889b0375da5b5b09d52768e8144543dbb24491b8d9c0bafa2204c7596ec1b0），排除着色器版本不同。

## Fix Plan
- [x] 抽取角色展示场实际profile、背景和太阳计算，原展示场复用，保持行为不变。
- [x] 头发游戏环境直接复用同一profile，保留检查棚光。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器对照无灰斑，九款及棚光切换正常
- [x] diff-guard审查

## Result
两个服务实际sourcesContent哈希一致。复用自定义shader无需改写；真正差异是前次接错舞台quality/AA/sun。
新增共享character-stage-look配置供原展示场与预览读取，原展示场行为数学等价，太阳面板默认值也共用。
类型检查通过；1960测试全通过；最终构建通过（大chunk提示）；diff检查与独立审查通过。
浏览器九款完整加载、45度对比、棚光往返无控制台error，38皮肤/耳朵/肩部的额外AO灰斑消失。
截图output/hair-gallery/actual-showcase-shader-match.png。未做资产造型或眼睛修改，未提交推送。
