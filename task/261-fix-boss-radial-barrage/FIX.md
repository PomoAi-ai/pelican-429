# FIX -- Boss 大招四周密集弹幕

## Status: verifying
## Task: 261
## Related: 260-boss-ultimate-projectiles
## Baseline Commit: 8a8fe8c

## Problem
原大招弹幕数量少且只射向正面；用户要求四周都有发射。

## Root Cause
src/entities/boss.ts 的 fireBossShot 大招分支使用窄扇形角度，Token 水平方向只取 Boss 朝向。

## Fix Plan
- [x] src/entities/boss.ts — Tibo 两轮各 16 发环形薯条，Sam 两轮各 16 发环形光弹、末轮 8 枚左右 Token，环形轮次错角；复用现有弹体，保持普通技能。
- [x] test/boss.test.ts — 覆盖四象限、背后真实伤害、Token 双向齐射和取消，更新不再成立的绕背全安全约束。
- [x] src/config/npc.ts、src/ui/showcase-language.ts — 同步技能描述。

## Verification
- [x] node --test test/boss.test.ts — 36/36
- [x] npm run typecheck — 通过，上一轮其他测试文件的类型错误已不再出现
- [ ] npm test — 1785 项，1783 通过；黑洞空间音频用例与世界生成耗时用例失败。针对两文件重跑后世界生成通过，黑洞音频用例仍失败（test/blackhole-audio.test.ts:87）。本次未修改该音频模块，保留原有代码，不扩展范围修复。
- [x] npm run build — 通过，现有大 chunk 提示保留
- [x] diff-guard 审查本次差异 — 无新增防御、兜底或实现镜像测试；git diff --check 通过
- [x] Bug is fixed — 完整模拟证实正反两侧空中目标受到真实伤害，浏览器已观察环形弹幕

## Decisions
- 四周解释为横版 2D 战斗平面的 360 度，上下左右均生成真实弹体；朝下子弹正常撞地销毁。
- 保留上一轮的地面冲击、单弹伤害、提前锁定和收招时间；展示场继续直接复用 updateBoss，无需另改展示逻辑。
- 任务前快照在 /tmp/pelican-radial-baseline，保留原有未提交修改。
- 子代理完成弹幕与行为测试，主代理按 diff-guard 核对本次差异；没有新增抽象、依赖、防御性分支或渲染细节测试。
- 本地展示场已观察 Tibo 环形薯条和 Sam 双侧光弹，控制台无 error，截图保存于本聊天 visualizations 目录。未进行人工难度平衡试玩。
- 已执行针对失败的复查：node --test test/blackhole-audio.test.ts test/worldgen.test.ts，31/32 通过。全仓验收仍受无关音频用例阻塞，Status 保持 verifying；大招需求实现及相关测试完成。
