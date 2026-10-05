# FIX -- Astra 主角与背景模型层级

## Status: done
## Task: 064
## Related: 063
## Baseline Commit: 无HEAD；本次前快照保存在 $TMPDIR/pelican-leads/（render.ts/config.ts/models.ts）

## Problem
用户明确GPT-6 Astra是主角与最终高潮，Claude作为关键铺垫，其他模型降为背景；加入降智/路由的戏剧桥段与Mistral吐槽彩蛋。

## Root Cause
src/render/intro-finale.ts 的 modelPorts 大卡片与 perception 的Gemini大标题抢占核心型号的演出空间。

## Fix Plan
- [x] 背景模型退到低亮小字，移除大卡片。
- [x] 保留Claude主线与Astra最终高潮，中段改为Astra预热及路由喜剧，高潮以 ROUTE RESTORED. ASTRA ONLINE. 收束。
- [x] 同步章节字幕。
- [x] 用户再次明确要求补Mistral吐槽，采用“法国代表友情客串：主角在改写世界，我在润色开场白。”，于12.5秒起淡入、16.5秒前淡出，不加入婚姻笑话或性能排名。

## Verification
- [x] npm run typecheck：Mistral彩蛋最终轮通过；上轮任务外facility参数错误已不再出现，本任务未改动该文件。
- [x] npm test：Mistral彩蛋最终轮1504/1504通过（304 suites，74.4秒）；上轮两个任务外cave-island光照错误本轮未再出现，本任务未修改相关代码或断言。
- [x] npm run build：Mistral彩蛋最终轮通过，3.22秒，保留现有chunk体积与插件耗时提示。
- [x] 浏览器视觉验收与diff-guard：15.2秒预热/故障与19.2秒星空高潮均正常；控制台无报错。改动只有两文件关联函数与字幕，删除大卡绘制，无新增防御校验或自动视觉测试。

上轮日志位于 $TMPDIR/pelican-leads/。Mistral彩蛋最终轮日志位于 $TMPDIR/pelican-mistral-{typecheck,tests,build}.log。最终轮三项命令串行各一次，均通过；桌面及390×844窄屏的14.8秒彩蛋已人工检查，浏览器无错误，临时viewport已恢复。截图：$TMPDIR/pelican-mistral-cameo.jpg。
