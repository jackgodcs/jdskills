import { createHash } from 'node:crypto';
import { parsePeriod, parseTargetDate } from '../department-weekly-report/period.js';

function iso(date) { return date.toISOString().slice(0, 10); }
function utc(value) { return parseTargetDate(value); }
function addDays(value, days) { const date = utc(value); date.setUTCDate(date.getUTCDate() + days); return iso(date); }
function monday(value) { const date = utc(value); const day = date.getUTCDay() || 7; return addDays(value, 1 - day); }
function label(value) { const date = utc(value); return (date.getUTCMonth() + 1) + '.' + date.getUTCDate(); }
function text(cell) { return String(cell?.value ?? '').trim(); }

export function defaultPeriod(targetDate) {
  const start = monday(targetDate);
  const end = addDays(start, 6);
  const planStart = addDays(end, 1);
  const planEnd = addDays(planStart, 6);
  return { start, end, header: label(start) + '-' + label(end) + '工作总结', planStart, planEnd, planHeader: label(planStart) + '-' + label(planEnd) + '工作计划' };
}

export function resolvePeriod(sheets, targetDate) {
  const target = utc(targetDate);
  const matches = [];
  for (const sheet of sheets) (sheet.cells?.[0] || []).forEach((cell, index) => {
    const period = parsePeriod(text(cell), sheet.title);
    if (period && target >= utc(period.start) && target <= utc(period.end)) {
      const planHeaderActual = text(sheet.cells[0][index + 1]);
      const planMatch = planHeaderActual.match(/(\d{1,2})\.(\d{1,2})\s*[-~～]\s*(\d{1,2})\.(\d{1,2})工作计划$/);
      matches.push({ ...period, planStart: planMatch ? period.end.slice(0, 4) + '-' + String(planMatch[1]).padStart(2, '0') + '-' + String(planMatch[2]).padStart(2, '0') : addDays(period.end, 1), planEnd: planMatch ? period.end.slice(0, 4) + '-' + String(planMatch[3]).padStart(2, '0') + '-' + String(planMatch[4]).padStart(2, '0') : addDays(period.end, 7), planHeader: planMatch ? planHeaderActual : label(addDays(period.end, 1)) + '-' + label(addDays(period.end, 7)) + '工作计划', sheetId: sheet.sheetId, sheetTitle: sheet.title, summaryColumnIndex: index, planColumnIndex: index + 1, planHeaderActual });
    }
  });
  if (matches.length > 1) throw new Error('目标日期匹配到多个工作总结周期，不能自动选择');
  return matches[0] || defaultPeriod(targetDate);
}

export function monthTitle(period) { const date = utc(period.start); return date.getUTCFullYear() + '年' + (date.getUTCMonth() + 1) + '月'; }

export function requiredWorkdays(period, executionDate) {
  const stop = utc(executionDate) < utc(period.end) ? executionDate : period.end;
  const result = [];
  for (let value = period.start; utc(value) <= utc(stop); value = addDays(value, 1)) {
    const day = utc(value).getUTCDay();
    if (day >= 1 && day <= 5) result.push(value);
  }
  return result;
}

export function reportFields(detail) {
  const fields = detail.result?.report_content || detail.data?.report?.fields || [];
  return Object.fromEntries(fields.map(field => [field.key, String(field.value ?? '').trim()]));
}

export function filterReports(details, period, templateName) {
  const seen = new Set();
  return details.flatMap(detail => {
    const result = detail.result || detail.data?.report || {};
    const reportId = result.report_Id || result.reportId;
    const actualTemplate = result.report_template_name || result.templateName;
    const fields = reportFields(detail);
    if (!reportId || seen.has(reportId) || actualTemplate !== templateName || !fields['日期'] || fields['日期'] < period.start || fields['日期'] > period.end) return [];
    seen.add(reportId);
    return [{ reportId, date: fields['日期'], completed: fields['今日完成工作'] || '', upcoming: fields['近期需完成工作'] || '', coordination: fields['需协调工作'] || '', url: result.url || null }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.reportId.localeCompare(b.reportId));
}

export function missingDates(reports, period, executionDate) {
  const present = new Set(reports.filter(report => report.completed).map(report => report.date));
  return requiredWorkdays(period, executionDate).filter(date => !present.has(date));
}

export function locatePerson(cells, userName) {
  const matches = cells.slice(1).map((row, index) => ({ rowIndex: index + 1, value: text(row[0]), cell: row[0] })).filter(item => item.value.replace(/^@/, '') === userName);
  if (matches.length > 1) throw new Error('工作表中存在多个“' + userName + '”行，不能自动选择');
  return matches[0] || null;
}

export function structurePlan(sheets, period, userName) {
  const title = monthTitle(period);
  const sheet = sheets.find(item => item.title === title);
  if (!sheet) return { action: 'initialize-sheet', sheetTitle: title, referenceSheetTitle: sheets.filter(item => /^20\d{2}年\d{1,2}月$/.test(item.title)).at(-1)?.title || '2026年10月', summaryHeader: period.header, planHeader: period.planHeader, personAction: 'reuse-copied-roster' };
  const headers = sheet.cells?.[0] || [];
  const summaryColumns = headers.map((cell, index) => ({ index, value: text(cell) })).filter(item => item.value === period.header);
  const planColumns = headers.map((cell, index) => ({ index, value: text(cell) })).filter(item => item.value === period.planHeader);
  if (summaryColumns.length > 1 || planColumns.length > 1) throw new Error('目标工作表存在重复周期列，不能自动修改');
  const person = locatePerson(sheet.cells || [], userName);
  return { action: 'use-sheet', sheetTitle: title, sheetId: sheet.sheetId, summary: summaryColumns[0] || { action: 'insert-by-date', header: period.header }, plan: planColumns[0] || { action: 'insert-after-summary', header: period.planHeader }, person: person || { action: 'append-person', name: userName }, currentSummary: person && summaryColumns[0] ? text(sheet.cells[person.rowIndex]?.[summaryColumns[0].index]) : '', currentPlan: person && planColumns[0] ? text(sheet.cells[person.rowIndex]?.[planColumns[0].index]) : '' };
}

export function previewDigest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export function monthWindows(period) {
  const months = new Set([period.start.slice(0, 7), period.end.slice(0, 7)]);
  return [...months].flatMap(month => {
    const [year, number] = month.split('-').map(Number);
    const start = iso(new Date(Date.UTC(year, number - 1, 1)));
    const end = iso(new Date(Date.UTC(year, number, 1)));
    const middle = addDays(start, 19);
    return utc(middle) < utc(end) ? [{ start, end: addDays(middle, 1) }, { start: addDays(middle, 1), end }] : [{ start, end }];
  });
}
