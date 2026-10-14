# FIX — 能量门前柱玻璃与窗户下沿

## Status: done
## Task: 414
## Related: 412, 413
## Baseline Commit: d2d72f4

## Problem
面向玩家的门柱不透明，用户希望半透明或毛玻璃科幻效果；窗户下方额外的蓝色横板需去掉。

## Root Cause
src/render/ai-city-architecture.ts 的 createAiCityDoor 为前后柱同时使用整块合金实体，前柱又覆盖陶瓷皮；src/render/definition-kit.ts 的 city window 分支额外添加蓝色窗台横板。

## Fix Plan
- [x] src/render/ai-city-architecture.ts — 前柱改为细金属护框、磨砂半透玻璃及内部能量芯，后柱保留；共用游戏与预览工厂，保留占格/碰撞/激光动画。
- [x] src/render/definition-kit.ts — 删除额外窗台横板，保留圆角窗框。

## Verification
- [x] npm run typecheck — 通过
- [x] npm test — 已运行，1901 项中 1900 通过；唯一失败为本次前已知 art-library 英文 window 描述误判。未修改或跳过该用例。
- [x] npm run build — 通过，保留已有大包体积提示
- [x] 浏览器白天/夜晚、门开关、窗户下沿检查 — 正午和午夜近距离核对；开/关均显示正确状态；浏览器无 error 日志。
- [x] diff-guard 与子代理复核局部差异 — 通过，尺寸和资源释放均保留，未引入多余防御或测试。

## Decisions
- 本次只改共享渲染模型，无存档或尺寸改动，不写渲染网格/材质断言测试。
- 角色及之前任务的工作区变更均保留，不提交、不推送。

## Results
- 额外执行 node --test test/residence.test.ts，16 项全部通过，覆盖门的双向阻挡/通行及碰撞更新。
- 前柱使用有粗糙度的透射玻璃；内部三段蓝色芯轻微呼吸，开关时增强，与现有激光扫描配合。
- 日间/夜间实景截图：assets/concepts/ai-city-residence/frosted-door-day-preview.png、frosted-door-night-preview.png。
- 未检查手机 GPU 的玻璃透射性能；本次未提交或推送。
