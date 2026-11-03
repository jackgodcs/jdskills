import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const DOWNLOAD_URL = 'https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases';

function run(file, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr.trim() || stdout.trim() || `dws 退出码 ${code}`)));
    child.stdin.end(input || '');
  });
}

export async function resolveDws() {
  const candidates = [process.env.DWS_PATH, 'dws'];
  if (process.platform === 'win32') candidates.push(path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links', 'dws.exe'));
  for (const candidate of candidates.filter(Boolean)) {
    try {
      if (path.isAbsolute(candidate)) await access(candidate);
      const { stdout, stderr } = await run(candidate, ['--version']);
      return { path: candidate, version: (stdout || stderr).trim() };
    } catch {}
  }
  const error = new Error(`未检测到可运行的 DingTalk Workspace CLI（DWS）。请从 ${DOWNLOAD_URL} 手动安装；安装后先在当前 Agent 会话重新执行以触发再次检测，仍无法发现时再完全重启 Agent。`);
  error.code = 'DWS_NOT_INSTALLED';
  throw error;
}

export async function callDws(args, input) {
  const dws = await resolveDws();
  const { stdout } = await run(dws.path, [...args, '--format', 'json'], input);
  try { return JSON.parse(stdout); } catch (error) { throw new Error(`DWS 返回非 JSON: ${error.message}`); }
}

export async function listProfiles() { return callDws(['profile', 'list']); }

export async function currentProfile() {
  const result = await listProfiles();
  const current = result.profiles?.filter(profile => profile.isOrgCurrent);
  if (current?.length !== 1) throw new Error(`尚未取得唯一有效的钉钉组织 Profile，实际为 ${current?.length || 0} 个。请完成 DWS 登录并选择组织。`);
  return current[0];
}

export async function dwsGate(expected) {
  const dws = await resolveDws();
  const profile = await currentProfile();
  const auth = await callDws(['auth', 'status', '--profile', profile.profile]);
  if (!auth.authenticated || !auth.token_valid) throw new Error(`DWS 已安装，但组织“${profile.corpName}”尚未取得有效登录状态。请完成 DWS 登录后再继续。`);
  if (expected?.dws?.profile && expected.dws.profile !== profile.profile) throw new Error(`当前 DWS 组织为“${profile.corpName}”，gvOffice 配置为“${expected.dws.corpName}”。请确认组织切换后再继续。`);
  return { ok: true, dws, profile: { profile: profile.profile, corpId: profile.corpId, corpName: profile.corpName, userId: profile.userId, userName: profile.userName }, auth: { authenticated: auth.authenticated, tokenValid: auth.token_valid } };
}

export async function login(intl = false) { const dws = await resolveDws(); return run(dws.path, ['auth', 'login', ...(intl ? ['--intl'] : [])]); }
export async function switchProfile(selector) { const dws = await resolveDws(); await run(dws.path, ['profile', 'switch', selector]); return currentProfile(); }
