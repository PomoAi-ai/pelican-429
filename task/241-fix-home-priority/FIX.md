# FIX -- 顶部优先与下方图片按需加载

## Status: verifying
## Task: 241
## Related: 240
## Baseline Commit: 8a8fe8c

## Problem
保证顶部先加载，下方资源随后按需加载。

## Root Cause
下方图片虽有 loading=lazy，浏览器仍会提前加载较远的图片，与顶部实时场景争抢请求。

## Fix Plan
- [x] 下方图片使用 data-src，避免 HTML 预扫描提前请求。
- [x] 顶部场景初始化完成后才启用下方图片观察，仅在距离视口 120px 内发起请求。
- [x] 锚点直达下方时直接按需加载当前内容，保留顶部离屏不启动的约定。

## Verification
- [ ] npm run typecheck：被非本次修改的 src/sim/photon-system.ts:77 阻塞，number 不能赋给字面量 18。
- [ ] npm test：1766/1768 通过；光子技能相关 combat.test.ts:354 和 showcase.test.ts:160 失败，本次仅修改首页入口和 HTML，不修改这些逻辑与断言。
- [x] npm run build：通过，仍有已有大代码块警告。
- [x] 浏览器验证顶部请求与滚动后的图片请求：顶部显示时 13 张下方图片均无 src；请求仅含顶部预览、头像、二维码、四张 KTX2 背景。滚到角色区后主角三张图片加载成功，后方 Boss/守卫图片仍未加载。
- [x] 按 diff-guard 检查本次增量，无吞错、额外防御性校验或源码匹配测试。
- 渲染和 UI 通过浏览器验证，不新增源码匹配测试。
