# PLAN -- D1 身体单独重做

## Status: done
## Task: 393
## Related: 391
## Baseline Commit: d2d72f4

## Goal

用 Hyper3D 网页版只生成 D1 内衣（蓝色两件式）赤脚身体，不带头，替换现有与生成头混在一起做出、细节不足的身体；再与已确认 v9 头、独立头发、V3 裙装和左右靴重新组装、绑定、动画并导出全部 D1 运行时版本。

## Non-goals

不改 v9 头与独立头发几何；不重新生成裙装与靴子；不做换装交互；不提交推送。

## Acceptance Criteria

- 身体参考图只含身体（颈部以下），按已确认 `public/art-library/d1-bald/d1-swim-bald-v1.png` 的比例、蓝色两件式与赤脚，正/右/背三张，高清，手指分开。
- Rodin 单件生成，逐版记录；几何、材质确认前给用户看。
- 新身体与 v9 头颈缝闭合，含发高 3.1、脚底 0；手、脚、膝、肘细节优于旧身体。
- 22+4 骨四动作重新绑定，颈缝、接地、循环通过；基础版三档、穿衣版、装备版及全部压缩派生更新。
- 展示场浏览器验收；typecheck、npm test、build 通过。

## Constraints

- 用户授权：Rodin 额度不限，效果优先；身体只做内衣版，之后再与头、头发、衣服组合。
- 每轮返工只改一个问题；新结果另存，旧身体链路保留可复现。

## Decisions
- 参考图：用户要求用四种形态拉通对比里的细腿定稿，且打底已改为白色两件式；从 `public/art-library/d1-bald/d1-bald-slim-legs-v1.png` 按原像素拆出正/右/背/45°/脚底，颈部 y=267 切头作 Rodin 输入（`public/art-library/d1-bald/split/`，资料库条目 `d1-bald-split`）。gpt 重绘参考会把腿画粗，不再使用；蓝色旧稿与 gpt 重绘的任务 S、T 作废。验收标准中的“蓝色两件式”按用户最新定稿改为白色。
- 材质偏暗（用户未审先确认），按用户选择对漫反射做 Lab 皮肤均值平移到 v9 头肤色，白色打底不动（`body-v2/assembled-base/recolor_skin.py`）。
- 装配：头/头发沿用原变换；新颈较细，切口上移到身体 1.315 / 头 1.325，头颈下部渐变到身体颈环；脸部断言不变。
- 管线：旧链路保留，`body-v2/` 下按原目录结构复制脚本，只改源路径、新骨位（`body-v2/landmarks.json`）和权重分区带；裙装对位常数、靴子与装备件沿用（新身体腰线与旧身体一致，检查无穿插）。肩臂浅肌肉线未处理。
- 运行时：6 个 D1 GLB 复制到 `public/characters/human/customization/`，用 build-web-models（web/web-1k/ktx2/ktx2-256）与 build-compact-models 按前缀重建派生；展示场缩略图 `d1-base-front.png` 换成新装配正面渲染。
- 未派 subagent：逐步 Blender 迭代与视觉判断，用户在会话中直接授权推进。
- Rodin 任务 ce912294：参数逐项试验（方向、负面提示、细节、Cfg、重抽），只有负面提示和去掉 Detailed 有效，结果主要随种子变化；v7 最光滑，用户授权自行判断后确认几何与材质，导出 OBJ + 2K PBR。记录见 `body-v2/rodin-log/README.md`。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|

## Validation
| Command | Required | Done |
|---------|----------|------|
| Rodin 版本记录与用户查看 | yes | ✅ |
| 颈缝/接地/循环与导出复检 | yes | ✅ 基础/LOD/穿衣/装备全部通过 |
| npm run typecheck | yes | ✅ |
| npm test | yes | ✅ 1879/1879 |
| npm run build | yes | ✅（仅既有 chunk 体积提示） |
| 浏览器展示场检查 | yes | ✅ 基础/穿衣/装备三版同场，无控制台错误 |
