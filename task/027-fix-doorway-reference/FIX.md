# FIX -- 门口增加侧面人物对照

## Status: verifying
## Task: 027
## Related: 025-fix-side-reference-scene
## Baseline Commit: N/A（仓库尚无提交；HTML 修改前快照保存在 $TMPDIR/side-reference-scene-before-door.html）

## Problem
用户要求在渔屋门口再放一个相同的侧面人物，直接对比人物与门框大小；随后要求考虑头发外轮廓，将人物稍微提高。

## Root Cause
assets/characters/grassy/side-reference-scene.html:99 — 当前仅摆放屋外人物，没有门口实例。

## Fix Plan
- [x] 复用现有图片平面，在真实出生渔屋陆侧门洞中心增加等高实例。
- [x] 使用渔屋 floorY 贴门槛，保留原有屋外人物和鹈鹕。子代理确认默认门洞中心 x=53.5，门槛 y=49，门洞净高3格。
- [x] 根据用户最终指定，将门口和屋外人物的显示高度统一设为3.10格，保持3.1头身比例，页面注明该显示高度包含发梢。
- [x] 刷新浏览器检查门口人物，最新截图保存为 assets/characters/grassy/doorway-reference-3p1-tiles.png；3.0格历史截图为 doorway-reference-taller.png。

## Verification
- [x] 浏览器视觉检查与截图：门口人物与门槛对齐、屋外人物同步放大、鹈鹕原尺寸保留。
- 本次最后微调仅修改预览高度常量与说明文案，已在浏览器确认3.10格显示；未重复运行全仓命令。
- [ ] npm run typecheck：当前受本次未修改的 src/app/intro-app.ts:135 的 TS1294 阻塞。
- [x] npm test：首次1470/1471通过，唯一失败来自工作区另一处正在变更的 intro-editions-a/b/c.ts 尚未存在。文件随后出现，单独复验 node --test test/architecture.test.ts，21/21通过；未改或跳过测试。
- [x] npm run build：缺失文件出现后复验通过；仍有已有主包体积提示。
- [x] 对照修改前快照复核，仅修改相关展示页、目录摆放与标签，无新增防御检查或渲染断言测试。

## Remaining
门口摆放与放大效果已完成。全仓类型检查的 intro-app.ts TS1294 属于本次预览之外的工作区改动，未顺手修改；因此验证状态保留为 verifying。

## 用户验收
2026-10-04，用户确认当前效果合适，以 3.1 头身、3.10 格可见高度（含发梢）定稿，作为后续静态建模基准。定稿记录已同步到 public/characters/human/SOURCE.md；本次仅更新文档，未重新生成图片、修改模型或运行代码检查。
