# FIX -- Grassy 模型版本命名

## Status: done
## Task: 048
## Related: 036-grassy-surface-refinement
## Baseline Commit: 无 HEAD

## Problem
用户要求将本轮完成的 Grassy 精修模型在页面中命名为「gpt6.1astra版本」。

## Root Cause
`src/config/grassy.ts:5` — 本轮资源已有精细、标准、轻量三档共享入口，但标签只有档位，无法和其他模型版本区分。

## Fix Plan
- [x] `src/config/grassy.ts` — 三档标签统一增加用户指定版本名，模型路径与 ID 保持不变。
- [x] `src/config/showcase.ts` — 入口改为模型版本对比，描述明确两个版本名。
- [x] `assets/characters/grassy/model-static/refinement-compare.html` — 本轮模型列同步名称。
- [x] `assets/characters/grassy/static-model-scene.html` — 入口文字与多版本展示一致。

## Verification
- [x] `npm run typecheck` — 通过。
- [x] `npm test` — 1498/1499 通过；唯一失败为世界生成耗时 331.4ms 超过 250ms，与名称修改无关。随后 `node --test test/worldgen.test.ts` 单独复跑 29/29 通过，没有改断言或阈值。
- [x] `npm run build` — 通过，保留既有 chunk 体积警告。
- [x] 浏览器实际查看版本名称、模型及 15 张本轮多方向图片标签；独立对比页名称同步。
- [x] 子代理确认三档资源身份与共享标签复用；diff-guard 核对只改命名，无新增分支或测试。

仅为可回退的展示文案修改，不新增常量文案断言测试，不重新制作模型。

页面截图：`assets/characters/grassy/model-static/gpt6-1astra-showcase.png`。
