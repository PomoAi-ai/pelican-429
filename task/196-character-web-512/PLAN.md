# PLAN -- 512 角色贴图与模型压缩

## Status: done
## Task: 196
## Related: 190
## Baseline Commit: 3a35077

## Goal
继续减小 WebGL 角色资源，默认贴图降至512，保留原始高清入口；测量与上轮1K的差异，验证画面和加载。

## Non-goals
不减面、改顶点精度或删除动画；不改玩法、vendor、CI、部署或提交。

## Acceptance Criteria
- 基于原始源资源直接生成512，不从1K重复降采样。
- 原件保留，游戏和展示场共享加载入口；动画/骨骼/顶点解码后逐字节不变。
- 有证据后加入兼容 three0.180 的无损 EXT_meshopt_compression，解码器复用 three 附带模块；离线编码器声明固定dev版本。
- 记录资源和纹理预算变化，浏览器查看512与高清入口；完成3条项目验证命令。

## Decisions
- 前轮已覆盖贴图/调用链探索，本轮复用；设计子代理实测Meshopt缓冲区压缩收益与还原。
- 保留颜色Q90、数值贴图无损编码，只改变最大边512，比较结果能隔离尺寸影响。
- 起始代码、8份1K资源和报告已备份到 /tmp/pelican-512-baseline；工作区已有其他改动保留。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/build-web-models.ts | 512贴图与可验证无损Meshopt封装 | — | yes |
| 2 | src/config/web-models.ts / src/render/character-model.ts / 三rig | 无贴图角色压缩与共享解码器接入 | — | yes |
| 3 | package.json / package-lock.json | 固定已有编码器dev版本 | — | yes |
| 4 | public/characters/*.web.glb / assets/characters/web-models-report.json | 重新生成及实测数据 | 1,2,3 | yes |
| 5 | docs/character-web-textures.md | 最新规格、结果与限制 | 4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run assets:web | yes | yes — 9资源生成及解码逐字节检查通过 |
| npm run typecheck | yes | yes — 首次通过；工作区NPC动作代码更新后复跑通过 |
| npm test | yes | yes — 首次1722/1723通过，Tibo治疗收招用例失败；工作区相关代码更新后对应boss.test.ts复跑24/24通过，未再次运行全量 |
| npm run build | yes | yes — 首次及NPC代码更新后均通过；仍有大于500kB的chunk警告 |
| 浏览器游戏/展示场与原始高清入口 | yes | yes — 512展示场、Sam/Tibo双形态、自由世界、主线及original入口正常；最终无warn/error |

- 设计实测：9个模型均能用真实stride无损压缩并逐字节还原，净收益约0.73–1.88MB/模型。选择INDICES避免TRIANGLES编码的循环索引轮换；UINT8稀疏索引和净收益不足的视图保留原始。
- No approval stop condition：512和继续优化已明确授权，本轮可回退仓库内操作直接实现。

- 独立review Approved：真实three GLTFLoader解析9对模型，属性、索引、morph、骨骼和动画轨道deepEqual。临时材质替换仅限Node核验绕开DOM，不替代浏览器验收。
- 初次浏览器检查发现工作区NPC动作契约不一致：NPC_ACTIONS包含attack，但原始GLB没有attack，original与512均失败。随后工作区其他改动接入createNpcAttackClip；本轮未修改NPC玩法。重新构建后上述入口均通过，相关Boss测试24/24通过。
- 9份原始文件SHA-256未变，public与最终dist产物大小全部匹配报告。独立review通过，相关文件git diff --check通过。
- 9模型同口径由32,180,000降至14,363,564字节（减少55.4%）；相对原始98,320,228字节减少85.4%。
- 浏览器ResourceTiming实测自由世界7份GLB共11,700,764字节，主线7份共11,682,148字节，全部为.web.glb且无重复URL请求；该数据为模型响应正文大小，不是全页面体积或冷启动耗时。
- 纹理RGBA8+mip理论预算：每场景96→24MiB，全部贴图128→32MiB。没有测量实际显存、FPS或受控网络加载耗时。
- 画面证据：sam-512-close.jpg、npcs-512-human.jpg、grassy-512-close.jpg、enemies-512.jpg、free-world-512.jpg、story-512.jpg。近景细纹清晰度取舍由用户验收，保留高清入口。
