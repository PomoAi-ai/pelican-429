# PLAN -- 飞行车侧面结构与材质精修

## Status: done
## Task: 520
## Related: 490, 501, 508, 513, 509, 511
## Baseline Commit: a13fdd68

## Goal
参考星舰实机完成度改善飞行车侧面：白色车漆、金属细节、玻璃、进气内壁、整体尾喷连接，以及离子喷流和动作节奏。

## Non-goals
不改NPC承载逻辑、驾驶玩法、星舰资源、项目照明、导航；不提交推送、不重生成原画。

## Acceptance Criteria
- 真实游戏侧视角能区分白色漆层、金属件、玻璃，进气口不再是空黑片，尾喷连接完整。
- 固定三轮、可开面罩、可转向整体尾喷和车顶承载标记保留。
- 起飞/前进/滚动/开罩复用同一游戏模型，喷流方向和喷口一致。
- 浏览器同视角前后检查，类型检查、全测、构建通过，相关diff经审查。

## Constraints
以用户选定侧面为尺寸主参考，不用发光/曝光掩盖结构问题。共享工作区已有大量修改，仅处理当前载具。

## Decisions
- 使用dev/core-dev、reference-look-calibration和已启用Ponytail Full；当前模型契约已明确。
- 模型子代理负责几何/材质源文件，探索子代理只读分析共享运行时，主代理负责喷流/动作和浏览器验收。
- 以原稿白色为主，不把提高metallic当成增加质感；具体结构先看纯侧面。
- 探索/设计结论：公共stage已有RoomEnvironment，暂不改环境；旧壳体大部分UV退化，由模型端补UV和嵌入式微表面纹理。喷流shader将出口可见宽度压到约15%，修正分布而非放大物理喷口。保留喷口轴/承载，展示前进先转向后加速，滚动改单程缓起缓停并同步轮速。
- 既有调用链与模型契约覆盖装配探索；本轮只读探索代理已给出逐文件最小设计，无待用户裁决分歧，直接实现。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| assets/vehicles/white-vtol/、public/models/white-vtol/ | 内壁/尾喷连接、白漆/金属/玻璃微表面、模型导出 | yes |
| src/render/flying-roadster-view.ts | 同步喷口轮廓的离子核心与外辉光 | yes |
| src/app/showcase/flying-roadster-actor.ts | 共享驱动的起飞/巡航动作节奏 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | pass |
| npm test | yes | pass：2008/2008，0 skipped |
| npm run build | yes | pass；最终dist/public模型SHA一致 |
| Blender节点和转动检查 | yes | pass；11节点、三轮底Z=0、七角度无表面相交 |
| 浏览器纯侧面五动作/前后截图/控制台 | yes | pass；五动作、左右滚动、暂停、侧面截图、无error |
| core-review / diff-guard | yes | pass；独立审查模型与运行时，无剩余阻断问题；相关文本diff空白检查通过 |

## Verification notes
- 独立审查指出左向滚动重复乘facing，已修正；轮速使用局部前进速度，由整车翻向转换世界轮轴。其余shader、暂停、重播、资源所有权审查通过。
- 本次仅修改渲染与展示动作，不新增反复断言渲染细节的自动测试。
- 港口实际页面加载完成、车辆可见、控制台无error；页面FPS仍约1–2，未归因或解决其整体性能。截图evidence/harbor-load.png。未重新人工登车。
- 最终GLB：3,928,124 bytes，35 meshes / 35 primitives / 9 materials / 3张256px嵌入纹理；SHA256 `ebce9dc581d15c0efad42401cb54eea317b5528c87bd4fa07637285fc7d4c1b7`。实际材质UV0、粗糙度G通道与法线独立解码检查通过。
- 白漆使用完整连续侧壳，铝材只用于真实独立部件。尾部固定流线薄罩遮住机械连接，活动喷口下缘/后缘仍可见。七角度离散相交检查不等于工程认证。
- 浏览器证据：side-after.png、hover-after.png、cruise-after.png为最终GLB；canopy-open.png和roll-left-a.png为最终材质边界清理前版本，几何与动作一致。最终重载复核静止/起飞/前进及控制台。
- 浏览器前后页面布局受到共享工作区其他改动影响，不能作为逐像素同裁切对比；模型同机位比较以polish-look-calibration.json及Blender侧图为准。原稿侧面轮廓IoU约0.9543，不代表现实结构精度。
- 构建有既有的大于500kB分块提示；构建退出码0。未新增测试、未提交或推送。
