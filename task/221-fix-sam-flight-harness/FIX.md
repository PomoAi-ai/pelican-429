# FIX -- Sam 穿戴飞行器

## Status: verifying
## Task: 221
## Related: 216
## Baseline Commit: 8a8fe8c

## Problem
Sam 已能飞行，但没有穿戴飞行器。

## Root Cause
共享 NPC rig 未挂载主角 FlightHarness，上一轮只修改飞行姿态与 AI。

## Fix Plan
- [x] 复用主角缓存中的背带、背包和双推进器，适配 Sam 躯干挂点。
- [x] 在共享 NPC rig 挂载，游戏/展示场、人形/怪物形态一致；空中输出尾焰，落地关闭。
- [x] 尾焰使用主角已有生成器，实例销毁仅释放自己的特效资源。

## Verification
- [ ] typecheck：被任务范围外的 test/character-model.test.ts:59 阻塞，CompressedTexture 无参构造触发 TS2554；本次未修改该文件。
- [x] npm test：1757/1757 通过。
- [x] npm run build：通过，保留原有大于 500 kB 分块提示。
- [x] 浏览器检查装备贴合与尾焰：怪物形态悬空双喷口正常、人形落地无尾焰，控制台无错误。截图位于 evidence/，临时预览文件已移除。
- [x] 增量 diff-guard：未新增逻辑自动测试、无吞错或新增依赖。新增必需节点校验在 GLB 资源读取边界。

功能已完成；全仓类型检查仍需上述无关测试修复后通过。未提交或推送。
