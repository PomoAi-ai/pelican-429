# FIX -- Rodin 头发复用球形眼睛与视线

## Status: done
## Task: 486
## Related: 480, 482, 484, 485
## Baseline Commit: c292d188ad690a076f771a59ff5c1953155827f9

## Problem
将已认可的球形眼睛、眨眼和视线控制接入 40、41 号 Rodin 头发预览，保留原眼片对照。

## Root Cause
`src/app/d1-render-lab.ts:16` 的球眼适用模型列表未包含 40、41；默认球眼只针对 39，导致新的头发沿用旧眼片且无法启用视线控制。

## Fix Plan
- [x] `src/app/d1-render-lab.ts` 将 40、41 加入球眼适用和默认列表，直接复用 v3 球眼资源与现有九宫格、鼠标跟随、自然扫视控制。
- [x] `render-lab.html` 更新适用范围提示；显式 `eyes=patch` 继续作为原眼片对照。

## Verification
- [x] `npm run typecheck`（通过）
- [x] `npm test`（1966 项通过，0 失败）
- [x] `npm run build`（通过；现有 chunk 体积提醒）
- [x] 40、41 默认v3球眼；41实看左右/向下、鼠标左右跟随、半闭/全闭、45度以及原眼片切换，控制台无error。
- [x] v3资产SHA与源会话认可版本一致；耳部、额头、后脑及颈部坐标与31基底匹配，避免影响头发配准。
- [x] 定向 diff-guard 检查：无新增测试、异常捕获、兜底或内部校验。

## Scope
只接入独立渲染实验页面；全部头发目录目前使用静态原眼片，没有眼球资源加载或视线控制，本次不改变该页面。
