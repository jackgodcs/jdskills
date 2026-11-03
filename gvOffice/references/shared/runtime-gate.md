# 运行环境门禁

所有需要运行 gvOffice 脚本或操作钉钉的工作流在生成业务预览前执行本门禁。检查顺序固定为 Node.js、DWS、登录与组织。

## Node.js 检测

在调用任何 `scripts/*.js` 前，由 Agent 通过系统命令运行 `node --version`。Node.js 不存在或版本命令失败时立即停止，并告诉用户：

1. 从 [Node.js 官方下载页](https://nodejs.org/en/download) 手动安装当前 LTS 版本；
2. 安装完成后先在当前 Agent 会话重新执行请求，同时检查 PATH 与 Windows 常见 Node.js 安装位置；
3. 当前会话仍无法发现 Node.js 时，再完全重启 Agent 后重试。

gvOffice 当前没有第三方 npm 运行依赖，日常使用无需执行 `npm install`。`package.json` 和测试文件用于开发及验证，不代表用户必须安装项目依赖。Node.js 缺失时不要尝试用 PowerShell、Python 或其他临时实现绕过 gvOffice CLI。

## DWS 检测

按 `DWS_PATH`、系统 `PATH`、Windows 默认 WinGet 链接位置的顺序查找并运行 `dws --version`。仅文件存在不算通过，版本命令必须成功。

未找到可运行的 DWS 时停止工作流，并告诉用户：

1. 从 [DingTalk Workspace CLI Releases](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases) 手动下载安装；
2. 安装完成后先在当前 Agent 会话重新执行请求；gvOffice 会重新检查 `DWS_PATH`、PATH 和 WinGet Links；
3. 当前会话仍无法发现 DWS 时，再完全重启 Agent 后重试。

不要自动安装、持续轮询、切换到企业内部应用、`dingtalk-mcp` 或钉钉客户端 UI 自动化。

## 登录与组织

检测成功后运行 `dws profile list --format json`：

- 没有有效账号时，可辅助用户运行国内版 `dws auth login`；国际版明确使用 `dws auth login --intl`。浏览器、扫码或人工确认由用户完成。
- 登录后重新读取 Profile。只有一个有效组织时继续；多个组织时列出真实组织和账号，让用户选择，禁止默认选第一项。
- 需要持久切换时，先展示“当前组织 → 目标组织”。用户单独确认后运行 `dws profile switch <稳定 selector>`，再用 `profile list` 和 `auth status` 验证。
- 当前组织与 `%LOCALAPPDATA%\gvOffice\config.json` 不一致时停止业务流程，完成确认切换或更新配置后再继续。

写操作始终使用门禁验证过的同一 Profile。
