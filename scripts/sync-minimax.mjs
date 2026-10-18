// 云端 OAuth 额度同步：用 refresh_token 换 access_token，拉取 Token Plan 额度，落成只读快照
import { writeFileSync, mkdirSync } from 'node:fs';

const CLIENT_ID = '659cf4c1-615c-45f6-a5f6-4bf15eb476e5';
const REGION = (process.env.REGION || 'cn').trim();
const RT = (process.env.RT || '').trim();

const ACCOUNT = REGION === 'global' ? 'https://account.minimax.io' : 'https://account.minimaxi.com';
const API = REGION === 'global' ? 'https://api.minimax.io' : 'https://api.minimaxi.com';

if (!RT) {
  console.error('缺少 MINIMAX_REFRESH_TOKEN');
  process.exit(1);
}

async function refreshToken() {
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

const token = await refreshToken();
const quota = await fetchQuota(token.access_token);

mkdirSync('data', { recursive: true });
writeFileSync(
  'data/minimax.json',
  JSON.stringify(
    {
      provider: 'minimax',
      mode: 'oauth',
      region: REGION,
      updated_at: new Date().toISOString(),
      token_expires_at: token.expires_at || null,
      model_remains: quota.model_remains || [],
      base_resp: quota.base_resp || null
    },
    null,
    2
  )
);
console.log('synced', (quota.model_remains || []).length, 'models');
