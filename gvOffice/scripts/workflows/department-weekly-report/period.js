const SUMMARY_SUFFIX = '工作总结';
const PLAN_SUFFIX = '工作计划';

function dateUtc(year, month, day) { return new Date(Date.UTC(year, month - 1, day)); }
function iso(date) { return date.toISOString().slice(0, 10); }
function sheetYear(title) { return Number(title.match(/(20\d{2})年/)?.[1]); }
function cellValue(cell) { return String(cell?.value ?? '').trim(); }

export function parseTargetDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`日期必须为 YYYY-MM-DD，实际为 ` + value);
  const date = new Date(`` + value + `T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || iso(date) !== value) throw new Error(`无效日期 ` + value);
  return date;
}

export function parsePeriod(header, title) {
  if (!header.endsWith(SUMMARY_SUFFIX)) return null;
  const match = header.match(/(\d{1,2})\.(\d{1,2})\s*[-~～]\s*(\d{1,2})\.(\d{1,2})/);
  const year = sheetYear(title);
  if (!match || !year) return null;
  const startMonth = Number(match[1]);
  const startDay = Number(match[2]);
  const endMonth = Number(match[3]);
  const endDay = Number(match[4]);
  const endYear = endMonth < startMonth ? year + 1 : year;
  const start = dateUtc(year, startMonth, startDay);
  const end = dateUtc(endYear, endMonth, endDay);
  if (start.getUTCMonth() !== startMonth - 1 || start.getUTCDate() !== startDay || end.getUTCMonth() !== endMonth - 1 || end.getUTCDate() !== endDay || end < start) return null;
  return { header, start: iso(start), end: iso(end) };
}

export function selectPeriod(sheets, targetDateValue) {
  const target = parseTargetDate(targetDateValue);
  const matches = [];
  for (const sheet of sheets) {
    const headers = sheet.cells?.[0] || [];
    headers.forEach((cell, index) => {
      const period = parsePeriod(cellValue(cell), sheet.title);
      if (!period) return;
      const start = parseTargetDate(period.start);
      const end = parseTargetDate(period.end);
      if (target < start || target > end) return;
      const planHeader = cellValue(headers[index + 1]);
      matches.push({ ...period, sheetId: sheet.sheetId, sheetTitle: sheet.title, summaryColumnIndex: index, planColumnIndex: index + 1, planHeader, planHeaderValid: planHeader.endsWith(PLAN_SUFFIX) });
    });
  }
  if (matches.length !== 1) throw new Error(matches.length ? `日期 ` + targetDateValue + ` 匹配到 ` + matches.length + ` 个工作总结周期` : `未找到包含 ` + targetDateValue + ` 的工作总结周期`);
  if (!matches[0].planHeaderValid) throw new Error(`“` + matches[0].header + `”右侧不是工作计划列`);
  return matches[0];
}

export function extractEntries(cells, period) {
  return cells.slice(1).map(row => ({ name: cellValue(row[0]).replace(/^@/, ''), summary: cellValue(row[period.summaryColumnIndex]), plan: cellValue(row[period.planColumnIndex]) })).filter(item => item.name);
}

function incomplete(value) { return /(?:^|[\r\n])\s*\d+[.、]\s*$/.test(value) || /^(?:待补充|TODO|TBD)$/i.test(value); }

export function findAnomalies(entries) {
  return entries.flatMap(entry => [
    ...(!entry.summary ? [{ person: entry.name, field: '本周工作总结', reason: '内容为空' }] : incomplete(entry.summary) ? [{ person: entry.name, field: '本周工作总结', reason: '内容明显未完成' }] : []),
    ...(!entry.plan ? [{ person: entry.name, field: '下周工作计划', reason: '内容为空' }] : incomplete(entry.plan) ? [{ person: entry.name, field: '下周工作计划', reason: '内容明显未完成' }] : [])
  ]);
}

export function reportTitle(period) { return `地图产品线周例会` + period.end.replaceAll('-', ''); }
