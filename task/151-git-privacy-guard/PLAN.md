# PLAN -- Git 历史隐私清理与提交保护

## Status: done
## Task: 151
## Related: 148, 150-fix-public-metadata
## Baseline Commit: e5fb3bf32ef27508b167dadd3c0640ede88c3320

## Goal
清理已公开提交中的制作环境信息，提交清理结果，并安装可复用的本地提交保护。

## Non-goals
不混入其他开发中的游戏改动，不修改资源二进制，不在 CI 添加测试，不在本次变更中启用 Pages 或修改 DNS。

## Acceptance Criteria
- main 可达历史不再包含已识别的个人目录、会话标识和私有生成链接。
- 提交钩子拦截假凭据和制作环境信息，缺少扫描工具时失败，正常内容可提交。
- 现有 LFS hooks 保留；工作区其他未提交内容保留。
- 使用精确旧提交约束的 force-with-lease 推送并核对远程。

## Decisions
- 用户已明确授权清理、提交、历史重写推送和新增 Git 钩子。
- 隐私定位和清理规则复用此前审查与清理结果，跳过重复探索；独立子代理负责钩子的探索、设计、实现及临时仓库验证。
- 远程只有 main 的一个根提交、没有标签、分叉或 PR；重建包含清理结果和保护配置的新根 tree，不改写工作区。
- 通过 GitHub Git 数据 API 写入约 1.37 MB 的文本变动，服务端 tree 与本地已验证 tree 完全一致，复用已有二进制对象。借助临时传输分支让服务端公布新提交，再用精确 force-with-lease 更新 main；临时分支已删除。
- 用临时 index 组装提交，只处理原提交中的元数据和新增保护文件，不暂存其他在研改动。
- 复用 Gitleaks 默认密钥规则，只豁免已确认的两个缓存键误报。制作元数据规则使用独立配置：默认密钥规则会全局放行某些本机路径，必须分开扫描才能防止漏检。不新增扫描框架或依赖包。
- 将 pre-commit 安装到 Git 默认 hooks 目录，不设置 core.hooksPath，避免关闭已有 LFS hooks。
- GitHub 缓存、旧提交直链及他人克隆不能靠强推保证清除；交付时明确这一限制。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | .gitleaks.toml | 默认密钥规则与精确误报例外 | - | yes |
| 2 | .gitleaks-metadata.toml | 独立制作元数据规则 | - | yes |
| 3 | .githooks/pre-commit | 顺序检查暂存内容，缺失工具直接失败 | 1,2 | yes |
| 4 | docs/git-security.md | 安装方法与边界 | 1,2,3 | yes |
| 5 | Git main 历史 | 清理根提交并发布保护配置 | 1,2,3,4 | yes |

## Validation
| Command / Check | Required | Done |
|-----------------|----------|------|
| 临时仓库正常提交、假密钥、个人路径、私有生成信息拦截 | yes | yes，25 项实际 git commit 验证通过 |
| 清理后根 tree 与原 tree 差异仅元数据，LFS 指针不变 | yes | yes，2,588 个文件中仅 172 个元数据变动 |
| 新 main 历史全量 Gitleaks 与隐私模式扫描 | yes | yes，两类规则全量零命中，最终新根与已扫描候选 tree 一致 |
| 独立审查钩子和配置 | yes | yes，修复默认 allowlist 漏检后 Approved |
| 本地钩子生效、现有 LFS hooks 保留 | yes | yes，已安装 Gitleaks 8.30.1 和钩子，四个原有 LFS hooks 哈希保持一致 |
| 远程 main 哈希与推送目标一致 | yes | yes，精确 lease 强推成功，远程核对为清理后的新根 |

本次没有修改游戏代码或模型，没有运行游戏类型检查、测试或构建，也没有向 CI 添加测试。旧 GitHub 缓存和其他人的既有克隆不受此次分支历史清理控制；本地备份引用与 reflog 保留用于恢复，不属于已推送的 main 历史。
