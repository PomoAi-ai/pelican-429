# FIX -- 回血掉落改为红心

## Status: done
## Task: 188
## Related: 184-monster-health-drops
## Baseline Commit: 3a35077

## Problem
用户要求回血掉落显示为红心。

## Root Cause
`src/render/health-pack-view.ts` 使用盒子拼接医疗包，外观不符合要求。

## Fix Plan
- [x] 用现有 three.js Shape + ExtrudeGeometry 绘制有厚度、圆润边缘的红心，保留轻微悬浮并将底部光环调为粉红。
- [x] 复用同一实体和拾取规则，不改变 10–30 点回血或脱战恢复。

## Verification
- [x] `npm run typecheck`、`npm test`（1722/1722）、`npm run build` 均通过；构建保留既有体积与插件耗时提示。
- [x] 浏览器通过真实操作击杀怪物，确认红心轮廓、红色材质及轻微悬浮；掉落值 12，控制台无错误。证据 `heart-drop.png`；验证后关闭临时标签页。
- [x] diff-guard 自查及相关文件 `git diff --check` 通过：删除药包拼装，仅增加心形几何，资源正常释放，无新增防御检查或细节测试。

## Decisions
只改变渲染外观，不新增网格或材质细节测试，不需要生成图片或引入依赖。
