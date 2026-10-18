# FIX -- AI 城市材质质感与光色

## Status: done
## Task: 471
## Related: 456
## Baseline Commit: c292d188

## Problem
AI 住宅与参考图 `public/art-library/ai-city-final-home-v1/final-energy-home.png` 对比：整体偏冷、偏灰、层次平，材质缺少真实质感。取样（7×7 均值）：
- 白岩板受光面：参考 `#e9d9cd` 暖奶白，现 `#d3d1ca` 中性灰白；地砖顶面参考 `#f2e0d5`，现 `#9199a5` 蓝灰。
- 室内墙：参考 `#a79b9b`（约为外框亮度 0.7），现 `#b8bbba`（约 0.87），墙与外框糊成一片。
- 深蓝合金：参考 `#3d538a` 饱和钴蓝，现 `#1d2940` 近黑藏青。
- 米黄方石：参考 `#d4bbb0` 暖沙，现 `#484232` 暗橄榄。

## Root Cause
- `src/config/ai-city-look.ts:7-11` — 主光 `#fff8ef` 近纯白、天空半球光 `#edf3ff` 偏蓝，阴影与反弹无暖色。
- `src/render/ai-city-lighting.ts:61-65` — 环境图只有顶/地平线/地面三段渐变，无太阳亮点与暖地平线；高清漆面朝上时反射蓝天而发蓝，光面没有高光热点。
- `src/core/world-clock.ts:44` — 太阳方向 z 恒为 .7，正面分量大，砖块正面受光均匀，缺少顶亮、侧暗的体积感。
- `src/render/ai-city-architecture.ts:12-16` — `ceramic` 与 `wall` 同色 `0xe3e2df`（中性灰白）；`ceramic` 清漆 .55、粗糙度 .23 过“湿”；`alloy` 金属度 .62 使漫反射几乎消失、底色 `0x34516f` 偏灰；`ashlar` 底色 `0xb5a48e` 偏暗偏绿。
- `src/config/ai-city-look.ts:29` — AO 强度 .3、半径 .3，接缝与家具底部几乎无接触阴影。

## Fix Plan
- [x] src/config/ai-city-look.ts — 主光 `#ffe7c7`、天空光 `#eef0f2`、半球地面 `#d2b998`；AO 强度 .3→.45、半径 .3→.4，由 `AI_CITY_LOOK.aoIntensity` 统一供舞台调参与光照启用两处使用
- [x] src/render/ai-city-lighting.ts — 环境图加暖色地平线带与随太阳方向移动的暖色亮斑（晴天按日光强度，云量削弱）；太阳位置计入重绘签名
- [x] src/render/ai-city-architecture.ts — 白岩板 `0xf1e6d8` 缎面（粗糙 .3、清漆 .35）；墙板 `0xd9ccc4` 哑光（粗糙 .52、清漆 .12）；钴蓝合金 `0x3558a6`（金属度 .2、清漆 .75）；方石 `0xd9c3a6`；墙板着色器按格画灰缝与缝边接触暗角，灰缝粗糙度更高

## Decisions
- 太阳方向不改：参考图正面受光明亮，正面分量保留；`core/world-clock` 与主游戏共用，也不应动。
- 墙板加大几何倒角（.018→.032）实测几乎不可见，已撤回，改为着色器灰缝。
- GTAO 采样维持 456 定的 6/4；AO .55 时白色家具出现降噪斑块，回落到 .45。

## Verification
- [x] npm run typecheck — 通过
- [x] npm test — 1960 项 1959 通过；唯一失败为 architecture 相对导入检查，指向未跟踪的 `src/app/harbor-perspective.ts` 导入 css，与本任务无关
- [x] npm run build — 通过
- [x] 浏览器 15:30 / 13:00 与参考图对比：墙为暖灰并显出瓷砖缝、外框暖象牙、合金为饱和钴蓝（evidence/）
- [x] 22:00 夜景灯池正常；地下、算力大教堂无异常
