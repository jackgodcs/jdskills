import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultDailyReportContents, DEFAULT_DAILY_REPORT_TEMPLATE } from '../../scripts/workflows/daily-report/cli.js';

const fields = [
  { name: '日期', sort: 3, type: 5 },
  { name: '今日完成工作', sort: 0, type: 1 },
  { name: '近期需完成工作', sort: 1, type: 1 },
  { name: '公司产品、客户反馈、市场竞争信息', sort: 7, type: 1 },
  { name: '需协调工作', sort: 2, type: 1 },
  { name: '图片', sort: 5, type: 8 },
  { name: '附件', sort: 6, type: 9 }
];

test('uses the configured default report template', () => assert.deepEqual(DEFAULT_DAILY_REPORT_TEMPLATE, { templateId: '14eade35f619cdbcee39df04266a2811', templateName: '日报' }));
test('puts date first and omits image and attachment fields', () => {
  const contents = buildDefaultDailyReportContents(fields, { reportDate: '2026-11-02', '今日完成工作': '完成工作', '近期需完成工作': '后续计划' });
  assert.deepEqual(contents.map(item => item.key), ['日期', '今日完成工作', '近期需完成工作', '公司产品、客户反馈、市场竞争信息', '需协调工作']);
  assert.deepEqual(contents[0], { key: '日期', sort: 3, content: '2026-11-02', contentType: 'origin', type: 5 });
  assert.equal(contents[1].contentType, 'markdown');
});
test('requires every supported default-template field', () => assert.throws(() => buildDefaultDailyReportContents(fields.filter(field => field.name !== '日期'), { reportDate: '2026-11-02' }), /缺少字段“日期”/));
