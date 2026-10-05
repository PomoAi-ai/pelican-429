# PLAN -- Sam 与 Tibo 动物 NPC 制作

## Status: completed
## Task: 066
## Related: N/A
## Baseline Commit: 无 HEAD；仓库当前全部文件未跟踪

## Goal
将 Sam 白鼬与 Tibo 鼹鼠制作成游戏可用的三维角色，完成四向图片、比例验收、骨骼蒙皮、动作和共享展示场。

## Non-goals
- 不修改 vendor 快照，不提交、推送或部署。
- 不扩展随机地图出生点、NPC AI、剧情或技能战斗效果。

## Acceptance Criteria
- Sam 保留真人棕色短发、蓝灰眼睛与温和表情，使用白鼬短吻、白毛、黑尾尖、灰毛衣和路由胸章。
- Tibo 保留侧分棕发、浓眉、胡须轮廓与笑容，使用鼹鼠口鼻、挖掘爪、黑色帽衫和重置胸章。
- 英文名称为 The Model Router 与 The Reset Master。
- 两者符合游戏 3.1±0.1 头身，世界高度分别为 2.70、2.65 格，脚底为零、正面朝 +Z。
- 每位角色有前、后、左、右四向图片；最终图片由同一实际模型在统一正交尺度与足底基线下渲染。
- 各有 idle、walk、greet、special 四动作；检查抬爪、腋下、尾根、接地及循环，不合格返修。
- 游戏与展示场共享模型、贴图、尺寸与动作资源，保留制作源和审查证据。

## Decisions
- 用户已授权上传角色参考并使用已付费 Rodin 账户；网页使用私有模式、Gen-2.5 High/Faithful、四向参考与原始 alpha，导出 2K PBR/Shaded GLB，没有购买升级。
- 四向绘制参考保存在 output/imagegen/animal-npc-turnaround-v5/{sam,tibo}/。独立绘图有轻微轮廓差异，最终一致四向使用真实模型渲染。
- 原始下载与 source.glb 保持字节不变；本地 Blender 流程做形体校准、蒙皮、30 fps 动作烘焙及 GLB 导出。可编辑源为各角色的 *-rigged.blend。
- Tibo 私有任务为 [private generation ID removed]，Sam 为 [private generation ID removed]。来源记录保存在各自 rodin-original/SOURCE.md。
- 旧本地雕刻方案仅作为 local-sculpt/ 制作备份；正式运行时使用通过验收的 Rodin 资产。
- 静态形体校准独立于规范化：Tibo 缩短头部并调整宽深，Sam 微调头部、短吻和尾长；不通过单独缩放相机掩盖比例差异。
- 大头、手爪与尾根采用实际网格空间分区，glTF 每顶点最多四个骨骼影响。Sam 尾根的腿权重已清零，保留 hips/tail 混合。
- 招呼采用轻抬上臂、屈肘与摆腕，消除腋下尖扇片。Sam 专属动作双爪交替选择路由，Tibo 抬爪轻点胸章。步态接地 IK 在制作阶段烘焙，不增加运行时依赖。
- 摄影棚采用经参考校准的 Standard/None、中性环境和较低填光；原始三张 PBR 贴图字节保留。
- 静态、动作、材质由当前会话子代理独立检查，主代理实际查看四向和动作极值图，并在真实浏览器验收。

## Implementation Map
| File | Intent | Done |
|------|--------|------|
| src/config/npc.ts | 名称、尺寸、路径与四动作元数据 | yes |
| src/render/npc/npc-rig.ts | 按需加载、蒙皮克隆和共享资源生命周期 | yes |
| src/render/npc/npc-animator.ts | 绝对时间动作采样与循环 | yes |
| src/app/showcase/npc-session.ts | 共享模型的取景与播放 | yes |
| src/config/showcase.ts | 双卡/单卡目录入口 | yes |
| src/config/character-assets.ts | 每角色四张参考与四张实际渲染 | yes |
| src/app/showcase/session.ts、catalog.ts | NPC 会话分派与目录 | yes |
| src/ui/showcase-panel.ts | NPC 四向和拖转检查 | yes |
| src/app/showcase-app.ts | 异步加载同步与缓存释放 | yes |
| scripts/blender_npcs/build.py、animation.py、studio.py | 形体、蒙皮、动作、导出与实际渲染 | yes |
| scripts/blender_npcs/fit_report.py | 注册参考、真实四向与三维下颌测量 | yes |
| public/characters/{sam,tibo}/ | 正式 GLB、四向参考、透明四向渲染与来源 | yes |
| assets/characters/{sam,tibo}/ | 原始源、可编辑 blend、形体及动作验收证据 | yes |

## Final Results
| Item | Sam | Tibo |
|------|-----|------|
| 实测头身 | 3.17287 | 3.07966 |
| 世界高度 | 2.70 | 2.65 |
| 三角形 | 34,217 | 34,968 |
| 骨骼 | 17，含尾骨 | 16 |
| 四向尺寸、中心、足底 | 通过 | 通过 |
| 四动作首尾实际顶点差 | 均为 0 | 均为 0 |
| 行走支撑足最大接地误差 | 1.40e-7 格 | 1.80e-7 格 |

动作时长为 idle 4 秒、walk 1.2 秒、greet 3 秒、special 4 秒。最终四向 PNG 为 1024×1536 透明背景。原始源与导出贴图完整性核验通过。

静态结论记录在 fit-rigged/VISUAL-REVIEW.md 和 report.json；报告与最终 blend 的 SHA 一致。Sam 最终权重调整没有改变静态网格、UV、材质与纹理，静态渲染复用证据记录在 rest-geometry-reuse.json。人工下颌定位存在约 ±8 px 视觉误差，轮廓 IoU 仅为诊断，不等于逐像素复刻。

动作极值图、真实网格循环和接地检查见 evidence/actions-final/、animation-verification.json；原始源与纹理字节检查见 export-verification.json。

## Validation
| Command / Check | Result |
|-----------------|--------|
| npm run typecheck | 通过 |
| npm test | 1532/1532 通过，305 suites，50.68 秒 |
| npm run build | 通过；保留既有主包超过 500 kB 提示 |
| Blender 真实模型四向与动作极值 | 主代理与子代理独立验收通过 |
| 游戏浏览器模型、视角、四动作 | 通过；console 无 error/warn |
| 最终文件 SHA、原始源与图片复制一致性 | 通过 |

未新增渲染自动测试，未运行 CI、部署、提交或推送。
