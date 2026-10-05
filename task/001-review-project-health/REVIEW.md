# REVIEW -- 项目代码体检

## Status: done
## Task: 001
## Related: N/A
## Baseline Commit: N/A（main 尚无首次提交）

## Scope
- Focus: 全量代码的正确性、运行稳定性、状态一致性、资源释放、测试覆盖与配置边界。
- Files: src/、test/、index.html、package.json、tsconfig.json、vite.config.ts。
- Boundary: 用户在项目熟悉后要求“先进行体检”，本次审查当前项目整体。只读审查实现，不自动修复，不提交或推送。
- Constraints: 逻辑/渲染依赖分层；vendor 模型快照完整性；配置 fail-fast；仅在本地手工验证。

## Findings
| Severity | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| Critical / P1 | 99 | 独立复核通过；一个种子另经浏览器复现 | src/world/caves.ts:391；关联 src/world/worldgen.ts:632、src/world/cave-island-verify.ts:111、120 | 默认配置下，三个合法种子无法生成世界，用户进入启动错误页。 | 修复入口规划与洞穴几何的可行性，加入固定种子回归，保留最终自检。 |
| Non-critical / P2 | 98 | 根任务独立复现 | src/sim/sim-world.ts:251；关联 src/combat/combat-system.ts:108 | 玩家 HP 归零后仍可移动、跳跃和射击，但永久失去敌弹命中反馈。 | 明确玩家零血后的状态转换；训练模式可以恢复生命，或采用完整的死亡/重生规则。 |
| Non-critical / P2 | 100 | 根任务独立复现（含对照） | src/entities/projectile.ts:152；关联 src/entities/projectile.ts:76、165 | 水外出生、首个子步即入水的水弹未记录出生点水状态，穿水后撞池底才消失。 | 在首次移动前初始化水状态，再检查各子步的入水转换，保留水下发射规则。 |
| Non-critical / P3 | 100 | 根任务独立复现 | src/render/water-flora-view.ts:306；关联 :278 | 离开湖区后漂浮植物仍保留可见标记，泡沫实例继续提交。 | 更新视野时清除不可见湖的可见标记，覆盖无湖时的提前返回。 |
| Non-critical / P3 | 100 | 根任务独立复现 | src/render/pelican/pelican-rig.ts:708；关联 src/render/pelican/pelican-follow-rig.ts:138 | rig.dispose 未释放新增骨架的 bone texture。 | 为 follow rig 提供幂等 dispose，释放共享 Skeleton，并纳入外层释放流程。 |

### F1 — P1：合法世界种子导致启动失败

- 配置完全使用 `TUNING.worldgen`，仅通过生成器参数传入种子；三个种子均通过生产代码 `parseSeed`。同一种子重复生成得到相同异常。
- 固定样本检查：以 `0xbadc0ffe` 为初值的 xorshift32 生成 1000 个 uint32 种子，997 个成功、3 个失败。该结果是样本观测，不代表所有种子的总体失败率。

| seed | 实测失败 | 检测位置 |
|------|----------|----------|
| 2756949557 | no cave entrance site within 40..150 columns of the spawn (x=49) | src/world/caves.ts:391 |
| 2188170426 | cave entrance at x=1098: not rideable at (1118.19,24.00) (probe clearance < 3.3, tile (1119,-1)) | src/world/cave-island-verify.ts:111 |
| 3858740718 | cave room 3 floor (359,31) unreachable from the entrances | src/world/cave-island-verify.ts:120 |

用户路径：设置面板允许输入任意合法 uint32（留空随机也覆盖该范围），`settings-wiring.ts:113` 导航到含 seed 的地址；`main.ts:80` 调用生成器，异常在 `start().catch(showError)` 中进入错误层。因为初始化未完成，游戏和设置面板均不可用；刷新相同地址仍然失败。

浏览器实测：在正常启动的游戏中打开设置，输入 `2756949557` 并点击“新世界”；地址变为 `/?debug=&seed=2756949557`，页面显示“游戏出错了”及上述洞口错误。独立复核另确认了三个种子的 Node 复现与完整启动调用链。

复现命令（在仓库根目录执行，无需创建测试文件）：

```sh
node --input-type=module <<'JS'
import { TUNING, validateTuning } from './src/config/tuning.ts';
import { generateWorld } from './src/world/worldgen.ts';
import { parseSeed } from './src/config/game-settings.ts';
validateTuning(TUNING);
for (const raw of ['2756949557', '2188170426', '3858740718']) {
  try {
    generateWorld(parseSeed(raw), TUNING.worldgen);
    console.log(raw, 'success');
  } catch (error) {
    console.log(raw, error.message);
  }
}
JS
```

修复方向：让洞口选址、洞室连接和骑行净空在生成阶段满足约束；必要时增加确定性的候选重选或局部修整，并补充三个种子的回归覆盖。`cave-island-verify.ts` 两处是失败检测点，尚未定位对应几何的最早错误构造语句；删除自检或静默更换用户种子不能视为解决。

### F2 — P2：玩家零血后训练受击循环失效

`applyHit` 可以把玩家 HP 扣到 0；`canBeHit` 随后永久排除该玩家。`stepSim` 的生命结算只给假人执行恢复流程，玩家控制器只判断硬直，没有对应的零血转换。最后一次硬直消失后，玩家继续行动，但后续敌弹不会再造成击退、硬直或命中事件。

实测使用默认配置和公开模拟输入：40×16 平地，地面为 y=0，玩家出生 (3.5,1)，假人出生 (14.5,1)，开启 `setDummyShooting(world,true)`，连续运行 6000 tick。记录到 20 次命中后玩家 HP 为 0（完成第 2108 次步进时，命中发生于 tick 2107）；之后假人继续发射 39 枚敌弹，新增命中为 0。审查中进一步检查到敌弹与玩家包围盒重叠，而玩家无硬直/无敌计时、敌弹仍无命中记录。

根任务复现中，随后输入右移、跳跃和喷水，零血玩家从 x=0.4 移至 x=3.6775，跳至 y=4.1550，并发出一枚水弹，HP 始终为 0。

此问题针对已经存在的训练射击交互持续失效，不以新增完整死亡系统为前提。修复前需要统一玩法选择：训练状态保持可重复受击，或实现明确的死亡/重生转换；控制器与命中资格应遵循同一规则。

### F3 — P2：近水面发射漏判首次入水

`createProjectileEntity` 总是初始化 `leftWater=false`，`stepProjectile` 只在移动子步后调用 `checkWater`。若水弹出生于水面外但首个子步已进入水中，它就从未采样到干燥状态，被误判为从水下发射，因此不能触发预期的入水结束。

对照实测：水面 y=4、默认水弹、竖直向下发射。

| 出生中心 y | 第一 tick 后 | 最终结果 |
|-----------|--------------|----------|
| 4.05 | y=3.817222，leftWater=false，未移除 | 穿过水体，在 y=1.216944 以 terrain 结束 |
| 4.25 | y=4.017222，leftWater=true，未移除 | 入水后在 y=3.896944 以 water 结束 |

完整玩家输入也可触发：30×16 水池，地面 y=0，x=1..28、y=1..8 满水，两侧为墙，玩家出生 (15.5,9)；持续下潜并瞄准 (player.x+1,0)，第 12 个 tick 按射击。第 21 个 tick 水弹出生中心 y=9.105555（高于水面），随后穿水并在第 45 个 tick 以 terrain 结束。第 13 个 tick 按射击也能触发。

建议在首次位移前记录出生点水状态，然后再对子步执行入水转换；同时保留“水下发射要先出水再入水才结束”的现有契约。补充近水面向下发射及水下发射对照用例。

### F4 — P3：离开湖区后仍提交旧的泡沫实例

`water-flora-view.update` 对不可见湖直接跳过，完全无湖时提前返回，但两个分支都没有清除旧的 `floatVisible`。`world-views.ts:316` 依据 `floaterState(i).visible` 收集所有泡沫实例，传给 `water-ripples` 中关闭视锥裁剪的全局实例网格。

默认真实世界的复现：依次把视野移到前 8 个湖，可见标记数分别为 17、29、39、54、73、84、101、109；再移到 `{ x: 0, y: 140, w: 10, h: 10 }`，离开全部湖后仍为 109。默认世界总漂浮植物为 113 个。

已证实影响是视野外旧泡沫实例继续参与提交。泡沫容量上限为 160，本次未复现当前湖因旧实例占额而缺失泡沫，不将该推测列为实际影响。建议清除不可见湖对应的可见标记，并覆盖 `!any` 提前返回路径。

### F5 — P3：角色释放遗漏骨架纹理

`createFollowRig` 创建一个供 3 个蒙皮网格共享的 `THREE.Skeleton`，没有提供释放接口。外层 `rig.dispose()` 释放腿、车和 vendor 鸟模型，但没有释放该 Skeleton；vendor 的释放逻辑只遍历几何和材质。

Node 复现按本地 Three.js 首次绘制行为调用 `computeBoneTexture()`，监听纹理 dispose 事件后执行 `rig.dispose()`，结果为 `skeletons=1`、`boneTexturesDisposed=0`、`boneTexturesStillAttached=1`。根任务重复得到相同结果。验证完成后在复现进程内手动释放 Skeleton。

该问题证明显式销毁 rig 时遗漏资源释放。当前主流程只创建一个 rig，没有证据证明正常游玩期间显存持续增长，故定为低优先级。建议 follow rig 暴露幂等释放方法，调用共享 Skeleton 的 `dispose()`，并由外层统一执行；无需修改 vendor 文件。

### Filtered by Verification
- F1 独立复核通过，没有 Critical 发现被复核否决。
- 仅报告置信度 ≥80 且有具体证据的问题；结构风格和未证实的潜在问题不计入 Findings。

## Validation Results
| Command | Result | Details |
|---------|--------|---------|
| npm run typecheck | PASS（本会话前序基线） | 实现尚未改动。 |
| node --test test/core.test.ts test/architecture.test.ts test/vendor-integrity.test.ts | PASS（本会话前序基线） | 137 项通过。 |
| npm test | PASS（本会话前序基线） | 1451 项测试，303 个测试组，0 失败/跳过，58.759 秒。 |
| npm audit --json --fetch-retries=0 --fetch-timeout=10000 | PASS | 使用 npm 官方安全公告接口；包含开发依赖，已知漏洞计数 0。首次受沙箱 DNS 限制，获工具审批后完成查询。 |
| Node stdin：默认配置 1000 个固定伪随机种子生成检查 | FAIL | 997 成功、3 失败；用于发现 F1，不是现有测试套件的失败。 |
| Node stdin：三个失败种子逐个复现 | FAIL（确认缺陷） | 原审查与独立复核均复现；未修改配置。 |
| Node stdin：6000 tick 训练射击 + 100 tick 玩家动作 | FAIL（确认缺陷） | 零血后 39 次敌弹发射无新增命中，仍可移动/跳跃/喷水。 |
| Node stdin：水面上方 4.05 / 4.25 对照发射 | FAIL（确认缺陷） | 近水面发射穿水到池底，对照发射正确以 water 结束。 |
| 浏览器：默认世界启动、设置面板、非法种子校验、大地图 M/Esc 切换 | PASS | 正常路径未发现控制台 warning/error；Esc 关闭大地图后不会误开设置。 |
| 浏览器：设置输入 2756949557 → 新世界 | FAIL（确认缺陷） | 确实进入“游戏出错了”启动错误页。 |
| Node stdin：8 个湖之间切换，再离开所有湖 | FAIL（确认缺陷） | 109 个漂浮植物的旧可见标记仍保留。 |
| Node stdin：创建骨架纹理 → rig.dispose | FAIL（确认缺陷） | 1 个骨架纹理未触发释放。 |
| 1500 tick 模拟 → 实体视图同步 | PASS | 覆盖攻击、飞行、滑翔、跑跳和骑行输入，未出现姿态异常。 |

## Review Coverage and Limits
- 审查了启动与帧循环、输入/界面接线、模拟/实体/碰撞/战斗、世界生成/流体/光照/配置，以及渲染资源与动画的关键路径。
- 本次为尚无 Git 初始提交的全量基线体检；不存在可比较的提交范围。
- 前序类型与全量测试完成后，源码、配置和测试未发生修改，故复用同一会话内通过的基线，不重复全量运行。
- 未执行本地打包、镜像构建、部署、提交或推送；未修改源码、配置或测试。
- 种子扫描不覆盖全部 uint32，浏览器验证不代表所有设备和长时间游玩路径均已覆盖；依赖审计为查询时已公开漏洞信息。
- 开场相机拉远时阴影拟合范围存在潜在遗漏，但未证明实际可见物体的投影受损，因此未计入正式发现。

## Conclusion
- Assessment: Needs changes
- Summary: 共 5 项已证实问题：1 项 P1（合法种子导致启动失败）、2 项 P2（零血后的训练受击失效、近水面入水漏判）、2 项 P3（泡沫可见标记未清理、骨架纹理释放遗漏）。现有类型检查和 1451 项自动测试通过，依赖审计未发现已公开漏洞，但这些检查未覆盖本次发现的路径。
- Recommended order: 先修复 F1 并增加三种子的回归覆盖，再处理 F2/F3，随后修整 F4/F5。修复工作另按 fix/dev 流程开展；本次已完成体检，没有自动修改实现。

## Follow-up — 2026-10-03

用户随后指定修复 F3、F4、F5，三项实现与对应缺陷复核已完成，见 [003 修复记录](../003-fix-project-health/FIX.md)。F3 新增逻辑回归先失败后通过；F4 离湖可见数降为 0；F5 骨架纹理释放一次且重复销毁不重复释放。全量测试 1455 项通过。

修复后的整体门禁暂受验证期间其他开发改动影响：`scene-wiring.ts` 新增必传 rig 参数，而 `main.ts` 尚未补齐，导致二次类型检查与浏览器启动失败；003 保持 verifying。F1、F2 未纳入本次修复，原审查结论仍保留。
