# REVIEW -- 仓库泄密审查

## Status: done
## Task: 285
## Related: N/A
## Baseline Commit: 5733e8d0179e488b96703f982629cf7368371562

## Scope
- Focus: 凭据泄露、私人元数据、运行时信息外传与发布内容。
- Files: 当前仓库的受版本控制文件、未跟踪文件、可用 Git 历史及构建发布配置。
- 只读检查业务代码与配置；所有报告隐藏凭据值，不使用候选凭据发起请求。
- 审查日期：2026-10-07（Asia/Shanghai）；GitHub API 确认仓库为 PUBLIC，远端 main 与上述基线一致。
- 文本快照覆盖 1,410 个 UTF-8 文件；Gitleaks 扫描本地全部引用可达的 15 个提交，其中 main/origin/main 可达 13 个，另外 2 个仅由本地备份引用保留。
- 二进制检查覆盖 124 个 GLB 的 JSON 数据块、67 个 Blender 工程、1,755 张图片的结构化元数据。
- 审查过程中工作树出现其他任务的发布资源白名单及应用模式改动。本报告不修改这些改动，也不将未提交改动视为已发布修复；核心二进制发现均属于基线版本。

## Findings
| Severity | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| Non-critical / P3 | 100 | 独立验证本地、HEAD、匿名 GitHub 内容一致 | `public/characters/sam/render-front.png`；`public/characters/human/models-equipped/render-game-front.png`，PNG `tEXt` → `File`，值的字节偏移 227 | 661 张 PNG 保留制作时本机绝对卷路径：assets 下 557 张，public 下 104 张。抽查的两张图片可通过匿名 GitHub API 下载，属于已公开的目录结构信息。所检查字段不含用户主目录或当前 OS 用户名路径段；没有证据表明它们提供账号访问能力。 | 清除图片中的路径字段，并为资源提交增加针对二进制元数据的检查。 |
| Non-critical / P3 | 100 | 独立子代理检查；示例 LFS SHA-256 与 HEAD 一致 | `assets/characters/grassy/model-equipped/grassy-equipped-game.blend`，解压后字节偏移 301528 | 51/67 个 Blender 工程包含本机绝对图片引用路径，共 269 个路径字符串。该示例属于已提交的 LFS 实体，GitHub 仓库公开，LFS 不构成保密边界。 | 将图片依赖改为合适的相对路径或打包资源，并重新保存、复查工程内嵌路径。 |

二进制没有文本行号，以上提供结构化字段和从 0 开始的字节偏移。现有检查范围的文本依据见 `docs/git-security.md:24`：提交检查不读取 LFS 二进制实体和模型内嵌信息。这解释了文本扫描通过后仍存在上述残留。

### 仅本地残留，未确认对外泄露
- `refs/backup/pre-model-lfs`（`6a514d67`）及 `refs/backup/pre-lfs`（`0f5c862e`）各保留 360 条私人元数据规则命中，涉及各 59 个文件，包括绝对路径、生成标识及私有工作区链接。720 是规则命中总数，存在规则重叠和备份重复，不代表 720 个秘密。
- 两个旧提交均不在当前 main/origin/main 的祖先链上。GitHub 按完整 SHA 查询均返回 HTTP 422、No commit found；只能确认当前查询不到，不能据此断言过去从未公开。
- 未跟踪文件 `output/imagegen/posters/prompts.txt:4` 至第 7 行含 4 处本机路径；不属于已提交内容。当前没有观察到其公开证据，应避免后续误提交。

### Filtered by Verification
- Gitleaks 默认规则在当前文本中命中 2 条、全部历史中命中 6 条，均为 `src/render/flora-shrubs.ts:45` 的 `shrub-leaf-v1` 和 `src/render/face-climbers.ts:326` 的 `face-climbers-v1`。核实它们是材质程序缓存键，不是凭据；历史命中是相同代码的重复版本。
- 当前受版本控制文本及 main/origin/main 历史未发现上述私人元数据规则命中；当前文本的 4 条路径命中全部来自未跟踪提示词。
- 未发现 API 密钥、密码、私钥或带认证信息的连接 URL。未使用任何候选值访问服务，此结论是扫描与代码审查结果，不是对所有潜在凭据格式的保证。

## Validation Results
| Command | Result | Details |
|---------|--------|---------|
| `gitleaks git . --log-opts='--all'`，默认规则，无仓库白名单，`--redact` | 15 个提交；6 条命中全部为误报 | 临时配置仅启用默认规则；忽略文件及行内放行不生效。 |
| `gitleaks git . --log-opts='--all' --config .gitleaks-metadata.toml --redact` | 720 条命中，全部来自两个本地备份提交 | 用 `git merge-base --is-ancestor`、`git for-each-ref --contains` 验证可达性。 |
| `gitleaks dir` 扫描文本快照，默认密钥规则及独立元数据规则 | 2 条缓存键误报；4 条未跟踪提示词路径 | 元数据扫描使用相对文件路径，保留按目录匹配的规则语义。 |
| 标准库补充扫描认证赋值、带密码 URL、敏感 URL 参数、私网地址；枚举敏感文件名 | 未发现额外命中 | 输出仅包含类型和位置，不输出敏感值。 |
| `uv run --offline python3` 解析图片结构化元数据、GLB JSON；`zstd` 流式解压 Blender 文件 | PNG 661 张、Blender 51 个有本机路径 | 124 个 GLB JSON 未发现所检本机路径、私有工作区 URL、UUID；图片结构化元数据未发现所检 GPS、作者/设备所有者标签或 UUID。 |
| `git show HEAD:<file>` 与 LFS SHA-256 核验；匿名 GitHub API 获取两张 PNG | 公开图片 HTTP 200，字节与本地及 HEAD 一致 | 仓库公开属性通过 API 确认；远端 main 为 `5733e8d`。 |
| 子代理追踪应用请求、存储、资源处理脚本、Vite 与 Pages 流程 | 未发现高可信隐私外传路径 | 3 处 fetch 加载固定同源资源；localStorage 用于游戏存档、设置、语言；未发现应用遥测、远程 API 或本机认证信息读取。 |
| `npm run typecheck` / `npm test` / `npm run build` | 未运行 | 本次只读安全审查，没有修改业务代码；这些命令不能验证二进制隐私元数据是否清理。 |

### 边界
- 未 OCR 图片像素，未逐一审查历史二进制版本、不可达 Git 对象或 GitHub 缓存；没有验证游戏站点当前部署的全部文件。
- 未进行浏览器网络抓包、第三方依赖完整源码审计或漏洞大全扫描。
- 主代理负责文本、历史、可达性；两个子代理分别检查运行时信息流和二进制元数据，另一个独立子代理验证公开 PNG。三者均未修改业务文件。
- 本次仅新增本报告，未清理资源、改写历史、删除备份、提交或推送。清理最新文件后，旧版本仍可能保留原元数据；是否清理公开历史需要单独决策。

## Conclusion
- Assessment: Approved with notes
- Summary: 确认存在低风险的制作目录结构信息泄露，主要残留于已公开 PNG 与已提交 Blender 工程。未发现账号凭据泄露或程序主动外传隐私的证据；不能将文本扫描通过等同于仓库完全无隐私信息。
