# jdskills

个人工作流 Skill 仓库。每个一级目录是一个可独立安装的 Skill；当前包含 `gvOffice`。

## 安装 Skill

将目标 Skill 的内容复制到 Agent 的个人 Skills 目录，并使用 Skill frontmatter 中的名称作为安装目录。以 Windows PowerShell 安装 gvOffice 为例：

在仓库根目录执行：

```powershell
$source = Join-Path (Get-Location) "gvOffice"
$target = Join-Path $env:USERPROFILE ".codex\skills\gv-office"
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $source "SKILL.md"), (Join-Path $source "agents"), (Join-Path $source "references"), (Join-Path $source "scripts"), (Join-Path $source "package.json"), (Join-Path $source "package-lock.json") -Destination $target -Recurse -Force
```

复制完成后重启 Agent，使 Skill 清单重新加载。升级时重复复制步骤；如果仓库删除了旧文件，应先手工清理安装目录中的对应旧文件。

## gvOffice

gvOffice 是个人日常办公编排入口。当前实现钉钉个人日报和部门周报在线文档工作流；未来工作流在真实开发时再加入，不预留空入口。

新日报请求使用：

```text
日报：今天完成了……
日志：补写昨天的工作……
```

支持中文或英文冒号。进入日报工作流后，后续补充不需要重复入口词。入口词只选择工作流，不代表确认提交。

部门周报使用：

~~~text
部门周报：生成本周内容
请帮我总结本周部门周报
~~~

部门周报从已配置的钉钉在线电子表格读取执行日期所在的工作总结周期及其右侧下周计划，依据最新在线 MLS 模板直接生成钉钉在线文档。同周期结果使用稳定 `nodeId` 覆盖更新；文档被人工改名后仍能定位。数据完整时自动生成，存在人员空值或内容异常时只返回具体原因和源表入口，用户修订后重新生成，也可明确强制放行请假等已知空值。

个人周报使用：

~~~text
个人周报：生成本周内容
根据我的日报汇总个人周报
~~~

个人周报读取本人本周期已提交的日报，按正文日期检查工作日完整性并归纳“今日完成工作”，先提供精简预览，确认后填写共享周报表中本人的总结单元格。用户明确提供下周计划时一并填写；未提供则保留计划单元格并返回表格链接供用户核对和补充。缺少月份工作表、周期列或本人行时可按规则补齐，但不会删除已有用户资源或修改其他成员内容。当前 DWS 无法读取尚未发送的钉钉原生定时日报，遇到当天缺失时会提示补充或稍后重试。

### 前置条件

- 可加载本地 Skill 并运行 Node.js 脚本的 Agent 客户端；
- Node.js 运行时（建议安装当前 LTS）；
- DingTalk Workspace CLI（DWS）；
- 已通过 DWS 登录钉钉并选择有效组织。

Node.js 下载地址：[Node.js 官方下载页](https://nodejs.org/en/download)。gvOffice 的 CLI 使用 JavaScript 编写，即使 Skill 不附带第三方 Node 包，也仍依赖 Node.js 运行时。当前日常使用不需要执行 `npm install`。部门周报生成的是钉钉在线文档，不依赖本地 Word、LibreOffice 或 DOCX 工具链。安装 Node.js 后必须完全重启 Agent，再重新执行请求。

DWS 下载地址：[DingTalk Workspace CLI Releases](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases)。安装 DWS 后同样必须完全重启 Agent，再重新执行 gvOffice 请求。gvOffice 不自动安装 Node.js 或 DWS。

检测到 DWS 但未登录时，gvOffice 可以辅助运行登录流程；存在多个组织时会列出真实候选，由用户选择。持久切换组织前会显示当前组织和目标组织，并单独请求确认。

首次进入日报工作流且尚未配置模板时，gvOffice 优先使用用户最近一次已提交日志所用的模板。若没有历史日志、该模板已不可用或不能唯一匹配，则列出当前组织可用模板，让用户选择后再生成预览。

如果本次没有填写“近期需完成工作”，gvOffice 会把同一模板上一次日志中的非空内容作为本次预览默认值，并标注“继承自上次日志”。用户本次明确填写或明确表示无内容时，不继承历史值。

### 日报发送模式

gvOffice 优先使用钉钉原生定时日志。当前 DWS 未公开该能力时，可以在用户确认最终预览后创建一次性 Agent 定时任务，到点调用 DWS 正式提交。fallback 不会提前出现在钉钉草稿中；执行前删除对应 Agent 定时任务即可取消。

本地配置位于 `%LOCALAPPDATA%\gvOffice`。DWS Token 由 DWS 自身管理，不写入仓库或 gvOffice 配置。

### 配置与隐私

真实的组织 ID、用户 ID、接收人、文档 URL、文档 `nodeId` 和工作流映射只保存在用户本机 `%LOCALAPPDATA%\gvOffice`，不得提交到仓库。`gvOffice/examples` 中仅提供使用虚构占位符的配置结构示例；复制示例后应写入仓库外的本机运行时目录，不要在仓库内保存真实配置。DWS Token、Client Secret 和 Access Token 不应写入任何 gvOffice 配置文件。
