import { callDws, dwsGate } from '../../shared/dws.js';
import { loadConfig, saveConfig } from '../../shared/store.js';
import { filterReports, missingDates, monthWindows, previewDigest, resolvePeriod, structurePlan } from './logic.js';

function print(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function parse(argv) { return Object.fromEntries(argv.reduce((all, value, index) => value.startsWith('--') ? [...all, [value.slice(2), argv[index + 1]?.startsWith('--') ? true : argv[index + 1]]] : all, [])); }
function unwrap(result) { return result?.data || result?.result || result; }
function todayShanghai() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

async function readSheets(nodeId) {
  const listed = unwrap(await callDws(['sheet', '+list-sheets', '--node', nodeId]));
  return Promise.all((listed.sheets || []).map(async sheet => {
    const info = await callDws(['sheet', 'info', '--node', nodeId, '--sheet-id', sheet.sheetId]);
    if (!info.nonEmptyRange?.range) return { ...sheet, cells: [] };
    const read = unwrap(await callDws(['sheet', '+read', '--node', nodeId, '--sheet-id', sheet.sheetId, '--range', info.nonEmptyRange.range]));
    if (!read.complete || read.hasMore) throw new Error('工作表“' + sheet.title + '”读取不完整');
    return { ...sheet, cells: read.cells };
  }));
}

async function reportDetails(period, templateName) {
  const ids = new Set();
  for (const window of monthWindows(period)) {
    let cursor = 0;
    do {
      const page = await callDws(['report', '+outbox-list', '--start', window.start + 'T00:00:00+08:00', '--end', window.end + 'T00:00:00+08:00', '--template-name', templateName, '--cursor', String(cursor), '--size', '20']);
      const data = unwrap(page);
      for (const report of data.reports || []) ids.add(report.reportId);
      const next = data.nextCursor ?? page.meta?.pagination?.next_token;
      if (!data.hasMore && page.meta?.pagination?.endpoint_exhausted !== false) break;
      if (next == null || Number(next) <= cursor) throw new Error('日报分页游标未严格前进');
      cursor = Number(next);
    } while (true);
  }
  return Promise.all([...ids].map(reportId => callDws(['report', 'entry', 'get', '--report-id', reportId])));
}

export async function personalWeeklyReport(command, argv) {
  const options = parse(argv);
  if (command === 'help') return print({ commands: ['gate', 'setup', 'config-show', 'inspect [--date YYYY-MM-DD]'] });
  if (command === 'config-show') return print({ shared: await loadConfig(), workflow: await loadConfig('personal-weekly-report'), dailyReport: await loadConfig('daily-report'), departmentWeeklyReport: await loadConfig('department-weekly-report') });
  const shared = await loadConfig();
  const gate = await dwsGate(shared);
  if (command === 'gate') return print(gate);
  const department = await loadConfig('department-weekly-report');
  const daily = await loadConfig('daily-report');
  if (!department?.source?.sheetNodeId || !department?.source?.shortcutNodeId) throw new Error('尚未配置共享周报表格，请先提供表格 URL 完成绑定');
  if (!daily?.templateId || !daily?.templateName) throw new Error('个人日报模板尚未配置，请先运行 daily-report setup');
  if (command === 'setup') {
    const source = await callDws(['doc', 'info', '--node', department.source.shortcutNodeId]);
    if (source.extension !== 'dlink' || source.linkSourceInfo?.nodeId !== department.source.sheetNodeId || source.linkSourceInfo?.extension !== 'axls') throw new Error('共享周报表格链接已失效，请重新绑定');
    const workflow = { schemaVersion: 1, backend: 'dws', source: { shortcutNodeId: department.source.shortcutNodeId, sheetNodeId: department.source.sheetNodeId, url: department.source.url || source.docUrl }, identity: { userId: gate.profile.userId, userName: gate.profile.userName }, dailyTemplate: { templateId: daily.templateId, templateName: daily.templateName }, referenceSheetTitle: '2026年10月', previewRequired: true, updatedAt: new Date().toISOString() };
    await saveConfig(workflow, 'personal-weekly-report');
    return print({ configured: true, workflow });
  }
  const workflow = await loadConfig('personal-weekly-report');
  if (!workflow) throw new Error('个人周报尚未初始化，请先运行 setup');
  if (command === 'inspect') {
    const date = options.date || todayShanghai();
    const sheets = await readSheets(workflow.source.sheetNodeId);
    const period = resolvePeriod(sheets, date);
    const details = await reportDetails(period, workflow.dailyTemplate.templateName);
    const reports = filterReports(details, period, workflow.dailyTemplate.templateName);
    const missing = missingDates(reports, period, date);
    const plan = structurePlan(sheets, period, workflow.identity.userName);
    const coordination = reports.filter(report => report.coordination).map(report => ({ date: report.date, content: report.coordination }));
    const preview = { date, period, reports, missingDates: missing, scheduledReportReadable: false, structure: plan, sourceEntry: workflow.source.url || workflow.source.shortcutNodeId, identity: workflow.identity, coordination, warnings: [...(missing.includes(date) ? ['今天的钉钉原生定时日报无法通过当前 DWS 读取；请补充今天内容或待发送后重试'] : []), ...(coordination.length ? ['日报中存在“需协调工作”，不会自动写入个人周报表格'] : [])] };
    return print({ ready: reports.some(report => report.completed) && missing.length === 0, ...preview, snapshotDigest: previewDigest(preview), next: missing.length ? '补齐日报、提供缺失日期内容，或明确确认缺失属于请假/节假日后重新生成预览' : '由 Agent 根据 reports[].completed 生成精简周报预览；用户确认写入后再按 structure 执行 DWS 写操作' });
  }
  throw new Error('personal-weekly-report 未知命令 ' + command);
}
