// 云端 OAuth 额度同步：用 refresh_token 换 access_token，拉取 Token Plan 额度，落成只读快照
import { writeFileSync, mkdirSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MMX_CFG = join(homedir(), '.mmx', 'config.json');

/** refresh token 会轮换：每次刷新后必须把新的写回，否则旧令牌失效、CLI 也会被踢下线 */
function persistRotated(token) {
  if (!token) return;
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(MMX_CFG, 'utf8')); } catch { cfg = {}; }
  cfg.oauth = cfg.oauth || {};
  cfg.oauth.access_token = token.access_token;
  if (token.refresh_token) cfg.oauth.refresh_token = token.refresh_token;
  if (token.expires_at) cfg.oauth.expires_at = token.expires_at;
  cfg.oauth.region = REGION;
  cfg.oauth.resource_url = API;
  writeFileSync(MMX_CFG, JSON.stringify(cfg, null, 2));
  try { chmodSync(MMX_CFG, 0o600); } catch {}
}

const CLIENT_ID = '659cf4c1-615c-45f6-a5f6-4bf15eb476e5';
const REGION = (process.env.REGION || 'cn').trim();
const RT = (process.env.RT || '').trim();

const ACCOUNT = REGION === 'global' ? 'https://account.minimax.io' : 'https://account.minimaxi.com';
const API = REGION === 'global' ? 'https://api.minimax.io' : 'https://api.minimaxi.com';

async function refreshToken() {
  if (!RT) {
    console.error('缺少 refresh token（配置里也没有可用的 access token）');
    process.exit(1);
  }
  const res = await fetch(`${ACCOUNT}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: RT,
      client_id: CLIENT_ID
    })
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('refresh failed', res.status, text.slice(0, 300));
    process.exit(2);
  }
  const d = JSON.parse(text);
  if (!d.access_token) {
    console.error('no access_token', text.slice(0, 200));
    process.exit(2);
  }
  return d;
}

async function fetchBalance(accessToken) {
  try {
    const res = await fetch(`${API}/account/query_balance`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.base_resp && d.base_resp.status_code === 0 ? d : null;
  } catch {
    return null;
  }
}

async function fetchQuota(accessToken) {
  const res = await fetch(`${API}/v1/token_plan/remains`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('quota failed', res.status, text.slice(0, 300));
    process.exit(2);
  }
  return JSON.parse(text);
}

// 优先用本地最新凭据；过期前也可直接用 access_token
let token = null;
let accessToken = null;
try {
  const cfg = JSON.parse(readFileSync(MMX_CFG, 'utf8'));
  const o = cfg.oauth || {};
  const exp = o.expires_at ? new Date(o.expires_at).getTime() : 0;
  if (o.access_token && exp - Date.now() > 5 * 60 * 1000) accessToken = o.access_token;
} catch {}

if (!accessToken) {
  token = await refreshToken();
  persistRotated(token);          // 关键：回写轮换后的 refresh token
  accessToken = token.access_token;
}
if (token && token.refresh_token && token.refresh_token !== RT) {
  console.log('refresh token rotated & persisted');
}

const quota = await fetchQuota(accessToken);
const balance = await fetchBalance(accessToken);

mkdirSync('data', { recursive: true });
writeFileSync(
  'data/minimax.json',
  JSON.stringify(
    {
      provider: 'minimax',
      mode: 'oauth',
      region: REGION,
      updated_at: new Date().toISOString(),
      token_expires_at: (() => {
        try { return JSON.parse(readFileSync(MMX_CFG, 'utf8')).oauth.expires_at || null; } catch { return null; }
      })(),
      model_remains: quota.model_remains || [],
      balance: balance
        ? {
            available_amount: Number(balance.available_amount || 0),
            cash_balance: Number(balance.cash_balance || 0),
            voucher_balance: Number(balance.voucher_balance || 0),
            credit_balance: Number(balance.credit_balance || 0),
            currency: 'CNY'
          }
        : null,
      base_resp: quota.base_resp || null
    },
    null,
    2
  )
);
console.log('synced', (quota.model_remains || []).length, 'models');
