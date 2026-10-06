# PLAN -- 角色模型非贴图数据压缩

## Status: done
## Task: 209
## Related: 206, 203
## Baseline Commit: bba2d25

## Goal
同步减少角色模型网格、顶点及动画等非贴图数据的传输体积，保留原件与现有纹理档位，提供同贴图条件下的优化前后对比，并接入游戏共享加载路径。

## Non-goals
不扩展到场景图片或音频，不删除骨骼/动作/挂点，不修改vendor，不提交推送部署。

## Acceptance Criteria
- 先统计模型组成再选择有实际收益的压缩策略。
- 生成独立版本，验证结构契约与数值误差；不声称未测量的FPS或显存收益。
- 对比页可在相同贴图分辨率下比较模型数据优化，支持原有拉近镜头。
- 本地typecheck/test/build及浏览器检视，记录实际体积。

## Decisions
- 沿用dev/core-dev/core-test与Ponytail Full。已有资源加载与对比页探索可复用，委派子代理审计模型组成及兼容风险。
- 用户已授权角色模型优化，仓库内可回退改动直接执行；误解为场景图片/音频的方向已纠正。
- 实测256KTX2的贴图仅占1.217MB/12.408MB，主体网格属性7.603MB、索引1.387MB。设计采用现有MeshoptEncoder的18位EXPONENTIAL过滤，不加依赖，保留解码FLOAT32布局与所有节点/面数/动作。无需批准的可回退实现直接推进。
- 生成独立512/256 compact版本；输入贴图逐字节复用，整数索引、JOINTS、IBM、动画时间逐字节保留，更新量化accessor min/max并验证误差。
- 默认游戏与展示场使用512 compact；显式旧档位仍可对照。对比页增加KTX2两栏模型压缩开关，保持镜头和动作时间。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| scripts/build-compact-models.ts、新GLB/report | 生成与验证非贴图数据压缩，子代理实现 | yes |
| web-models、character-model | 新档位、默认路径、共享解码器 | yes |
| texture-compare-app、character-stage-panel | 同纹理优化前后对照及选档 | yes |
| test/character-model.test.ts | 既有缓存测试覆盖新档位与默认路径，缺失decoder或缓存串档会失败 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| 资源结构、误差及体积校验 | yes | 18份通过，独立真实GLTFLoader读回通过，28处sparse与bounds核对通过 |
| npm run typecheck | yes | 通过 |
| npm test | yes | 1746/1747通过；worldgen中位数276.3ms超过250ms，与前轮相同的并发性能失败；未改断言或worldgen，单独复跑29/29通过 |
| npm run build | yes | 通过；已有500kB chunk提示仍在 |
| 浏览器同贴图优化前后检视 | yes | 构建版本3倍近景切换保留镜头，体积更新准确；默认自由世界Grassy/Sam/Tibo渲染正常，无warn/error |
| node --test test/character-model.test.ts | yes | 2/2通过，新档位缓存及decoder路径覆盖 |

## Results
- 512九角色合计15,014,256→11,910,332B，减少20.67%；256合计12,408,408→9,304,216B，减少25.02%。Sam怪物256为763,944B。
- 贴图哈希不变；每档332个索引/JOINTS/IBM/动画时间view逐字节保留；最大浮点误差1.52588e-5，四元数最大角度误差0.0009134°。
- 压缩与独立审查子代理结论均通过。截图before-model-data.png / after-model-data.png。
- 未测量受控加载时间、FPS、GPU显存；此轮不减少解码后的FLOAT32数据大小或面数。未提交、推送、部署或修改vendor。
