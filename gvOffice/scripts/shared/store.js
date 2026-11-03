import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function dataDir() { return process.env.GV_OFFICE_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'gvOffice'); }
function configPath(workflow) { return workflow ? path.join(dataDir(), 'workflows', `${workflow}.json`) : path.join(dataDir(), 'config.json'); }

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, file);
}

export async function saveConfig(config, workflow) { await writeJsonAtomic(configPath(workflow), config); return config; }
export async function loadConfig(workflow) {
  try { return JSON.parse(await readFile(configPath(workflow), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
