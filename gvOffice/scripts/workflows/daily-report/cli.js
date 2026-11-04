import { calculateSchedule, resolveDelivery } from './time.js';
import { callDws, currentProfile, dwsGate, listProfiles, login, switchProfile } from '../../shared/dws.js';
import { loadConfig, saveConfig } from '../../shared/store.js';

export const DEFAULT_DAILY_REPORT_TEMPLATE = { templateId: '14eade35f619cdbcee39df04266a2811', templateName: '日报' };
const DEFAULT_FIELD_ORDER = ['日期', '今日完成工作', '近期需完成工作', '公司产品、客户反馈、市场竞争信息', '需协调工作'];
const DELIVERY_POLICIES = [
  { id: 'immediate', name: '确认后立即发送', recommended: true },
  { id: 'specified', name: '每篇指定日期和时间', requiredFormat: 'YYYY-MM-DD HH:mm' },
  { id: 'rule-based', name: '按约定规则发送', rules: ['当天日报：21:29', '历史日报：21:15前确认则当天21:29', '历史日报：21:15及以后确认则确认后15分钟', '未来日报：对应日期21:29'] }
];

function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function parse(argv) { return Object.fromEntries(argv.reduce((all, value, index) => value.startsWith('--') ? [...all, [value.slice(2), argv[index + 1]?.startsWith('--') ? true : argv[index + 1]]] : all, [])); }
function required(options, name) { if (!options[name] || options[name] === true) throw new Error(`缺少 --${name}`); return options[name]; }
function templates(result) { return (result.items || []).map(item => ({ templateId: item.report_template_id, templateName: item.report_template_name })); }
function receivers(options) {
  const names = (options['receiver-names'] || '').split(',');
  return (options['receiver-user-ids'] || '').split(',').filter(Boolean).map((userId, index) => ({ userId, ...(names[index] ? { name: names[index] } : {}) }));
}
export function updateReceivers(current, action, receiver) {
  const existing = current || [];
  if (action === 'set') { if (!receiver.length) throw new Error('接收人列表不能为空'); return [...new Map(receiver.map(item => [item.userId, item])).values()]; }
  if (action === 'add') return existing.some(item => item.userId === receiver.userId) ? existing.map(item => item.userId === receiver.userId ? { ...item, ...receiver } : item) : [...existing, receiver];
  if (action === 'remove') { const next = existing.filter(item => item.userId !== receiver.userId); if (!next.length) throw new Error('不能删除最后一个接收人'); return next; }
  throw new Error(`未知接收人操作 ${action}`);
}
export function previousUpcomingWork(report, templateName) {
  if (!report || report.templateName !== templateName) return null;
  const field = report.fields?.find(item => item.key === '近期需完成工作');
  const content = typeof field?.value === 'string' ? field.value.trim() : '';
  return content ? { content, reportId: report.reportId, templateName: report.templateName, source: 'previous-report' } : null;
}
export function buildDefaultDailyReportContents(fields, values) {
  const byName = new Map((fields || []).map(field => [field.name, field]));
  return DEFAULT_FIELD_ORDER.map(name => {
    const field = byName.get(name);
    if (!field) throw new Error(`默认日报模板缺少字段“${name}”`);
    return { key: name, sort: field.sort, content: name === '日期' ? values.reportDate : values[name] || '', contentType: field.type === 1 ? 'markdown' : 'origin', type: field.type };
  });
}
async function saveTemplate(template, source) {
  const current = await loadConfig('daily-report') || { schemaVersion: 1, backend: 'dws', receivers: [], schedulingPreference: ['native', 'agent-scheduled'] };
  const detail = await callDws(['report', 'template', 'get', '--name', template.templateName]);
  const workflow = { ...current, templateId: template.templateId, templateName: template.templateName, templateSource: source, templateFields: (detail.result?.report_template_fields || []).map(field => ({ name: field.field_name, sort: field.field_sort, type: field.field_type })), updatedAt: new Date().toISOString() };
  await saveConfig(workflow, 'daily-report');
  return workflow;
}
async function setupTemplate() {
  const available = templates(await callDws(['report', 'template', 'list']));
  const current = await loadConfig('daily-report');
  if (current?.templateId) {
    const matched = available.find(template => template.templateId === current.templateId);
    if (matched) return { configured: true, source: 'existing-config', workflow: await saveTemplate(matched, current.templateSource || 'existing-config') };
  }
  const recommended = available.find(template => template.templateId === DEFAULT_DAILY_REPORT_TEMPLATE.templateId && template.templateName === DEFAULT_DAILY_REPORT_TEMPLATE.templateName);
  if (recommended) return { configured: true, firstRun: true, source: 'default-template', recommendation: { ...recommended, message: '首次使用默认推荐“日报”模板；如需其它模板，可从 alternatives 中选择。' }, alternatives: available.filter(template => template.templateId !== recommended.templateId), workflow: await saveTemplate(recommended, 'default-template') };
  let latest;
  let latestError;
  try { latest = await callDws(['report', '+report-latest']); } catch (error) { latestError = error.message; }
  const latestName = latest?.data?.report?.templateName;
  const matched = latestName ? available.filter(template => template.templateName === latestName) : [];
  if (matched.length === 1) return { configured: true, source: 'latest-report', latestReport: { reportId: latest.data.report.reportId, templateName: latestName }, workflow: await saveTemplate(matched[0], 'latest-report') };
  return { configured: false, selectionRequired: true, reason: latestError ? `读取最近日志失败：${latestError}` : !latestName ? '没有可用于推断模板的最近日志' : matched.length === 0 ? `最近日志模板“${latestName}”当前不可用` : `模板名称“${latestName}”存在多个候选`, templates: available };
}

export async function dailyReport(command, argv) {
  const options = parse(argv);
  if (command === 'help') return print({ commands: ['gate', 'setup', 'defaults', 'contents --report-date YYYY-MM-DD --today-work TEXT --upcoming-work TEXT [--product-feedback TEXT] [--coordination TEXT]', 'delivery-policy-show', 'delivery-policy-set --policy immediate|specified|rule-based --confirm-policy true', 'delivery-resolve --report-date YYYY-MM-DD --confirmed-at ISO [--specified-at YYYY-MM-DD HH:mm]', 'template-select --template-id ID', 'verify', 'templates', 'template --name NAME', 'schedule --report-date YYYY-MM-DD --confirmed-at ISO', 'config-set --template-id ID --template-name NAME [--receiver-user-ids CSV] [--receiver-names CSV]', 'receivers-set --receiver-user-ids CSV [--receiver-names CSV] --confirm-receivers true', 'receiver-add --user-id ID [--name NAME] --confirm-receivers true', 'receiver-remove --user-id ID --confirm-receivers true', 'config-show', 'profiles', 'login [--intl true]', 'profile-switch --profile SELECTOR --confirm-switch true'] });
  if (command === 'profiles') return print(await listProfiles());
  if (command === 'login') return print(await login(options.intl === 'true'));
  if (command === 'profile-switch') {
    const target = required(options, 'profile');
    const current = await currentProfile();
    const profiles = await listProfiles();
    const targetProfile = profiles.profiles?.find(profile => profile.profile === target);
    if (!targetProfile) throw new Error(`未找到目标 Profile ${target}，请从 profiles 命令返回的稳定 profile 中选择`);
    if (options['confirm-switch'] !== 'true') return print({ confirmationRequired: true, current: { profile: current.profile, corpName: current.corpName, userName: current.userName }, target: { profile: targetProfile.profile, corpName: targetProfile.corpName, userName: targetProfile.userName } });
    return print(await switchProfile(target));
  }
  if (command === 'config-show') return print({ shared: await loadConfig(), workflow: await loadConfig('daily-report') });
  if (command === 'config-set') {
    const profile = await currentProfile();
    const current = await loadConfig('daily-report');
    const shared = { schemaVersion: 1, timeZone: 'Asia/Shanghai', dws: { profile: profile.profile, corpId: profile.corpId, corpName: profile.corpName, userId: profile.userId, userName: profile.userName }, updatedAt: new Date().toISOString() };
    const workflow = { schemaVersion: 1, backend: 'dws', ...current, templateId: required(options, 'template-id'), templateName: required(options, 'template-name'), receivers: options['receiver-user-ids'] ? updateReceivers(current?.receivers, 'set', receivers(options)) : current?.receivers || [], schedulingPreference: current?.schedulingPreference || ['native', 'agent-scheduled'], updatedAt: new Date().toISOString() };
    await saveConfig(shared);
    await saveConfig(workflow, 'daily-report');
    return print({ shared, workflow });
  }
  const shared = await loadConfig();
  const gate = await dwsGate(shared);
  if (command === 'gate') return print(gate);
  if (command === 'setup') {
    if (!shared) await saveConfig({ schemaVersion: 1, timeZone: 'Asia/Shanghai', dws: gate.profile, updatedAt: new Date().toISOString() });
    const template = await setupTemplate();
    const workflow = await loadConfig('daily-report');
    return print({ ...gate, template, deliveryPolicy: workflow?.deliveryPolicy ? { configured: true, selected: workflow.deliveryPolicy } : { configured: false, selectionRequired: true, recommendation: 'immediate', options: DELIVERY_POLICIES } });
  }
  if (command === 'template-select') {
    const templateId = required(options, 'template-id');
    const candidates = templates(await callDws(['report', 'template', 'list']));
    const matched = candidates.find(template => template.templateId === templateId);
    if (!matched) throw new Error(`当前组织未找到模板 ID ${templateId}`);
    return print({ ...gate, configured: true, source: 'user-selection', workflow: await saveTemplate(matched, 'user-selection') });
  }
  if (command === 'defaults') {
    const workflow = await loadConfig('daily-report');
    if (!workflow?.templateName) throw new Error('日报模板尚未配置，请先运行 setup');
    const latest = await callDws(['report', '+report-latest', '--keyword', workflow.templateName]);
    const value = previousUpcomingWork(latest?.data?.report, workflow.templateName);
    return print({ field: '近期需完成工作', available: Boolean(value), ...(value ? { value } : { reason: '最近一次同模板日志中没有可继承的内容' }) });
  }
  if (command === 'contents') {
    const workflow = await loadConfig('daily-report');
    if (workflow?.templateId !== DEFAULT_DAILY_REPORT_TEMPLATE.templateId) throw new Error('contents 命令只适用于默认“日报”模板；当前已选择其它模板，请按其真实字段构造内容');
    return print({ templateId: workflow.templateId, templateName: workflow.templateName, omittedFields: ['图片', '附件'], contents: buildDefaultDailyReportContents(workflow.templateFields, { reportDate: required(options, 'report-date'), '今日完成工作': required(options, 'today-work'), '近期需完成工作': required(options, 'upcoming-work'), '公司产品、客户反馈、市场竞争信息': options['product-feedback'] || '', '需协调工作': options.coordination || '' }) });
  }
  if (command === 'delivery-policy-show') {
    const workflow = await loadConfig('daily-report');
    return print({ configured: Boolean(workflow?.deliveryPolicy), selected: workflow?.deliveryPolicy || null, recommendation: 'immediate', options: DELIVERY_POLICIES });
  }
  if (command === 'delivery-policy-set') {
    const policy = required(options, 'policy');
    if (!DELIVERY_POLICIES.some(item => item.id === policy)) throw new Error(`未知发送策略 ${policy}`);
    const current = await loadConfig('daily-report');
    if (!current) throw new Error('日报工作流尚未配置，请先运行 setup');
    if (options['confirm-policy'] !== 'true') return print({ confirmationRequired: true, current: current.deliveryPolicy || null, next: policy, detail: DELIVERY_POLICIES.find(item => item.id === policy) });
    const workflow = { ...current, deliveryPolicy: policy, updatedAt: new Date().toISOString() };
    await saveConfig(workflow, 'daily-report');
    return print({ updated: true, deliveryPolicy: policy });
  }
  if (command === 'delivery-resolve') {
    const workflow = await loadConfig('daily-report');
    if (!workflow?.deliveryPolicy) throw new Error('尚未配置默认发送策略，请先运行 delivery-policy-set 并确认');
    return print(resolveDelivery(workflow.deliveryPolicy, required(options, 'report-date'), required(options, 'confirmed-at'), options['specified-at']));
  }
  if (['receivers-set', 'receiver-add', 'receiver-remove'].includes(command)) {
    const current = await loadConfig('daily-report');
    if (!current) throw new Error('日报工作流尚未配置，请先运行 setup');
    let action;
    let value;
    if (command === 'receivers-set') { action = 'set'; value = receivers(options); }
    else { action = command === 'receiver-add' ? 'add' : 'remove'; value = { userId: required(options, 'user-id'), ...(options.name ? { name: options.name } : {}) }; }
    const next = updateReceivers(current.receivers, action, value);
    if (options['confirm-receivers'] !== 'true') return print({ confirmationRequired: true, current: current.receivers, next });
    const workflow = { ...current, receivers: next, updatedAt: new Date().toISOString() };
    await saveConfig(workflow, 'daily-report');
    return print({ updated: true, receivers: workflow.receivers });
  }
  if (command === 'schedule') return print(calculateSchedule(required(options, 'report-date'), required(options, 'confirmed-at')));
  if (command === 'verify') return print({ ...gate, workflow: await loadConfig('daily-report'), templates: await callDws(['report', '+template-search', '--query', options.name || '日报']) });
  if (command === 'templates') return print(await callDws(['report', 'template', 'list']));
  if (command === 'template') return print(await callDws(['report', 'template', 'get', '--name', required(options, 'name')]));
  throw new Error(`daily-report 未知命令 ${command}`);
}
