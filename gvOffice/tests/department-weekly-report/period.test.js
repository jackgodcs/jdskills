import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEntries, findAnomalies, reportTitle, selectPeriod } from '../../scripts/workflows/department-weekly-report/period.js';

const cell = value => ({ value });
const sheets = [{ sheetId: 'oct', title: '2026年10月', cells: [
  [cell(''), cell('10.19-10.25工作总结'), cell('10.26-10.31工作计划'), cell('10.26-10.31工作总结'), cell('11.2-11.8工作计划')],
  [cell('@甲'), cell('已完成 A'), cell('计划 A'), cell('已完成 B'), cell('计划 B')],
  [cell('@乙'), cell('已完成 C'), cell('计划 C'), cell(''), cell('')]
] }];

test('根据目标日期选择当周总结和右侧计划', () => {
  const period = selectPeriod(sheets, '2026-10-30');
  assert.equal(period.end, '2026-10-31');
  assert.equal(period.summaryColumnIndex, 3);
  assert.equal(period.planColumnIndex, 4);
  assert.equal(reportTitle(period), '地图产品线周例会20261031');
});

test('提取人员并报告空值异常', () => {
  const period = selectPeriod(sheets, '2026-10-30');
  const entries = extractEntries(sheets[0].cells, period);
  assert.deepEqual(entries[0], { name: '甲', summary: '已完成 B', plan: '计划 B' });
  assert.deepEqual(findAnomalies(entries), [
    { person: '乙', field: '本周工作总结', reason: '内容为空' },
    { person: '乙', field: '下周工作计划', reason: '内容为空' }
  ]);
});

test('跨年周期正确补齐结束年份', () => {
  const cross = [{ sheetId: 'dec', title: '2026年12月', cells: [[cell(''), cell('12.28-1.3工作总结'), cell('1.4-1.10工作计划')]] }];
  assert.equal(selectPeriod(cross, '2027-01-02').end, '2027-01-03');
});
