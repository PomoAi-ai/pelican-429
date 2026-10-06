# FIX — 主角脸部光照与眼神

## Status: done
## Task: 166
## Related: 156
## Baseline Commit: 3a35077

## Problem
光子靠近主角时把脸照得过白；眼睛半闭表情显得无神，需要保持自然随机眨眼并改善眼神。

## Root Cause
src/render/luma/luma-rig.ts:74,131：PointLight常态18，直接乘技能energy峰值6.5，实体照明最高117；跟随光靠近脸部时平方反比衰减进一步放大过曝。

src/render/grassy/grassy-rig.ts:173：旧眨眼总耗时220–355ms，睁眼平均为闭眼2.3倍。scripts/blender_grassy_rodin/face.py 的半闭上睑活动边缘只剩睁眼弧度的约21%，近似直线横切虹膜；较长半闭过程放大困倦感。

## Fix Plan
- [x] 光子点光常态强度1.8、技能上限2.52；距离人形脸部0.75–2.25格时平滑减弱，光核和粒子能量保持原样。
- [x] 增加半闭上睑中央弧度；开合总时长缩短到133–198ms，保留随机间隔和偶尔双眨。
- [x] 更新三档正式GLB和Blender文件；共享游戏/展示场资源，完成地上、地下与技能高亮时的同位置近景对比。

## Verification
- [x] `npm run typecheck`：通过。
- [x] `npm test`：1676项中1675通过；唯一失败为worldgen中位耗时289.2ms超过250ms阈值。停止模型导出和构建后，单独重跑 `node --test test/worldgen.test.ts`：29/29通过；未修改测试或断言。
- [x] `npm run build -- --outDir /private/tmp/grassy-face-light-dist`：通过，保留现有大chunk提示；独立临时输出避免并行构建争用。
- [x] 浏览器真实渲染：同位置峰值光照前后对比、地下对比、12秒自然眨眼视频；正式展示场地下光子爆裂技能正常显示，主角肤色和眼线保留。
- [x] 三档各5个开合进度，共15张近景，未见穿眼或露白；身体/15条动作逐字节保持，Basis、全闭Blink及下睑未改变。
- [x] 子代理审查通过：共享调用、坐标转换、每帧光强复位及暂停行为无新增问题。
- [x] Bug is fixed

## Evidence
- `assets/characters/grassy/model-equipped/evidence/face-light/`：实际渲染对比、正式展示场截图、自然眨眼视频。
- `assets/characters/grassy/model-equipped/evidence/eyes-alert/`：三档眼睑近景、身体/动作与形变保留报告。

## Decisions
- 使用fix/core-dev与Ponytail Full；渲染效果由浏览器检查，不新增网格/材质断言测试。
- 不降低全局曝光、不换主角肤色；只修光子实际照明与眼部表现。
- 不提交或推送。
