import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSchedule, isReportDateSafe } from '../../scripts/workflows/daily-report/time.js';

test('today before 21:29 schedules at 21:29', () => assert.equal(calculateSchedule('2026-10-29', '2026-10-29T20:30:00+08:00').scheduledAt, '2026-10-29T13:29:00.000Z'));
test('today at 21:29 schedules 15 minutes later', () => assert.equal(calculateSchedule('2026-10-29', '2026-10-29T21:29:00+08:00').scheduledAt, '2026-10-29T13:44:00.000Z'));
test('past date before 21:15 schedules today 21:29', () => assert.equal(calculateSchedule('2026-10-28', '2026-10-29T21:14:00+08:00').scheduledAt, '2026-10-29T13:29:00.000Z'));
test('past date at 21:15 schedules 15 minutes later', () => assert.equal(calculateSchedule('2026-10-28', '2026-10-29T21:15:00+08:00').scheduledAt, '2026-10-29T13:30:00.000Z'));
test('future date schedules on that date at 21:29', () => assert.equal(calculateSchedule('2026-10-30', '2026-10-29T09:00:00+08:00').scheduledAt, '2026-10-30T13:29:00.000Z'));
test('date safety only accepts Shanghai execution date', () => { assert.equal(isReportDateSafe('2026-10-29', new Date('2026-10-29T14:00:00Z')), true); assert.equal(isReportDateSafe('2026-10-28', new Date('2026-10-29T14:00:00Z')), false); });
