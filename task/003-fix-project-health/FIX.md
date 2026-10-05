# FIX -- 入水判定与渲染资源修复

## Status: verifying
## Task: 003
## Related: 001（F3、F4、F5）
## Baseline Commit: N/A（main 尚无首次提交）

## Problem

修复用户指定的三项体检问题：近水面发射漏判入水、离湖后旧泡沫仍提交、角色销毁遗漏骨架纹理。用户已引用体检证据并授权修复，要求避免防御式编程和过度设计。

## Root Cause

- `src/entities/projectile.ts:152`：首次水状态采样发生在移动之后，错过水外出生状态。
- `src/render/water-flora-view.ts:278,306`：不可见湖的提前返回/跳过没有清除上一帧的可见标记。
- `src/render/pelican/pelican-rig.ts:708`：释放链未包含 follow rig 创建的共享 Skeleton。

## Fix Plan

- [x] 投射物在移动前采样水状态；已有水下发射行为继续由现有测试覆盖。
- [x] 每帧重新计算漂浮植物可见标记；按仓库约定去掉当前 update 中的内部参数重复检查和 dt 静默兜底。
- [x] follow rig 暴露释放方法，由外层调用 `Skeleton.dispose()`；复用现有幂等行为，不添加额外状态或框架。
- [x] 在已有武器测试中增加近水面发射的回归用例，先确认失败再修复；不新增渲染自动测试。

## Verification

- [x] RED：`node --test --test-name-pattern='贴近水面向下发射' test/weapons.test.ts`（修复前 1 项失败，水弹未移除）。
- [x] GREEN：`node --test test/weapons.test.ts`（43 项通过，含原有水下发射对照）。
- [x] 临时 Node stdin 复现：跨湖可见数为 17、12、10、15、19、11、17、8，各帧仅当前湖；离湖为 0，返回首湖为 17。骨架 1 个，首次释放触发 1 次纹理 dispose，重复释放仍为 1 次，未释放纹理为 0。
- [ ] `npm run typecheck`：首次通过；验证期间其他源码发生变化，二次检查失败于 `src/main.ts:126`（`createEntityViews` 需要 6 个参数，调用方仍传 5 个）。本次未修改这两个文件。
- [x] `npm test`（1455 项、303 个测试组全部通过，0 失败/跳过，44.579 秒）。
- [x] `npm run build`（Vite 编译通过；提示单个 JS chunk 超过 500 kB）。
- [x] 三项缺陷已通过回归用例或原复现路径确认修复。
- [ ] 浏览器验收：默认入口触发 `createEntityViews` 读取未传入 rig 的 `root` 错误，未完成画面验收。

## Integration Blocker

验证期间，Vite 在 23:09:20 检测到 `src/app/scene-wiring.ts` 等文件发生变化。该模块已改成由调用方注入 `PelicanRig`，`src/main.ts:126` 尚未传入第六个参数。浏览器启动报错，随后重跑类型检查得到 `TS2554: Expected 6 arguments, but got 5.`。本地角色展示场计划包含这项接口迁移；本次保留其现有内容，不接管其他开发改动。整体交付门禁待该调用接线完成后复核，状态保持 verifying。

本次源码改动限定于 `projectile.ts`、`water-flora-view.ts`、`pelican-follow-rig.ts`、`pelican-rig.ts`，新增测试只有 `test/weapons.test.ts` 中的一个逻辑回归用例。没有新增参数守卫、兼容分支、额外状态或渲染自动测试。未提交或推送。
