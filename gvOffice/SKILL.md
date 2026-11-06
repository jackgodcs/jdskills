---
name: gv-office
description: 个人日常办公编排 Skill。使用明确入口识别并执行钉钉办公工作流，统一处理身份、配置和跨工作流衔接。支持个人日报、根据日报填写个人周报表，以及汇总部门周报在线文档；各工作流遵循自身写入规则。
---

# gvOffice

作为个人日常办公的统一入口，负责选择工作流、应用个人业务规则，并把具体钉钉操作交给对应的 DWS 能力。不要把所有产品命令复制到本 Skill。

## 路由

- 新请求仅在开头匹配 `日报：`、`日报:`、`日志：` 或 `日志:` 时，明确进入 `daily-report`。前缀只选择工作流，不授权提交。
- 已进入工作流后，后续补充、修改和确认继承当前工作流，不要求重复前缀。
- 没有入口词但用户明确说要写钉钉日报时，可以说明识别结果后进入；意图不清时先询问，不默认进入日报。
- 新请求以 `部门周报：` 或 `部门周报:` 开头时进入 `department-weekly-report`。用户明确说“请帮我总结本周部门周报”等同义请求也直接进入；单独出现“周报”不触发，避免与个人日志周报混淆。
- 新请求以 `个人周报：` 或 `个人周报:` 开头时进入 `personal-weekly-report`。明确要求“根据我的日报汇总个人周报”或“把我这周的日报填到部门周报表”也进入；含糊的“生成周报”先询问个人填写还是部门汇总。
- 当前实现 `daily-report`、`personal-weekly-report` 和 `department-weekly-report`。新增工作流时再确认入口词、配置、底层产品和写入规则，不创建空入口或空模块。
- 多工作流请求由 gvOffice 按依赖顺序编排；每类外部写入遵循对应工作流的预览或自动执行规则。前一步失败或结果不确定时停止依赖它的后续写入。

## 公共运行环境门禁

进入任何依赖脚本或钉钉的工作流后，先按 [运行环境门禁](references/shared/runtime-gate.md) 检测 Node.js、DWS、登录和组织，再加载工作流说明。门禁通过前不得调用 gvOffice CLI，也不得根据缓存模板生成业务预览。

只有在实现新工作流，或明确进入已有工作流的新能力开发、契约升级和修订阶段时，才读取 [钉钉官方 API 能力门禁](references/shared/dingtalk-official-api-gate.md) 并核查官方文档、DWS Schema 或 Help。`daily-report`、`personal-weekly-report`、`department-weekly-report` 等已经实现并固化契约的工作流，在日常预览、发送、写入和结果回读中直接使用既有契约，不重复执行能力核查。运行时遇到契约外错误应停止并报告；只有用户随后要求修订实现时，才进入开发核查。外部写入仍必须按工作流要求做写前状态核对和写后回读。

当前日报工作流读取 [日报工作流](references/workflows/daily-report/workflow.md)。CLI 统一使用：

```text
node scripts/gv-office.js daily-report <command>
```

不支持旧的根级日报命令。

部门周报工作流读取 [部门周报工作流](references/workflows/department-weekly-report/workflow.md)，CLI 使用：

~~~text
node scripts/gv-office.js department-weekly-report <command>
~~~

个人周报工作流读取 [个人周报工作流](references/workflows/personal-weekly-report/workflow.md)，CLI 使用：

~~~text
node scripts/gv-office.js personal-weekly-report <command>
~~~

## 配置与写入边界

- 公共配置位于 `%LOCALAPPDATA%\gvOffice\config.json`；工作流配置位于 `%LOCALAPPDATA%\gvOffice\workflows\<workflow>.json`。
- 配置只保存稳定身份、资源唯一标识、模板和偏好，不保存 DWS Token、日报正文、部门周报正文或 Agent 定时任务正文。凭证由 DWS 管理。
- 日报对最终预览的确认只授权该预览中列出的目标、内容和时间。部门周报在数据完整时按已配置规则直接生成或覆盖；出现缺失或歧义时遵循其异常阻断规则。
- 持久切换 DWS Profile 前展示当前组织和目标组织，取得单独确认后才能执行。
