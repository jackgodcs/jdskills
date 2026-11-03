# 钉钉日志集成

只使用官方 DWS 当前员工 Profile 的 `dws report`。企业内部应用、`dingtalk-mcp`、Client ID/Secret 和客户端 UI 自动化不作为回退。

当前已验证 DWS v1.0.66 可以读取“日报”模板和日期字段。指定日期写入真实日期字段，不伪装进正文。`report entry submit` 是立即正式提交，只允许在用户确认的 Agent 定时 fallback 到点运行时调用。

DWS v1.0.66 未公开保存钉钉原生草稿或设置服务端定时提交的入口。只有能够写入并从钉钉读回草稿状态、计划时间、模板和接收人时，才能把模式标记为 `native`。否则使用 [Agent 定时 fallback](agent-scheduled.md)，并明确说明提交前钉钉中没有草稿。

日志接收人是用户独立维护的工作流配置，可能包含一人或多人；稳定 userId 保存于工作流配置。模板初始化和更新不得从最近日志推断接收人，也不得重置用户已有列表。更换组织或增删接收人时必须重新确认。

首次模板配置优先调用 `dws report +report-latest` 读取用户最近一次已提交日志的 `templateName`。最近日志不直接提供稳定模板 ID，因此必须再用 `report template list` 按名称唯一匹配，并用 `report template get --name` 验证字段。无法唯一匹配时只展示候选并等待用户选择。

本次未提供“近期需完成工作”时，调用 `report +report-latest --keyword <当前模板名>` 取得最近一次同模板日志，仅提取键名完全等于“近期需完成工作”的非空字段。该历史值是预览默认值，不是用户本次输入；必须在预览中标明来源。
