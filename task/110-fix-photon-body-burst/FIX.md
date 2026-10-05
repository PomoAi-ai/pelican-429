# FIX -- 光子本体爆裂效果

## Status: done
## Task: 110
## Related: 109
## Baseline Commit: 无（仓库尚无提交；三个渲染文件备份于 $TMPDIR/luma-*-before-burst.ts）

## Problem
“光子爆裂”需要光子宠物本体产生明确的聚光和爆炸效果。

## Root Cause
本体 ultimate 动作只有小幅亮度变化；现有光晕与单环停在技能逻辑中心，没有跟随宠物运动节点，也缺少本体向外炸开的阶段。

## Fix Plan
- [x] luma-animator.ts：本体粒子先收拢聚亮，释放时快速扩散并闪亮，然后恢复。
- [x] luma-ultimate.ts：本体青白闪光、双层冲击环、放射光点；共享已有纹理和粒子生成器。
- [x] luma-companion.ts：传入实际运动节点的世界坐标，在动画更新后同步本体特效。

## Verification
- [x] 复用真实展示场固定帧，浏览器检查聚光、爆裂、冲击波扩散和目标受击；无控制台错误，截图见 evidence/after.png。临时检查页面已移除。
- [x] npm run typecheck：通过。
- [x] npm test：1528/1528 通过，无失败、跳过或取消。
- [x] npm run build：通过，保留既有的大分块提示。
- [x] 子代理审查与 diff-guard：通过；确认共享调用路径、位置同步、暂停/取消和资源释放，未新增防御性代码或渲染细节测试。暂停/取消沿用现有处理，本次未另做交互验收。

## Decisions
- 本体特效与场景漫游群使用独立局部原点，轮子与 Bug 原有轨迹、外观和伤害保持既定效果。
- 修改共享渲染模块，游戏、鹈鹕展示场和光子大招展示场同步；不增加渲染细节断言测试。
