const ZONE = 'Asia/Shanghai';
const OFFSET = '+08:00';

export function shanghaiParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
}

export function shanghaiDate(date = new Date()) { const p = shanghaiParts(date); return `${p.year}-${p.month}-${p.day}`; }
function atShanghai(date, hour, minute) { return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${OFFSET}`); }

export function calculateSchedule(reportDate, confirmedAt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error('reportDate 必须为 YYYY-MM-DD');
  const confirmed = new Date(confirmedAt);
  if (Number.isNaN(confirmed.getTime())) throw new Error('confirmedAt 必须是有效且带时区的时间');
  const today = shanghaiDate(confirmed);
  let scheduled;
  let rule;
  if (reportDate > today) { scheduled = atShanghai(reportDate, 21, 29); rule = 'future-date-21:29'; }
  else if (reportDate < today) {
    const p = shanghaiParts(confirmed);
    const before2115 = Number(p.hour) * 60 + Number(p.minute) < 21 * 60 + 15;
    scheduled = before2115 ? atShanghai(today, 21, 29) : new Date(confirmed.getTime() + 15 * 60_000);
    rule = before2115 ? 'past-date-before-21:15' : 'past-date-confirmed-plus-15m';
  } else {
    const cutoff = atShanghai(today, 21, 29);
    scheduled = confirmed < cutoff ? cutoff : new Date(confirmed.getTime() + 15 * 60_000);
    rule = confirmed < cutoff ? 'today-before-21:29' : 'today-confirmed-plus-15m';
  }
  return { reportDate, confirmedAt: confirmed.toISOString(), scheduledAt: scheduled.toISOString(), timeZone: ZONE, rule };
}

export function resolveDelivery(policy, reportDate, confirmedAt, specifiedAt) {
  const confirmed = new Date(confirmedAt);
  if (Number.isNaN(confirmed.getTime())) throw new Error('confirmedAt 必须是有效且带时区的时间');
  if (policy === 'immediate') return { policy, reportDate, confirmedAt: confirmed.toISOString(), scheduledAt: confirmed.toISOString(), timeZone: ZONE, rule: 'confirmed-immediately' };
  if (policy === 'rule-based') return { policy, ...calculateSchedule(reportDate, confirmedAt) };
  if (policy !== 'specified') throw new Error(`未知发送策略 ${policy}`);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(specifiedAt || '')) throw new Error('specifiedAt 必须为 YYYY-MM-DD HH:mm（Asia/Shanghai）');
  const scheduled = new Date(`${specifiedAt.replace(' ', 'T')}:00${OFFSET}`);
  if (Number.isNaN(scheduled.getTime()) || scheduled <= confirmed) throw new Error('指定发送时间必须晚于确认时间');
  return { policy, reportDate, confirmedAt: confirmed.toISOString(), scheduledAt: scheduled.toISOString(), timeZone: ZONE, rule: 'user-specified' };
}

export function isReportDateSafe(reportDate, executionTime = new Date()) { return reportDate === shanghaiDate(executionTime); }
