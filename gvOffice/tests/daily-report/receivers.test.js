import test from 'node:test';
import assert from 'node:assert/strict';
import { updateReceivers } from '../../scripts/workflows/daily-report/cli.js';

const original = [
  { userId: 'user-001', name: '示例用户甲' },
  { userId: 'user-002', name: '示例用户乙' },
  { userId: 'user-003', name: '示例用户丙' },
  { userId: 'user-004', name: '示例用户丁' }
];

test('adding an existing receiver preserves the full list', () => {
  assert.deepEqual(updateReceivers(original, 'add', { userId: 'user-001', name: '示例用户甲' }), original);
});

test('removing one receiver preserves the others', () => {
  assert.deepEqual(updateReceivers(original, 'remove', { userId: 'user-002' }), [original[0], original[2], original[3]]);
});

test('cannot remove the final receiver', () => {
  assert.throws(() => updateReceivers([original[0]], 'remove', original[0]), /最后一个接收人/);
});

test('setting receivers deduplicates by stable user id', () => {
  assert.deepEqual(updateReceivers(original, 'set', [original[0], original[0], original[1]]), [original[0], original[1]]);
});
