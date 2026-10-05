# 编码约定：校验放在边界，内部信任类型

本文是 `AGENTS.md` 中“编码”一节的详细说明，示例都取自本仓库。

## 1. 核心原则

**数据从外部进入时校验一次，进入后就信任它。** 外部输入包括：

| 边界 | 位置 | 处理方式 |
|------|------|----------|
| 调参配置 | `validateTuning(TUNING)`（`src/main.ts` 启动时调用） | 校验全部字段，非法值直接抛错 |
| 网址参数（seed 等） | `parseSeed`、`resolveSettings` | 非法值直接抛错 |
| localStorage | `src/ui/settings-model.ts` 的 `loadSettings` | 读写失败时告警并使用默认值，原因写在注释里 |
| DOM 事件、键盘鼠标 | `src/input/keyboard-mouse.ts` | 映射为 action，未知按键忽略 |
| vendor 模型 | `src/vendor/pelican-3d/` | 不修改；在包装层适配 |

边界内部的函数参数、帧数据（`frame`、`dt`、`alpha`）、实体状态和生成器结果均由本仓库代码产出，类型系统已经约束过（`strict`、`noUncheckedIndexedAccess`）。这些值不再做运行时检查。

## 2. Fail-fast 与防御式编程的区别

用户全局规则要求 fail-fast：配置缺失时抛错，不静默降级。这条规则约束的是**边界**，并不要求在每个函数入口重复校验。

| 情况 | 正确做法 |
|------|----------|
| 配置或用户输入非法 | 在边界抛错，错误消息带字段路径与实际值 |
| 内部出现“不可能”的状态 | 不写检查；让 TypeScript 类型、调用方契约或自然产生的异常暴露问题 |
| 确实可能缺失的外部资源（存储、浏览器 API） | 在边界写一次处理，并用注释说明原因 |
| 不确定某个值会不会出错 | 读调用方代码确认；仍不确定时在汇报中提出，不加守卫 |

以下写法都属于静默降级，违反 fail-fast：

- `catch` 后只打日志然后继续，或返回默认值；
- `x ?? 0`、`Number.isFinite(x) ? x : 0` 把错误输入改成“看起来合理”的值；
- `if (!obj) return;` 跳过本应执行的逻辑；
- 同时保留新旧两条路径，“以防旧调用方还在用”。

## 3. 反例与改法（本仓库现存代码）

以下代码保留现状。修改相关文件时顺手按本节收敛，不单独发起大规模清理。

### 3.1 每帧重复校验内部参数

```ts
// src/ui/hud.ts —— 每帧执行
if (!(Number.isFinite(frameDt) && frameDt >= 0)) throw new Error(`hud: invalid frameDt ${frameDt}`);
```

`frameDt` 只来自 `app/frame-loop.ts`，在那里由 rAF 时间戳算出，并已夹到 `[0, TUNING.sim.maxFrameTime]`。HUD 再查一次没有价值。改法：删除这一行。

### 3.2 守卫与静默兜底混用

```ts
// src/render/water-flora-view.ts
if (!frame || !frame.fluid || typeof frame.windAt !== 'function') throw new Error('water-flora: fluid and windAt are required');
const dt = Math.max(0, Math.min(0.25, Number.isFinite(dtIn) ? dtIn : 0));
```

`frame` 的类型已要求 `fluid` 与 `windAt`，第一行重复了类型检查。第二行把非法 `dt` 静默替换为 0，与 fail-fast 相悖。改法：删除第一行；第二行只保留业务需要的夹取 `Math.min(0.25, dtIn)`。

### 3.3 对已声明类型的参数检查 `typeof`

```ts
// src/ui/minimap-model.ts
function checkPositive(name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw ...
}
```

`v: number` 已由类型保证。这类检查仅在**校验配置的函数**中保留（配置可能被手改成 `NaN` 或负数），并去掉 `typeof` 部分。

### 3.4 为测试替身写的生产分支

```ts
// src/render/precip-sky.ts
if (!skyTex || !skyCanvas || typeof skyCanvas.getContext !== 'function') return;
```

浏览器中 `HTMLCanvasElement.getContext` 一定存在。这个分支是为了让 `test/helpers/fake-dom.ts` 里不完整的假对象能跑通。改法：补全测试替身，或者不在 Node 下测试这段渲染逻辑。不要为了测试修改生产路径。

## 4. 允许的检查

- 业务规则本身就是夹取或分支，例如 dt 上限 0.25、缩放范围 `[MINIMAP_ZOOM_MIN, MINIMAP_ZOOM_MAX]`。
- 数组下标访问：`noUncheckedIndexedAccess` 要求处理 `undefined`。确定存在时用 `!` 断言或抛错，不要用 `?? 默认值`。
- 世界生成的自检（`worldgen-verify.ts`、`cave-island-verify.ts`）：它们检查的是生成算法的产物，属于设计的一部分，不能删除或改成静默跳过。
- 释放资源（`dispose`）要求幂等时，用一个已释放标志实现。

## 5. 其他约定

- **不保留兼容层**：改函数签名时同步修改所有调用方，不保留旧签名、别名或废弃分支。仓库没有外部使用者。
- **不预留扩展点**：只实现当前任务需要的参数和选项。
- **注释写“为什么”**：说明非显而易见的约束；不写“任务 0xx 新增”这类历史记录，历史由 git 维护。
- **改动范围**：只改任务涉及的代码。顺手发现的问题记下来汇报，不擅自修。
- **分层规则**：见 `test/architecture.test.ts`。逻辑层（`world → physics → combat → entities → sim`）只能向左依赖，不得使用 three、DOM、`Date`、`Math.random`；随机数统一用 `src/core/rng.ts`。
