#!/usr/bin/env node
/**
 * 同步「本机助手运行时」快照 → data/runtime.json
 * 面板的手机端只读这份静态 JSON，不接触任何密钥。
 *
 * 数据来源（全部只读）：
 *   openclaw config get agents.defaults.model   → 默认/兜底模型
 *   openclaw status                             → 实时生效模型 + 上下文窗口
 *   /var/log/openclaw/current                   → 最近一次模型配置热加载时间
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'data', 'runtime.json');

const run = (cmd) => {
  try {
    return execFileSync('/bin/sh', ['-lc', cmd], {
      encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return ''; }
};

const snap = {
  updated_at: new Date().toISOString(),
  agent: 'main',
  provider: 'stepos',
  model: '',
  context_window: 0,
  fallback: '',
  loaded_at: null,
  plan: { name: 'STEPX Token Plan', monthly_tokens: 10_000_000_000, period: 'month' },
  usage: { available: false, reason: '平台未开放接口，需登录 task.stepos.com/mytask 查看' },
};

const rawCfg = run('openclaw config get agents.defaults.model');
if (rawCfg) {
  try {
    const j = JSON.parse(rawCfg);
    snap.model = String(j.primary || '').replace(/^stepos\//, '');
    snap.fallback = (j.fallbacks || []).map((f) => String(f).replace(/^stepos\//, '')).join(' / ');
  } catch { /* 配置读不到就留空，面板会显示未知 */ }
}

const status = run('openclaw status');
const m = status.match(/default\s+([A-Za-z0-9._-]+)\s*\((\d+)k ctx\)/i);
if (m) {
  snap.model = m[1];                       // 以运行时生效值为准
  snap.context_window = Number(m[2]) * 1000;
}

const reload = run("grep -h 'config hot reload applied (agents.defaults.model' /var/log/openclaw/current 2>/dev/null | tail -1");
if (reload) snap.loaded_at = reload.split('  ')[0].trim().slice(0, 19);

mkdirSync(join(HERE, 'data'), { recursive: true });
writeFileSync(OUT, JSON.stringify(snap, null, 2) + '\n');
console.log('wrote', OUT);
console.log(JSON.stringify(snap, null, 2));
