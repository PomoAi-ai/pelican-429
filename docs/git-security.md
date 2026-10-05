# Git 提交安全检查

本地 `pre-commit` 使用 Gitleaks 依次检查暂存差异：`.gitleaks.toml` 保留默认密钥规则，`.gitleaks-metadata.toml` 检查私有制作信息。两份配置独立运行，避免默认密钥规则的路径豁免放过本机路径。发现问题或缺少工具会阻止提交，日志中的匹配内容会脱敏。

## 安装

安装 [Gitleaks 官方发行版](https://github.com/gitleaks/gitleaks/releases) 并加入 `PATH`，或在 macOS 执行 `brew install gitleaks`。当前已验证版本为 8.30.1。

在仓库根目录执行以下命令。若已有 `pre-commit`，先阅读并合并检查步骤，不直接覆盖。

```sh
hook_path=$(git rev-parse --git-path hooks/pre-commit)
test ! -e "$hook_path" && test ! -L "$hook_path" &&
  ln -s "$(pwd)/.githooks/pre-commit" "$hook_path"
```

克隆仓库后需要安装一次；仓库搬家后重新链接。此方式保留 Git LFS 的其他钩子，不设置 `core.hooksPath`。如果本机已有 `core.hooksPath`，应将检查合并到它指定的 `pre-commit`。

## 检查范围

- 默认规则检查常见 API 密钥、令牌和私钥；仅精确放行两个已确认的材质缓存键。
- 自定义规则拦截用户目录、挂载卷目录、用户临时目录和 Rodin 私有工作区链接。
- 制作素材、输出、公开资源、任务记录、文档及来源说明中的 UUID 会被拦截；其他文件只拦截带生成、会话、线程标识语义的 UUID。代码和测试中的普通 UUID 不受此规则影响。
- 提交前只扫描新增或修改的暂存文本，不扫描未暂存内容或既有历史，也不读取 LFS 二进制实体、图片内文字和模型内嵌信息。

手工执行与钩子相同的检查：

```sh
.githooks/pre-commit
```

命中后删除凭据和私有生成标识，将本机路径改成项目相对路径，然后重新暂存。真实凭据若曾公开，应先到对应服务撤销或轮换。误报应逐条核实后精确调整规则，不能关闭默认密钥规则或批量忽略文件。

本地钩子可被 Git 的跳过参数绕过，因此不能替代远程推送保护；新出现的凭据格式也可能未被规则覆盖。配置格式见 [Gitleaks 官方文档](https://github.com/gitleaks/gitleaks#configuration)。
