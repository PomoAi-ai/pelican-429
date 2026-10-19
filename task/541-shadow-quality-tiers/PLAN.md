# PLAN -- 阴影按画质分档与移动端默认画质（优化计划 P3）

## Status: done
## Task: 541
## Related: 537
## Baseline Commit: a13fdd68（工作区含大量未提交改动）

## Goal
用户要求“阴影效果更好，同时能降级”。设备下限：桌面 + 近 2 年手机。

## Non-goals
- 不做静态/动态分离的阴影缓存：投射者主要是会动的角色（已大幅合批），缓存省不了多少。
- 不换阴影算法（VSM 漏光、PCSS 开销大）。

## Acceptance Criteria
- 高画质阴影更清晰，低画质降档；运行时切换画质时阴影贴图按新尺寸重建。
- 触屏设备默认低画质（网址参数与已保存设置仍优先）。
- typecheck、全量测试、build 通过。

## Decisions
- `render.lighting.shadow.mapSize` 改为按画质分档 `{ low: 1024, high: 4096 }`：高画质纹素密度翻倍，角色接触阴影更清晰；低画质阴影填充约为原来的 1/4。PCF 半径保持不变（按纹素计，4096 下半影更窄更利落）。
- `Stage.setQuality`：尺寸变化时 dispose 旧阴影贴图并置空（three 下次渲染按新尺寸重建），清空拟合缓存（拟合按贴图尺寸对齐纹素）。
- 触屏默认低画质：手机浏览器（iOS Safari、多数安卓 Chrome）没有 `EXT_disjoint_timer_query`，动态分辨率不生效，降级只能靠画质档。
- 测试：配置非法用例改为按档位字段（`mapSize.high` / `mapSize.low`）。
- 浏览器验证：高画质阴影贴图 4096²；设置面板切到低 → 1024²，再切回高 → 4096²，无报错。
- 无停止条件，直接实现。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/lighting-rules.ts | 阴影尺寸按画质分档与校验 | — | ✓ |
| 2 | src/render/stage.ts | 按画质取尺寸；切换时重建 | 1 | ✓ |
| 3 | src/app/texture-compare-app.ts | 低画质舞台取 low 档 | 1 | ✓ |
| 4 | src/app/settings-wiring.ts | 触屏默认低画质 | — | ✓ |
| 5 | test/lighting.test.ts, test/core.test.ts | 按档位字段 | 1 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test`（2037/2037） | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：阴影贴图尺寸与运行时切换 | yes | ✓ |
