# FIX -- 角色展示场卡死，并录入 Grassy Rodin 版

## Status: done
## Task: 055
## Related: N/A
## Baseline Commit: 无（仓库尚无提交；修改前文件保存在 $TMPDIR/grassy-rodin-fix-before）

## Problem
- 打开角色展示场（任意角色，包括只看鹈鹕）都要先等全部 Grassy 静态模型加载完；grassy-models 对比页滚动时长时间无响应。实测 12 个 GLB 约 265 MB（单个最大 85 MB、230 万面），20 秒内长任务累计 14.7 秒，帧率 12～25。
- 需要把 Hyper3D Rodin 生成的模型加工成精细、游戏标准、轻量三档，作为「Rodin 版」录入展示场对比。

## Root Cause
- src/app/showcase-app.ts:14 — `mode === 'showcase'` 时启动前 `await loadGrassyStaticAssets()`。
- src/render/grassy/grassy-static.ts:61 — 该函数一次性加载并解析 `GRASSY_MODELS` 中的全部 GLB，与页面实际显示哪些卡片无关；版本越多，启动越慢，内存与主线程占用越高。

## Fix Plan
- [x] src/render/grassy/grassy-static.ts — 改为按版本加载并缓存，只加载卡片实际显示的版本。
- [x] src/app/showcase/human-session.ts — 会话创建时开始加载当前版本，加载完成前显示加载状态；切换版本时加载后再替换；加载失败照常抛到页面错误处理。
- [x] src/app/showcase-app.ts — 去掉启动时的全量加载。
- [x] scripts/blender_grassy_rodin/build.py — Rodin 原始模型统一为 3.1 格、鞋底 0，减面出三档，导出 GLB 与五向渲染。
- [x] src/config/grassy.ts — 登记 Rodin 版三档。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器：角色展示场首屏不再等待全部模型；grassy-models 对比页滚动可响应；Rodin 版可切换
- [x] Bug is fixed

## Results
- 展示场入口不再全量加载：只看鹈鹕的默认页面只请求 1 个 Grassy GLB（之前 12 个约 265 MB）。
- grassy-models 对比页 15 张卡：首屏约 0.6 秒可用；从上到下滚动时按卡片逐个加载，各段帧率 45～54，单帧最长 316 ms（加载模型的那一帧）。修复前帧率 12～25，20 秒内长任务累计 14.7 秒。
- Rodin 版三档：精细版 199,999 面、10.96 MB、2K 贴图；游戏标准版 45,000 面、2.16 MB、1K 贴图；轻量版 20,000 面、0.98 MB、512 贴图；GLB 实测 Y 范围都是 0～3.1，无动作。
- 独立页面 static-model-scene.html、model-comparison/capture.html 同步改用 loadGrassyStaticAsset。
- npm run typecheck：通过；npm test：1499/1499；npm run build：通过。
- 浏览器：Rodin 三张卡显示真实模型，版本切换往返正常，控制台无 error。
- diff 已逐文件人工检查：只有加载方式、调用方和 Rodin 登记，未新增测试和防御分支。仓库无提交，dev:diff-guard 依赖 git diff，未运行。
- 未处理的其他问题：static-model-scene.html 因 054 任务新增的 models-reference-fit/manifest.json 缺少 models 列表而加载失败，与本修复无关。
