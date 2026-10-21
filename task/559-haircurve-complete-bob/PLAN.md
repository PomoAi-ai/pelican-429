# PLAN -- Hair Curves 完整偏分短发

## Status: done
## Task: 559
## Related: 555, 556
## Baseline Commit: 47a8232a

## Goal
完成独立49号候选：原生HairCurve可编辑导引组织偏分刘海、冠部、双侧编辫和侧后短发；贴合实际D1头部，保留批准球眼、原身体骨架和四套动作；接入实验页和全部头发图库供比较。不替换正式游戏资产，不覆盖47、48。

## Acceptance Criteria
- [x] 完整新49；原生作者节点、可编辑导引、重建脚本、实际材质Blend与GLB已保存，旧阶段保留在revisions。
- [x] 七灰模、七实际导出材质图同次更新；网页正面、双侧、双45°、背面已检查。原大冠环、左辫下白楔、上后脑露皮孔已修；耳窗和自然颈部保留。
- [x] 真实逐束root-tip属性、头骨蒙皮、固定根和活动梢通过生产运动函数验证；原身体、骨架、四动作与眼睛资源保持。
- [x] 实验页支持49和默认球眼v3；图库49实际加载，拖动同步旋转；眨眼、目光、动作播放、惯性开关实际操作通过。
- [x] 必要前端检查与独立资产/视觉复验通过。完成的是可比较候选，用户尚未做最终审美选择。

## Decisions
- 使用用户提供HairCurve.blend中的真实hair_curve节点，逐束设计；两条编辫使用实际Hair Tool节点。没有复用48整头外壳。
- 32条独立发束+2条编辫+3块内部局部根床，共37部件。根床只覆盖右颞、后脑、顶冠交汇处的根隙，位于外发束下面。
- 网页检查发现的问题在导引几何修复：冠根控制点离皮约.08–.09导致拱桥，压到.02–.03并检查最终冠高补偿；左右耳上既有束重叠收口，避免扩大整头壳体。
- 仅高于2.97的冠体积补偿标准3.1高度，身体/骨架不缩放；源文件非Hair资源逐项一致。
- 资产路径独立；所有变动均为可回退本地制作与预览，没有提交或推送。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | haircurve-complete-bob-01/build_hair.py | 原生导引生成、局部根量、七视灰模 | - | Yes |
| 2 | haircurve-complete-bob-01/back_recipe.py | 侧后发流与耳窗覆盖 | - | Yes |
| 3 | haircurve-complete-bob-01/export_hair.py | 材质、UV、蒙皮、逐束属性及冻结身体导出 | 1,2 | Yes |
| 4 | src/app/d1-lab-hair-catalog.ts | 49编号和资源目录 | - | Yes |
| 5 | src/app/d1-render-lab.ts | 49球眼与预览支持 | 4 | Yes |
| 6 | src/app/d1-hair-gallery.ts | 图库49默认球眼装配 | 4 | Yes |
| 7 | render-lab.html | 49选择入口 | 4 | Yes |

## Validation
| Check | Required | Result |
|---|---|---|
| npm run typecheck | yes | Passed，前端接入后执行；其后仅资产/制作脚本/记录变动，未重复运行 |
| npm test | yes | Passed，2041/2041，同上 |
| npm run build | yes | Passed，默认发布配置；实验页另经真实浏览器检查 |
| Blender原生构建/导出/七灰七彩 | yes | Passed，CLI exit0；最终彩图2026-10-21 00:15:33–00:16:07（Asia/Taipei） |
| 源冻结资源与属性复验 | yes | Passed，原BIN前19,064,136字节及非Hair节点/网格/材质/贴图/蒙皮/四动作一致 |
| 实际Three GLTFLoader+Meshopt解码 | yes | Passed，2,787,718属性标量有限、索引/guide范围/归一化方向/头骨权重有效 |
| 生产createD1BlenderHair，90帧 | yes | Passed，高3.099999782，固定38780点位移0；活动40026点最大发梢位移.004713863，法线有限、reset恢复 |
| 实际浏览器49/图库/动作/球眼 | yes | Passed，证据browser-verification.json；实验页无错误，图库仅保留早于最终资产的Vite HMR历史错误 |
| 独立视觉复验 | yes | Passed，完整候选级结构验收；风格差距在下方说明 |

## Final asset record
最终完整GLB与public副本一致，26,886,480字节、78,806顶点、37导引/部件。

- full/public SHA256: `2adf8a2a601f80f0a15237a0fd7653f883ccd887d07ec2ddc41847ad8bb82eb9`
- native SHA256: `ab5aef93ce4381bd42b90c579d0fd54cf6bdb2e08c1a4c7c3f31c9c472a467fd`
- source Blend SHA256: `52ee443a65dd1979fbd418645f6c9915a6468065dba69c3b1559bc77122b4a9a`
- source/public、原数据保持、运行报告哈希见 `evidence/asset-integrity.json`。
- 实机截图和同次彩图哈希、时间见 `evidence/browser-verification.json`。final-*为最终文件，旧v2-*仅保留作迭代历史，不用于最终验收。
- 离线眼白为占位；网页实际装配原批准球眼v3。最终目光和闭眼截图为同一完整GLB下拍摄。

## Preview
- http://127.0.0.1:5184/render-lab.html?hair=blender-haircurves&framing=head&angle=45&projection=orthographic&version=v2
- http://127.0.0.1:5184/d1-hair-gallery.html?version=v2 ，编号49。

## Remaining style differences
发束仍较宽，冠部起伏较高且偏尖，发色比原画深。这些是本候选的风格限制，不声称与原画精确一致，也不代替用户最终选择。独立资产报告的visualApproval:false表示没有用户审美批准，不表示上述运行与结构验证未完成。
