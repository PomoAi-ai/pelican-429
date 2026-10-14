# PLAN -- D1 裙装按 V3 重建

## Status: done
## Task: 391
## Related: 386
## Baseline Commit: d2d72f4

## Goal

以 `public/art-library/d1-seven/character-seven-views-body-v3.png` 为依据，在 Hyper3D 网页版单独生成 D1 裙装，套到现有基础身体上，替换运行时穿衣版与装备版。

## Non-goals

不重做已确认 v9 头、独立头发和基础身体；不做换装/捏人交互；不提交推送。

## Acceptance Criteria

- 先用 Blender 正交截图核对现有基础身体与参考图比例，记录各部位差异。
- 裙装由 Rodin 单件生成，正/右/背轮廓、高领、泡泡袖、方领上身、腰缝、白色前片与荷叶内裙与 V3 一致；几何与材质确认前给用户看。
- 裙装与身体对位无明显穿插，裙底不封口；鞋沿用现有左右鞋，除非与 V3 明显不符。
- 26 骨四动作重新导出，膝、接地、颈缝、裙摆与大腿无明显穿插；`d1-outfit-game.glb`、`d1-equipped-game.glb` 及压缩派生更新。
- 展示场浏览器验收；typecheck、npm test、build 通过。

## Constraints

- 用户授权：V3 作依据，Hyper3D 额度不限，效果优先。
- 每轮 Rodin 返工只改一个问题，逐版记录提示词、设置、剩余次数和优缺点；不提前确认几何或材质。
- 原资产与旧裙装保留，新结果另存；展示场复用共享加载器。
- 参考图排版的 `body_scale=0.845` 不当作 Blender 缩放值。

## Decisions
- 比例核对：`d1-base-game.glb` 正/右 Blender 正交渲染与基础版原图按总高对齐，下颚、腰、胯、膝高度相差约 1–2%，在读图误差内；身体不调整。V3 即按该身体绘制，裙装直接按 V3 生成。证据见 `d1-modular-production/outfit-v3/proportion-check/`。
- 裙装输入：从 V3 裁正/右/背，用 gpt-image-2.5-sunburst（max）改为隐形人台单件裙装；右视图首版偏斜 3/4，重画为严格侧面后采用。三张按同一裙装高度 860px 居中到 1024 白底。见 `outfit-v3/references/`。
- Hyper3D 网页需用户登录；CLI 不用于本任务（无返工/确认环节）。
- 管线（explorer）：旧链路全为脚本、无 .blend 手工状态。换裙需改 `outfit-shoes/extract_fit.py`（Outfit 改读新网格：Y-up 导入、按领口/腰缝对位到 Z-up 3.1 世界；鞋仍从 `source-study.blend` 提取；覆盖区规则按新裙重算）、`animate_outfit.py`（裙骨 tail z=1.04 按旧下摆 ≈0.925 定，需按新下摆重定；过渡带 1.42–1.60）、`build_game.py`（42–68 行旧贴图 UV 修补停用；先清 `game-preview/` 旧图）；`equipment/assemble_equipped.py` 背带 1.12 倍与平移可能需按新上身重调。之后依次跑 validate_export / validate_game / validate_game_contract / validate_equipped，手工复制两个 GLB 到 public，再用 `scripts/build-web-models.ts --only=<完整路径>`（web、web-1k、ktx2、ktx2-256）与 `build-compact-models.ts --only=` 生成派生。运行时契约：6 网格节点名、`D1ModularBaseRig` 26 骨、四动作、脚底 0、高 3.1。
- Rodin 任务 ff5c55f8：v1–v3 记录在 `outfit-v3/rodin-log/README.md`；v2 为当前最佳（前片开叉、背面方领、裙底开口中空），胸前徽记浅浮雕来自参考图，不再返工。等待用户看过后确认几何。
- 用户确认 v2 几何后生成并确认材质，下载 OBJ 2K PBR（见 rodin-log/README.md）。
- 新管线放在 `outfit-v3/`，不改 `outfit-shoes/`，旧裙装仍可复现：`fit.py`（新写：OBJ 导入、等比 .654、腰缝对到 z1.57、y+.027，删碎片，沿身体法线推离、扩张并模糊以保持厚壳两层同步，鞋直接取 `outfit-shoes/static-fit.blend` 已对位的左右靴）；`animate_outfit.py`、`build_game.py`、三个 validate 从旧目录复制，只改裙骨尾端（按新下摆 z≈.86、半径≈.6）、去掉旧贴图 UV 修补和 corrected 版。`equipment/assemble_equipped.py` 的 SOURCE 改指 `outfit-v3/outfit-game.blend`。
- 覆盖区：胸前浅蓝块不是贴图问题，是基础身体蓝色内衣从稀疏外壳面之间穿出；规则改为“法线方向命中裙子，或从裙外壳穿出”的躯干面隐藏，手臂只在穿出时隐藏（袖内皮肤保留，跳跃抬手时袖口不露内衬；前臂靠近大裙摆也不被误隐藏）。
- 背带：新上身下 1.12 倍与平移不变，正/侧/背与跑步帧无明显穿插，未重调。
- 派生：本机 `toktx`/`ktx` 不在 PATH，用 `/private/tmp/d1-ktx-tools/.../usr/local/bin` 临时加入 PATH 生成 KTX2。
- 未派 subagent 流水线：工作是逐步 Blender 迭代与视觉判断，脚本均为资产目录内的新文件，用户在本会话直接授权并全程推进。
- 材质用 Rodin 漫反射 + ORM（G 粗糙、B 金属）；法线贴图几乎平坦，未接。
- 身体尺度：颈缝 z=2.0635、肩 1.9328（x±.266）、躯干最细 z≈1.56–1.59、髋 1.3074、两腿分开 z≈1.18、膝 .7403。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender 比例核对截图 | yes | ✅ |
| Rodin 版本记录与用户查看 | yes | ✅ |
| 四动作导出复检 | yes | ✅ animate 全帧接地/循环，validate_export/game/contract/equipped 通过 |
| npm run typecheck | yes | ✅ |
| npm test | yes | ✅ 1878/1878 |
| npm run build | yes | ✅（仅既有 chunk 体积提示） |
| 浏览器展示场检查 | yes | ✅ 穿衣版 walk + 装备版 idle，无控制台错误 |
