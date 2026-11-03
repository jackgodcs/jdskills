#!/usr/bin/env node
import { dailyReport } from './workflows/daily-report/cli.js';
import { departmentWeeklyReport } from './workflows/department-weekly-report/cli.js';
import { personalWeeklyReport } from './workflows/personal-weekly-report/cli.js';

const [workflow = 'help', command = 'help', ...argv] = process.argv.slice(2);
function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

async function main() {
  if (workflow === 'help') return print({ workflows: { 'daily-report': ['gate', 'setup', 'defaults', 'template-select', 'verify', 'templates', 'template', 'schedule', 'config-set', 'receivers-set', 'receiver-add', 'receiver-remove', 'config-show', 'profiles', 'login', 'profile-switch'], 'department-weekly-report': ['gate', 'config-set', 'config-show', 'inspect', 'target-record'], 'personal-weekly-report': ['gate', 'setup', 'config-show', 'inspect'] } });
  if (workflow === 'daily-report') return dailyReport(command, argv);
  if (workflow === 'department-weekly-report') return departmentWeeklyReport(command, argv);
  if (workflow === 'personal-weekly-report') return personalWeeklyReport(command, argv);
  throw new Error(`未知工作流 ${workflow}`);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
