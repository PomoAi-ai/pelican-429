# REVIEW -- Pages 发布准备与密钥泄漏检查

## Status: done
## Task: 148
## Related: N/A
## Baseline Commit: e5fb3bf32ef27508b167dadd3c0640ede88c3320

## Scope
- Focus: Git 公开内容的密钥风险与 GitHub Pages 发布前提。
- Files: Git 历史、工作区文本、现有 dist 文本、Pages 工作流与资源配置。
- 不输出密钥原文，不修改远程可见性，不自动提交或推送。

## Findings
| Severity | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| Non-critical | 100 | - | public/characters/pelican/prompts.md:5 | 本机绝对路径包含用户名，public 文件也会随网站公开。其他素材来源记录包含类似路径、会话 UUID 和未带认证参数的 Rodin 工作区链接。未发现密钥。 | 如需隐藏制作环境元数据，另行清理；无需把这些记录认定为有效凭据。 |
| Non-critical | 100 | - | vite.config.ts:4 / .github/workflows/pages.yml:1 | 相对 base 尚未提交，Pages 工作流未跟踪；远程尚未启用 Pages。 | 将相对 base 与工作流一起提交，授权后启用 Actions 发布源并推送。 |
| Non-critical | 100 | - | GitHub 仓库设置（无文件行号） | API 明确返回 secret_scanning 和 secret_scanning_push_protection 均 disabled；告警 API 的 404 不能解释成无告警。 | 授权后开启密钥扫描和推送保护。 |

### Filtered by Verification
- Gitleaks 在三个历史提交中共报告 6 项、工作区中 3 项、本地 tree 快照中 2 项；全部对应 `src/render/face-climbers.ts:326`、`src/render/flora-shrubs.ts:45` 的材质程序缓存键，以及前者在现有 dist JavaScript 中的编译版本。人工独立复核确认均为误报，没有添加忽略规则。

## Validation Results
| Command / Check | Result | Details |
|-----------------|--------|---------|
| Gitleaks 8.30.1 官方下载校验 | 通过 | 临时目录运行，SHA-256 与官方 release checksums 一致；没有上传仓库内容。 |
| `gitleaks git . --log-opts='--all' --redact` | 扫描完成，6 项误报 | 覆盖 main 和两个 LFS 迁移前备份提交，共 3 个唯一 commit、29.63 MB 文本；远程 main 与本地 HEAD 一致。 |
| `gitleaks dir` 工作区文本副本 | 扫描完成，3 项误报 | 包含已跟踪、未提交且未忽略文件及现有 dist 文本。3,389 个候选中扫描 1,166 个文本文件、12.90 MB；排除 2,180 个媒体文件、42 个二进制文件，1 个已删除文件无法读取。 |
| `gitleaks dir` 本地 tree 引用文本副本 | 扫描完成，2 项误报 | 44 个 Codex tree 引用去重后为 42 个 tree，提取 2,255 个唯一文本 blob，扫描 21.91 MB。它们不是已发布分支历史，单独补充覆盖。 |
| 独立人工审查 | 未发现真实凭据 | 检查 48 个引用的文件名，以及当前源码、脚本、文档、资源文本中的认证信息与外部链接；确认上述误报。 |
| Pages 工作流 YAML 解析与人工契约核对 | 通过 | 有 build/deploy 依赖、LFS checkout、Node 22、dist 上传、pages/id-token 权限、github-pages 环境；未包含测试命令。 |
| GitHub 只读 API | 发布未配置 | 仓库 public；main 为基线提交；Actions enabled；运行列表为空；Pages 返回 404。 |
| 现有产物大小 | 820,307,304 bytes | 约 820 MB / 782 MiB，低于 Pages 1 GB 上限。仅检查已有 dist，未重新构建，最终以 CI 构建产物为准。 |

本次是只读审查与发布研究，没有修改应用或工作流，没有运行 `npm run typecheck`、`npm test` 或 `npm run build`，没有新增测试。没有扫描被忽略的依赖目录、用户凭据目录、图片 OCR、压缩包或 Blender/GLB 内嵌二进制；扫描结果不构成不存在任何秘密的绝对保证。

## Pages 发布方案
- 使用现有 GitHub Actions 工作流，在 CI 运行 `npm ci`、`npm run build`，上传并发布 dist。不进行本地部署打包。
- 必须同时提交 `.github/workflows/pages.yml` 和 `vite.config.ts` 的相对 base 修正；当前工作区有大量其他开发改动，需要按获批的提交范围发布。
- 默认地址：`https://pomoai-ai.github.io/pelican-429/`。先启用 Pages 的 GitHub Actions 发布源，再推送工作流，检查部署结果与实际页面资源。
- 自定义域名尚未确定。子域名需要在 Pages 设置中配置，并在 DNS 添加指向 `pomoai-ai.github.io` 的 CNAME（不带仓库路径），等待 DNS/证书就绪后启用 HTTPS。Actions 发布不依赖仓库 CNAME 文件。
- 当前未执行提交、推送、启用 Pages、DNS 修改或密钥扫描设置修改。

## Sources
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- https://vite.dev/guide/static-deploy.html
- https://github.com/gitleaks/gitleaks

## Conclusion
- Assessment: Approved with notes
- Summary: 在说明的扫描范围内未发现真实密钥或硬编码凭据。发布配置可用，但仍需提交相对 base 和工作流、启用 Pages；网站尚未上线。少量制作元数据公开，GitHub 密钥保护尚未启用。
- 后续处理：本地制作环境元数据已按任务 150 清理，复扫无残留；远程旧提交仍含清理前内容，尚未重写或推送。GitHub 密钥保护状态未改动。
