# FIX -- 服务器超载视觉重制

## Status: done
## Task: 122
## Related: 114
## Baseline Commit: 无 HEAD；原始效果快照 $TMPDIR/grassy-overload-before.ts

## Problem
横版场景中的服务器超载不好看，主体拥挤，黑色机柜与密集碎屑抢占角色轮廓。

## Root Cause
src/render/grassy/grassy-overload.ts — 六座高机柜占据主角上身，光柱穿过中央，三圈过细的水平环侧视几乎不可见；碎屑和粒子均匀分布在角色前方，缺少清晰爆发主体。

## Fix Plan
- [x] 先生成新的原画参考并录入角色资料「超载效果新版」。
- [x] 共享超载效果改为四组悬浮刀片服务器、上方过载核心、汇聚电弧和带厚度的等离子冲击波。
- [x] 蓝白为主、琥珀过热灯为辅，粒子集中外缘；自发光部件不被地下光照图压暗。
- [x] 保持现有动作与140/192命中时刻及伤害范围；特效使用配置时长，避免GLB浮点时长使爆发错过准确命中帧。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1569/1569通过；此后仅调整渲染混合、自发光和特效相位，相关human-combat/showcase测试34/34通过。
- [x] npm run build — 通过；保留既有大包体警告。
- [x] 浏览器查看蓄能/爆发/消散、地面右向、悬停右向与地下悬停左向。地面和空中均2/6目标受击，总生命600→504；浏览器无错误。
- [x] diff-guard — 无新增防御性检查、兜底或低价值测试。子代理审查相位及资源释放，已解决浮点时长问题。

证据：`assets/characters/grassy/model-equipped/evidence/server-overload-v4/`；原画：`public/characters/human/equipment-concepts/combat-v4/server-overload.png`。
