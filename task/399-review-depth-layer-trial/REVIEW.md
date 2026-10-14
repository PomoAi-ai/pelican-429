# REVIEW -- 景深 G 试验

## Status: done
## Task: 399
## Related: N/A
## Baseline Commit: d2d72f4dc50da560b61b71ebeadda6bdbedcec64

## Scope
- Focus: 景深 G 的层距与视差依据、距离雾、前景合成、地面贴图，以及推广到游戏的边界。
- Files: `src/app/definition-depth-layout.ts`、`src/app/room-scene-preview.ts`、`src/app/depth-scenery.ts` 中试验相关改动；`public/concepts/depth-layer-trial/README.md` 与实机截图。
- 排除同文件内的平台接口、尺寸规范、导航等其他未提交改动。只读审查实现，不修代码。

## Findings
| Severity | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| Critical / P2 | 99 | 独立复核及真实材质内存断言 | src/app/definition-depth-layout.ts:228 | 检查视图先创建替代面材质，随后指数雾只覆盖当前原材质；切到线框/半透明后恢复默认雾，远层可达到100%雾量。 | 克隆前统一注入，同时覆盖检查线材质。 |
| Critical / P2 | 95 | 独立复核及真实树几何射线 | src/app/definition-depth-layout.ts:257 | 前景仅在layer 2，主相机layer 0的阴影生成跳过前景树；前景通道关闭阴影更新，树丢失投影。 | 分离颜色通道时仍保留统一阴影生成。 |
| Critical / P2 | 99 | 独立复核及真实场景射线 | src/app/definition-depth-layout.ts:269 | 前景未读取主场景深度且最终depthTest=false，侧后视时错误覆盖实际更近的地面/背景。 | 非正面镜头在主渲染前将前景切回layer 0并跳过合成；不能只跳过合成。 |
| Non-critical / P2 | 100 | - | public/concepts/depth-layer-trial/README.md:51 | 云实际分布在−24到−60，跨越新近林−35，并非全部−24。 | 按真实范围和云的美术定位决定是否移动。 |
| Non-critical / P2 | 100 | - | public/concepts/depth-layer-trial/README.md:93 | 页面与游戏共享山脊生成函数，层距却各自硬编码，尚无共享距离配置。 | 推广时统一距离来源；仅改stage.ts不会同步本页。 |
| Non-critical / P3 | 100 | - | public/concepts/depth-layer-trial/README.md:32 | “相邻差0.15以上才能分辨”没有所引一手来源支持，G最后两层差也仅0.124。 | 改为试验目标，按屏幕位移与轮廓验收。 |
| Non-critical / P3 | 100 | - | src/app/definition-depth-layout.ts:251 | 构图补偿固定D=30及中心(24,4)，页面实际镜头距离随画布或取景改变。 | 明确保持构图的参考镜头与近似条件。 |
| Non-critical / P3 | 100 | - | src/app/room-scene-preview.ts:104 | 面板仍显示原层距，覆盖清单也固定写4/10。 | 显示当前模式实际距离。 |

Critical在此指需要修正的功能缺陷，三个实现问题均对应一般P2，不代表安全或数据事故。

### 复核证据

- 雾：真实createDefinitionInspection内存夹具确认实景有新hook，线框和半透明替代面材质没有。受影响的是definition-kit替代面材质；轮廓线已覆盖，fog:false山脊不受影响。正面−35/−70/−140层参考面由期望62.4%/65%/65%变为100%。
- 阴影：three 0.180的WebGLShadowMap按本次主相机layers筛选caster。原种子前景树沿阳光方向能挡住山谷地面点(4.4,0.6,1.001)、湖畔点(4.45,0.1,1.001)，并在全览阴影视锥内。未做GPU像素差分。
- 遮挡：现有UI可达相机(24,28,−60)，目标(24,8,0)。真实几何射线先命中地面（距65.508），再命中前景（距68.050），独立前景合成却反向覆盖。未在浏览器复现该精确后视相机。

### Filtered by Verification

- 未发现现有树木、花草、岩石、天气shader的实际缓存键冲突，原onBeforeCompile调用被保留。
- 未发现重复色调映射或确定的预乘alpha黑边错误。线性HDR→模糊→除alpha→映射/转sRGB→再预乘的链路成立。
- 正常帧结束时背景、相机层、清屏颜色/alpha、shadowMap.autoUpdate、autoClear均恢复；不因假设异常要求宽泛try/catch。
- 地面皮肤仅切显示，返回碰撞仍为原kit；回切原层次会恢复z、scale、x/y、前景层、雾和原地面。

## Validation Results
| Command | Result | Details |
|---------|--------|---------|
| npm run typecheck | Pass | 本轮一次，退出码0。 |
| node --test test/architecture.test.ts | Pass | 本轮一次，21/21，约1.61秒。 |
| node --input-type=module 临时内存检查 | Pass / 缺陷复现 | 子代理通过标准输入核实真实材质克隆、树投影和前后遮挡，未留下脚本或新增测试。 |
| 本地浏览器 | 已检查 | 正面洞厅，G的线框/实景切换；读取的控制台error为空。 |
| 既有实机截图 | 已查看 | 山谷原层次/G/夜晚、城镇G、洞厅G，共五张。 |
| npm test / npm run build | 本轮未运行 | 原报告记载1880/1880和构建通过；本轮未修改实现，不把旧结果当独立复验。 |

## Research and Decisions

- **地面与层距值得保留。** D=30时新视差为0.811/0.652/0.462/0.300/0.176。两层背景差由0.132增至0.159，相机产生100px玩法层位移时，层间相对移动由13.2px变为15.9px。提升存在，但静态改善也来自换皮、雾、缩小及前景下沉，不能全归因于距离。
- **前景保留+3。** 1.11已有相对运动线索；推到+5/+7才能接近1.2/1.3，同时增大遮挡，没有依据必须追教程数字。
- **25/0.65是可用起点，不是定稿。** 包含0.3格偏移后，−7/−16/−35层中心雾量约18.32%/36.36%/62.42%，约37.56格后封顶。更远普通材质不再因雾量不同而分层。
- **65%不保证亮度顺序。** 三层createBackdrop山脊全部fog:false，同一−35层普通物体吃雾、山脊不吃。需比较主题和昼夜最终颜色及局部对比度，不能只看上限。
- **截图判断。** 山谷白色横带消失后更协调，人物脚线更干净，背景与人物的区分改善；城镇层次可读。洞厅前景/地面同石材问题确实存在，优先调整明度、色相及接触边缘，无需先拉更远。
- **云需先明确美术角色。** 实际−24..−60对应标称视差0.56..0.33；低云穿插近山不是技术错误。若追求天际云，应同时调整距离、尺寸、覆盖与运动，不能只挪z。
- **推荐接入现有共享后期。** 保留选择性前景模糊，让前景参与统一阴影及必要深度关系，在线性场景中合成，再走现有Grade/SMAA。无需立即引入全屏真实镜头景深。当前.82只缩放线性亮度，不能替代统一调色、bloom、暗角等。
- **构图与裁剪前提。** 跟随预览实际D=30×画布高度/窗口高度，全览另算距离，固定D=30补偿只是近似。正常游戏D=30到−140层为170，最低zoom=0.75时约180，均小于200；预览far≥1000，截图不能证明游戏裁剪安全，迁移时还要核对开场等镜头。
- **范围限制。** 未做性能测量、全主题实时移动或多尺寸验收，未接入正式游戏。静态截图不能证明动态视差体验。

## Sources

- [Godot官方2D Parallax](https://docs.godotengine.org/en/stable/tutorials/2d/2d_parallax.html)：0.7/0.5/0.3/0.2/0.1是示例，没有差值0.15的门槛，当前页也没有前景1.3示例。
- [Canabalt作者参数回顾](https://www.gamedeveloper.com/design/tuning-canabalt)：最远层水平0.15、较近层0.4，属于特定游戏设计。
- [NabiGame作者横版示例](https://nabigame.com/blog/parallax-platformer)：前景1.3、树0.8、山丘0.6、山0.3、云0.15，可参考而非通用规范。
- [Runevision大气透视观察](https://blog.runevision.com/2025/06/notes-on-atmospheric-perspective-and.html)：强调天空方向与空气路径及单色雾局限，不支持固定65%保证排序。
- [three.js Color Management](https://threejs.org/manual/pages/color-management.html)：渲染/插值应在线性工作空间进行，最后再输出转换。

## Conclusion
- Assessment: Needs changes
- Summary: 保留地面贴图与层距作为候选，修复检查模式雾、前景阴影、侧后方遮挡三个P2问题，再做动态视觉验收和共享渲染接入。本轮只新增审查记录，未改源代码、原报告、截图或测试，未提交。
