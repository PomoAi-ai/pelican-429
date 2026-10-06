# PLAN -- 场景压缩、KTX2 与加载优化

## Status: done
## Task: 203
## Related: 196
## Baseline Commit: 3a35077

## Goal
统一场景背景压缩，接入真正的 KTX2 GPU 纹理，优化游戏加载顺序，以实际数据报告收益。

## Non-goals
不提交、推送、部署；不改 vendor、CI 或其他会话的工作。不在没有视觉对比的情况下做减面、模型量化或动画精简。

## Acceptance Criteria
- KTX2 实际生成并由共享游戏加载器使用，保留现有 WebP 与高清原件，支持明确档位对比。
- 场景背景保留分辨率并统一游戏与展示场的资源来源。
- 首屏优化不让未准备好的角色进入游戏；失败显式暴露。
- 如果实施模型有损优化，保留原版并提供页面对比。当前先完成贴图与加载，按证据判断是否有必要改变模型。
- 完成浏览器视觉、请求、GPU 纹理格式检查及 typecheck/test/build 各一次。

## Decisions
- 背景调查已完成：主线4张1536×1024 PNG共7,015,056B，首页现有同尺寸WebP共764,582B；严格无损WebP试验5,004,450B。
- 同线程子代理分别调查KTX2管线和加载链；保留工作区既有变更，基线文件另存/tmp/pelican-ktx2-baseline。
- 用户明确KTX2必须实现；原始模型几何保持完整，暂不以减面换体积。
- 发布目标为GitHub Pages，无仓库内自管HTTP服务器；不靠生成未配置服务的.br/.gz宣称传输压缩已启用。
- 加载子代理设计：KTX2在唯一createStageRenderer入口检测真实设备支持；序章仅预取GLB字节，游戏renderer建立后转码。主线背景与角色并行，不改变同步实体生成契约。
- 编码子代理实测：Sam512颜色ETC1S q255完整mips93,394B，PSNR34.77dB；UASTC312,834B，45.30dB。颜色先用ETC1S，数值图UASTC，最终以浏览器画面对比验收。工具Khronos官方KTX4.4.2仅解压到/private/tmp，不安装系统。
- 用户明确授权执行，仓库内可回退且无设计审批停止条件，直接实现。第5项暂不需要，几何/骨骼/动画保持逐字节一致；展示场先加入三种贴图档位切换。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/build-web-models.ts | 增加KTX2独立输出和逐图验证 | — | yes |
| 2 | src/config/web-models.ts、package.json | 路径和生成命令 | — | yes |
| 3 | src/render/character-model.ts、stage.ts、showcase-renderer.ts | 共享设备检测、转码器与预热缓存 | — | yes |
| 4 | src/app/story-app.ts、game-app.ts、facility-presentation.ts、home-hero.ts | 预热与场景共享WebP、失败清理 | 3 | yes |
| 5 | src/ui/character-stage-panel.ts、character-stage-location.ts、src/app/showcase-app.ts、character-stage-app.ts | 三档贴图切换保留角色、形态、动作、暂停与镜头 | 3 | yes |
| 6 | public/**/*.ktx2.glb、assets/characters/ktx2-models-report.json | 生成资源与数据 | 1 | yes |
| 7 | docs/character-web-textures.md | 规格、结果与限制 | 6 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| 资源生成及非图片数据校验 | yes | yes — 24张KTX规范检查、9模型非图字节及源SHA通过 |
| npm run typecheck | yes | yes — exit0 |
| npm test | yes | yes — 1740/1740、301 suites、181.24秒、exit0 |
| npm run build | yes | yes — exit0、4.40秒；仍有大于500kB的chunk警告 |
| 浏览器KTX2/原始/WebP与场景验证 | yes | yes — 最终构建展示场、自由世界、新故事预热→主线、存档直接进入均正常，无warn/error |

## Results
- 9个KTX2 GLB总计15,014,256B，相比WebP14,363,564B增加650,692B（4.53%）。转码器57529+527333=584862B，由Vite实际输出并由浏览器请求本地哈希文件。
- 仅材质数据UASTC使用RDO0.5；Sam材质样例234428→155611B，PSNR55.07→48.31dB；法线不使用RDO。全量较初版省487576B。
- 实际WebGL上传采集：Sam3张贴图共30个mip上传，格式0x8e8d（sRGB BC7）/0x93b0（RGBA ASTC4×4），数据1,048,656B。相比RGBA8+mips理论4,194,300B约减少75%。不是整页驱动显存或FPS测量；临时采集仅在已关闭测试页，未加入产品代码。
- 全部24张贴图在ASTC4×4/BC7下约8MiB，原RGBA8约32MiB；每游戏场景18张约6MiB，原24MiB。
- 浏览器自由世界实际7个KTX2 GLB共12,254,576B；主线7个12,184,112B。新故事从预取到进入主线，每个GLB只出现一次ResourceTiming记录。
- 存档直接进入主线：模型startTime约476.0–476.2ms，背景476.3–476.5ms，确认请求并行；本机缓存环境不作为用户冷启动加速数字。
- 主线这组模型+背景+首次转码器由上轮18,697,204B降至13,533,556B（减少5,163,648B／27.6%），不含其他JS和页面资源。四张背景alpha逐像素与PNG完全相同，分辨率未变。
- 独立review发现的异步销毁竞态已修，回归用例通过；档位切换保留被比较角色与镜头，往返行为用例通过。未减面/量化/删动画，未修改CI/vendor，未提交推送部署。
- 截图：sam-ktx2.jpg、sam-webp.jpg、sam-original.jpg、free-world-ktx2.jpg、story-ktx2.jpg；请求证据story-resource-timing.json与story-direct-resource-timing.json。三档动作从起点重建，不保存动画当前秒数。
