import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPeriod, filterReports, missingDates, monthTitle, monthWindows, resolvePeriod, structurePlan } from '../../scripts/workflows/personal-weekly-report/logic.js';

const cell = value => ({ value });

test('默认按周一至周日生成总结和下周计划周期', () => {
  assert.deepEqual(defaultPeriod('2026-11-06'), { start: '2026-11-02', end: '2026-11-08', header: '11.2-11.8工作总结', planStart: '2026-11-09', planEnd: '2026-11-15', planHeader: '11.9-11.15工作计划' });
});

test('已有表头优先决定当前周期和月份工作表', () => {
  const sheets = [{ sheetId: 'oct', title: '2026年10月', cells: [[cell(''), cell('10.26-10.31工作总结'), cell('11.2-11.8工作计划')]] }];
  const period = resolvePeriod(sheets, '2026-10-30');
  assert.equal(period.header, '10.26-10.31工作总结');
  assert.equal(period.planHeader, '11.2-11.8工作计划');
  assert.equal(monthTitle(period), '2026年10月');
});

test('日报按正文日期筛选、去重并检查工作日完整性', () => {
  const detail = (id, date, completed) => ({ result: { report_Id: id, report_template_name: '日报', report_content: [{ key: '日期', value: date }, { key: '今日完成工作', value: completed }] } });
  const period = defaultPeriod('2026-11-06');
  const reports = filterReports([detail('1', '2026-11-02', 'A'), detail('1', '2026-11-02', 'A'), detail('2', '2026-11-04', 'B'), detail('3', '2026-10-30', '旧')], period, '日报');
  assert.deepEqual(reports.map(item => item.date), ['2026-11-02', '2026-11-04']);
  assert.deepEqual(missingDates(reports, period, '2026-11-06'), ['2026-11-03', '2026-11-05', '2026-11-06']);
});

test('结构计划仅新增缺失项并保留已有内容', () => {
  const period = defaultPeriod('2026-11-06');
  const sheets = [{ sheetId: 'nov', title: '2026年11月', cells: [[cell(''), cell('11.2-11.8工作总结')], [cell('@示例用户'), cell('旧总结')]] }];
  const plan = structurePlan(sheets, period, '示例用户');
  assert.equal(plan.currentSummary, '旧总结');
  assert.equal(plan.plan.action, 'insert-after-summary');
  assert.equal(plan.person.rowIndex, 1);
});

test('跨月周期查询涉及月份且每段不超过20天', () => {
  const windows = monthWindows({ start: '2026-10-26', end: '2026-11-01' });
  assert.deepEqual(windows, [
    { start: '2026-10-01', end: '2026-10-21' },
    { start: '2026-10-21', end: '2026-11-01' },
    { start: '2026-11-01', end: '2026-11-21' },
    { start: '2026-11-21', end: '2026-12-01' }
  ]);
});
