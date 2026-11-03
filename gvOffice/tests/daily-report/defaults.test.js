import test from 'node:test';
import assert from 'node:assert/strict';
import { previousUpcomingWork } from '../../scripts/workflows/daily-report/cli.js';

const report = {
  reportId: 'report-1',
  templateName: '日报',
  fields: [
    { key: '今日完成工作', value: '完成测试' },
    { key: '近期需完成工作', value: '继续处理测试问题' }
  ]
};

test('inherits non-empty upcoming work from the same template', () => {
  assert.deepEqual(previousUpcomingWork(report, '日报'), { content: '继续处理测试问题', reportId: 'report-1', templateName: '日报', source: 'previous-report' });
});

test('does not inherit from a different template', () => {
  assert.equal(previousUpcomingWork(report, '周报'), null);
});

test('does not inherit an empty upcoming-work field', () => {
  assert.equal(previousUpcomingWork({ ...report, fields: [{ key: '近期需完成工作', value: '  ' }] }, '日报'), null);
});

test('does not infer content from a similarly named field', () => {
  assert.equal(previousUpcomingWork({ ...report, fields: [{ key: '近期计划', value: '继续测试' }] }, '日报'), null);
});
