# REVIEW -- 游戏场景剩余资源压缩机会

## Status: done
## Task: 219
## Related: N/A
## Baseline Commit: 8a8fe8c

## Scope
只读检查主线、自由世界及其进入流程实际使用的图片、模型、程序纹理与音频；不替换资源，不修改代码或 vendor。

## Findings
| 优先级 | 证据 | 当前大小 | 可行改进及边界 |
|---|---|---|---|
| 高 | src/ui/control-surface.css:67；weapon-hud.ts:56,68,93 | HUD PNG 1,789,676 B，1448×1086，4×3图集；按钮52–58 CSS px | cwebp Q80 同尺寸410,860 B；512×384为79,996 B，768×576为146,404 B。推荐先比较768档（每格192px）；CSS资源用WebP。 |
| 高 | src/app/intro-app.ts:22、445；story-app.ts:44 | 序章4张1672×941 PNG共7,997,893 B | 不降分辨率，cwebp Q80实测600,650 B，减少92.49%。仅新主线序章加载，存档续玩/跳过序章不加载。 |
| 中 | src/app/facility-presentation.ts:18、24；src/render/facility-sky.ts:22 | 主线堡垒4张1536×1024 WebP共764,582 B | 已较原PNG减少89.1%；RGBA8含mipmap预算约32MiB，可试同尺寸KTX2（BC7/ASTC 4×4约8MiB）。预算非设备实测，编码后文件大小未知，透明轮廓需验收。自由世界createFortressView(null)不加载这组背景。 |
| 中 | src/render/tile-view.ts:96、621；tile-textures.ts:395；tile-material.ts:146 | 程序生成7层512×512 RGBA地形纹理，基础7MiB、含mipmap约9.33MiB | 可比较256版：基础1.75MiB、含mipmap约2.33MiB。减少生成量/显存，不减少下载；近景需验收。 |

### 已压缩及不优先处理的资源
- 九个默认512 KTX2 compact GLB合计11,910,332 B，其中嵌入图片3,722,434 B，其他二进制及JSON共8,187,898 B（68.75%）。单纯继续降低贴图不能消除这部分；后续需单独评估动画关键帧精简/减面，不在本次检查中实施。
- 树皮128×128、叶片图集512×256已全局共享；天空4×256、鱼鳞32×32，均程序生成。没有大图片下载收益。
- 当前音乐/音效通过WebAudio程序生成，public无mp3/ogg/wav等大音频包。
- public的历史高清模型和原画不等于实际游戏首次下载量，不作为游戏场景减包收益。

## Validation Results
执行资源尺寸/字节统计、GLB 图片段统计和 cwebp Q80 临时编码（输出仅在内存中）；未修改资源，未运行类型检查、测试或构建。
编码结果仅证明体积可达，尚未做压缩后的画质验收。像素与mipmap显存数据为理论预算，未测FPS或真机GPU内存。独立子代理复核非角色资源调用链及程序纹理预算，与主检查结论一致。

## Conclusion
Assessment: Approved with notes。下一轮优先处理HUD和序章图片，再做堡垒KTX2与地形256对比。前两项按HUD768档计合计9,787,569 B → 747,054 B，减少9,040,515 B（92.37%）；仅在两类资源都需下载的首次主线进入流程适用。
