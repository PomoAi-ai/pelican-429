# PLAN -- 磁悬浮车逐部位对图与场景发光

## Status: done
## Task: 506
## Related: 504
## Baseline Commit: c292d188

## Goal
逐处修正与五视图明显不同的座椅比例、尖头、侧镂空和尾部；在实际场景体现细灯带、滑靴和轨面的青蓝辉光。

## Non-goals
不换游戏透视、不改轨道宽度和驾驶逻辑、不改其他车辆或共享场景光照。

## Acceptance Criteria
- 使用参考 SIDE 的地标位置对齐鼻尖、前座后座、孔洞、尾翼，保留真实有厚度的三维曲面。
- 两个低矮串列单座，修正过高及间距过大的问题。
- 灯带与磁悬浮鞋在实际游戏场景有可见光晕，白色外壳不过曝，轨面有局部蓝光。
- 导出与游戏模型一致；保持车宽 1.8 格上限、鞋底 0.36、轨顶 0.2 及既有升降行为。
- 记录修改前后和实景验证；不声称生成式概念图是所有角度一致的工程图。

## Decisions
- 复用已有镜头/驾驶探索，本次子代理分别只读测量图稿地标和修改独立场景光效，主代理按地标修模型。
- 采用 multiview-fit-loop 的渲染—对照—调整方式；当前模型为 Three.js，坐标沿用 X 行驶/Y 高度/Z 深度，不套 Blender 的轴约定。
- 图稿 TOP 与 SIDE 座位等比例存在少量差异，以 SIDE 作为横版游戏主视图，TOP 约束串列布局/宽度；不改游戏相机伪造外形。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/maglev-model.ts; src/config/maglev.ts | 图稿地标驱动外形和座椅位置 | yes |
| src/app/maglev-track.ts; src/render/maglev-lighting.ts | 日光下灯带/轨面光晕 | yes |
| public/models/maglev; 导出脚本 | 更新共享模型输出并重新加载验证 | yes |

## Validation
| Command / check | Done |
|---|---|
| npm run typecheck；node --test test/maglev-drive.test.ts | pass；6/6 |
| npm test；npm run build | pass；1989/1989；构建只有 chunk 大小提示 |
| node scripts/export-maglev-models.ts；GLTFLoader 重新加载 | pass；宽 1.76703 格，鞋底 0.36，开/闭车棚与导出一致 |
| npx vite build --config vite.maglev.config.ts | pass；最终模型纳入独立构建 |
| 主视图地标与实景发光逐轮检查 | pass for this iteration；实际截图与测量见 evidence/ |
| core-review/diff-guard 范围审查 | pass；发现并修复带孔侧壳翻面/重叠三角，最终复核无残留 |

## Result and visual limits
- 修正鼻尖和前舱比例、双座前后位置及头枕、侧开孔、腹面收窄、尾翼实体厚度与磁靴位置。保持两座串列、原游戏相机及原驾驶逻辑。
- 启用局部 bloom、六个近侧磁靴轨面灯，使用独立场景参数；柔化清漆高光并保留金属环境反射。GLB 保留发光材质，泛光和轨面点光由场景装配。
- 浏览器确认敞开/有棚切换、行驶悬浮及刹停落轨；最终浏览器 error 日志为空。证据：open-docked.png、open-hovering.png、closed-docked.png、side-overlay.png、registration.json、glb-reload.json。
- 这次是用户要求的逐部位修订版，完成主轮廓及场景发光修正，不宣称完全复刻。尾部折面、座椅及金属明暗仍与概念图有差异；其余视图仅记录客观模型投影，未作为已通过的全视图匹配结论。
- 最后几轮仅修改曲面/材质参数，重跑 typecheck、几何导出断言、GLB 重载及独立场景构建；全量逻辑测试没有重复运行。未新增渲染网格细节测试，未修改 CI，未提交或推送。
