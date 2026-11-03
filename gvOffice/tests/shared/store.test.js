import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, saveConfig } from '../../scripts/shared/store.js';

test('separates shared and workflow configuration', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gv-office-'));
  process.env.GV_OFFICE_DATA_DIR = dir;
  try {
    await saveConfig({ timeZone: 'Asia/Shanghai' });
    await saveConfig({ templateName: '日报' }, 'daily-report');
    assert.equal((await loadConfig()).timeZone, 'Asia/Shanghai');
    assert.equal((await loadConfig('daily-report')).templateName, '日报');
  } finally { delete process.env.GV_OFFICE_DATA_DIR; await rm(dir, { recursive: true, force: true }); }
});
