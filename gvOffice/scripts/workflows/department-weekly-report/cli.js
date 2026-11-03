import { callDws, dwsGate } from '../../shared/dws.js';
import { loadConfig, saveConfig } from '../../shared/store.js';
import { extractEntries, findAnomalies, reportTitle, selectPeriod } from './period.js';

function print(value) { process.stdout.write(`` + JSON.stringify(value, null, 2) + `\n`); }
function parse(argv) { return Object.fromEntries(argv.reduce((all, value, index) => value.startsWith('--') ? [...all, [value.slice(2), argv[index + 1]?.startsWith('--') ? true : argv[index + 1]]] : all, [])); }
function required(options, name) { if (!options[name] || options[name] === true) throw new Error(`缺少 --` + name); return options[name]; }
function unwrap(result) { return result?.data || result?.result || result; }
function todayShanghai() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

async function validateResources(workflow) {
  const [source, template, folder] = await Promise.all([
    callDws(['doc', 'info', '--node', workflow.source.shortcutNodeId]),
    callDws(['doc', 'info', '--node', workflow.template.nodeId]),
    callDws(['drive', '+inspect', '--node', workflow.targetFolder.nodeId])
  ]);
  if (source.extension !== 'dlink' || source.linkSourceInfo?.nodeId !== workflow.source.sheetNodeId || source.linkSourceInfo?.extension !== 'axls') throw new Error('源表快捷入口已失效或不再指向已配置的在线电子表格，请重新绑定');
  if (template.extension !== 'adoc') throw new Error('MLS 模板已失效或不再是钉钉在线文档，请重新绑定');
  const folderData = unwrap(folder);
  const folderType = folderData.data?.file?.type || folderData.file?.type || folderData.nodeType || folderData.type;
  if (!folderType || !String(folderType).toLowerCase().includes('folder')) throw new Error('目标“周报”节点已失效或不再是文件夹，请重新绑定');
}

async function readSheets(nodeId) {
  const listed = unwrap(await callDws(['sheet', '+list-sheets', '--node', nodeId]));
  return Promise.all((listed.sheets || []).map(async sheet => {
    const info = await callDws(['sheet', 'info', '--node', nodeId, '--sheet-id', sheet.sheetId]);
    const range = info.nonEmptyRange?.range;
    if (!range) return { ...sheet, cells: [] };
    const read = unwrap(await callDws(['sheet', '+read', '--node', nodeId, '--sheet-id', sheet.sheetId, '--range', range]));
    if (!read.complete || read.hasMore) throw new Error(`工作表“` + sheet.title + `”读取不完整`);
    return { ...sheet, cells: read.cells };
  }));
}

export async function departmentWeeklyReport(command, argv) {
  const options = parse(argv);
  if (command === 'help') return print({ commands: ['gate', 'config-set --source-shortcut-node ID --source-sheet-node ID --template-node ID --target-folder-node ID [--host NAME]', 'config-show', 'inspect [--date YYYY-MM-DD]', 'target-record --period-end YYYY-MM-DD --node ID --url URL [--title TITLE]'] });
  if (command === 'config-show') return print({ shared: await loadConfig(), workflow: await loadConfig('department-weekly-report') });
  const shared = await loadConfig();
  const gate = await dwsGate(shared);
  if (command === 'gate') return print(gate);
  if (command === 'config-set') {
    const current = await loadConfig('department-weekly-report');
    const workflow = { schemaVersion: 1, backend: 'dws', source: { shortcutNodeId: required(options, 'source-shortcut-node'), sheetNodeId: required(options, 'source-sheet-node'), ...(options['source-url'] ? { url: options['source-url'] } : {}) }, template: { nodeId: required(options, 'template-node'), ...(options['template-url'] ? { url: options['template-url'] } : {}) }, targetFolder: { nodeId: required(options, 'target-folder-node'), ...(options['target-folder-url'] ? { url: options['target-folder-url'] } : {}) }, host: options.host || current?.host || null, generatedReports: current?.generatedReports || {}, updatedAt: new Date().toISOString() };
    await saveConfig(workflow, 'department-weekly-report');
    return print({ configured: true, workflow });
  }
  const workflow = await loadConfig('department-weekly-report');
  if (!workflow?.source?.sheetNodeId || !workflow?.template?.nodeId || !workflow?.targetFolder?.nodeId) throw new Error('部门周报工作流尚未完成配置');
  if (command === 'inspect') {
    await validateResources(workflow);
    const date = options.date || todayShanghai();
    const sheets = await readSheets(workflow.source.sheetNodeId);
    const period = selectPeriod(sheets, date);
    const sheet = sheets.find(item => item.sheetId === period.sheetId);
    const entries = extractEntries(sheet.cells, period);
    const anomalies = findAnomalies(entries);
    const existing = workflow.generatedReports?.[period.end] || null;
    return print({ ready: anomalies.length === 0, date, period, title: reportTitle(period), sourceEntry: workflow.source.url || workflow.source.shortcutNodeId, template: workflow.template, targetFolder: workflow.targetFolder, existing, host: workflow.host, attendees: entries.filter(item => item.summary).map(item => item.name).filter(name => name !== workflow.host), entries, anomalies, forceInstruction: anomalies.length ? '核对原始表格后重新运行；若确认空值属于请假或无工作安排，可明确回复“确认无误，继续生成”强制放行本次异常快照，不会将空值写入正式周报。' : null });
  }
  if (command === 'target-record') {
    const periodEnd = required(options, 'period-end');
    const next = { ...workflow, generatedReports: { ...workflow.generatedReports, [periodEnd]: { nodeId: required(options, 'node'), url: required(options, 'url'), ...(options.title ? { createdTitle: options.title } : {}), recordedAt: new Date().toISOString() } }, updatedAt: new Date().toISOString() };
    await saveConfig(next, 'department-weekly-report');
    return print({ recorded: true, periodEnd, target: next.generatedReports[periodEnd] });
  }
  throw new Error(`department-weekly-report 未知命令 ` + command);
}
