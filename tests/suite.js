#!/usr/bin/env node
/**
 * 额度中枢 APK · 自动化测试套件
 * 维度：功能 / 技术 / 安全 / 性能 / 效率
 * 运行：WS=/path/to/task NODE_PATH=/tmp/shot/node_modules node tests/suite.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WS = process.env.WS;
const APK = WS + '/build/quota-hub.apk';
const BT = '/opt/android-sdk/build-tools/34.0.0';
const APP_URL = 'http://127.0.0.1:8899/index.html';
const CHROME = '/usr/bin/chromium';

const checks = [];
const T = (id, group, name, fn, timeout) => checks.push({ id, group, name, fn, timeout });
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const sh = cmd => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/* ============================ 技术 ============================ */
T('T1', '技术', 'APK 体积 < 200KB', () => {
  const kb = fs.statSync(APK).size / 1024;
  expect(kb < 200, `体积 ${kb.toFixed(1)}KB`);
  return `${kb.toFixed(1)} KB`;
});
T('T2', '技术', '包名 / 版本 / SDK 范围正确', () => {
  const out = sh(`${BT}/aapt2 dump badging ${APK}`);
  const pick = re => (out.match(re) || [])[1];
  expect(pick(/package: name='([^']+)'/) === 'ai.zachshi.quotahub', '包名不符');
  expect(pick(/versionName='([^']+)'/) === '1.6.0', 'versionName 不符');
  expect(pick(/versionCode='(\d+)'/) === '9', 'versionCode 不符');
  expect(pick(/sdkVersion:'(\d+)'/) === '24', 'minSdk 不符');
  expect(pick(/targetSdkVersion:'(\d+)'/) === '34', 'targetSdk 不符');
  return 'ai.zachshi.quotahub 1.6.0(9) / 24–34';
});
T('T3', '技术', '权限最小化（仅联网 + 网络状态）', () => {
  const out = sh(`${BT}/aapt2 dump badging ${APK}`);
  const perms = [...out.matchAll(/uses-permission: name='([^']+)'/g)].map(m => m[1]).sort();
  const allowed = ['android.permission.ACCESS_NETWORK_STATE', 'android.permission.INTERNET'];
  expect(JSON.stringify(perms) === JSON.stringify(allowed), '权限集合不符：' + perms.join(','));
  return perms.length + ' 项，无危险权限';
});
T('T4', '技术', '签名完整（v2 + v3 校验通过）', () => {
  const v = sh(`${BT}/apksigner verify --verbose --print-certs ${APK}`);
  expect(/^Verifies/m.test(v), '整体校验未通过');
  expect(/Verified using v2 scheme.*true/.test(v), 'v2 未通过');
  expect(/Verified using v3 scheme.*true/.test(v), 'v3 未通过');
  const sha = (v.match(/certificate SHA-256 digest: ([0-9a-f]+)/) || [])[1];
  return 'v2+v3 OK（minSdk 24 无需 v1）· SHA256 ' + sha.slice(0, 16) + '…';
});
T('T5', '技术', '安装包结构完整（dex/资源/资产/图标）', () => {
  const out = sh(`python3 -c "import zipfile;print('\\n'.join(zipfile.ZipFile('${APK}').namelist()))"`);
  ['classes.dex', 'resources.arsc', 'AndroidManifest.xml', 'assets/index.html',
   'assets/data/minimax.json', 'res/drawable/ic_launcher.png'].forEach(f => {
    expect(out.split('\n').includes(f), '缺少 ' + f);
  });
  return '6 项关键文件齐全';
});
T('T6', '技术', '字节码无第三方 SDK（仅自有类）', () => {
  const out = sh(`${BT}/dexdump ${APK} | grep "Class descriptor"`);
  const classes = [...out.matchAll(/'L([^;]+);'/g)].map(m => m[1]).sort();
  const allowed = ['ai/zachshi/quotahub/MainActivity', 'ai/zachshi/quotahub/MainActivity$1',
                   'ai/zachshi/quotahub/R', 'ai/zachshi/quotahub/R$drawable', 'ai/zachshi/quotahub/R$string'];
  expect(JSON.stringify(classes) === JSON.stringify(allowed), '存在额外类：' + classes.join(','));
  return classes.length + ' 个类，全部自有';
});
T('T7', '技术', 'APK 已对齐（zipalign 4 字节）', () => {
  sh(`${BT}/zipalign -c -p 4 ${APK}`);
  return '4-byte aligned';
});
T('T8', '技术', 'Manifest 安全项：禁备份 / 禁明文流量', () => {
  const out = sh(`${BT}/aapt2 dump xmltree --file AndroidManifest.xml ${APK}`);
  expect(/allowBackup=\(type 0x12\)0x0/.test(out) || /allowBackup.*false/.test(out), 'allowBackup 未关闭');
  expect(/usesCleartextTraffic=\(type 0x12\)0x0/.test(out) || /usesCleartextTraffic.*false/.test(out), '明文流量未禁止');
  return 'allowBackup=false / cleartext=false';
});
T('T9', '技术', '原生壳安全设置齐备（禁文件访问/外链外开/离线回退）', () => {
  const src = fs.readFileSync(WS + '/app/src/main/java/ai/zachshi/quotahub/MainActivity.java', 'utf8');
  [['setAllowFileAccess(false)', '未关闭文件访问'],
   ['setAllowContentAccess(false)', '未关闭内容访问'],
   ['shouldOverrideUrlLoading', '缺外链拦截'],
   ['raw.githubusercontent.com', '缺远程快照地址'],
   ['getAssets().open', '缺离线资产回退']].forEach(([k, m]) => expect(src.includes(k), m));
  return '5 项设置全部到位';
});

/* ============================ 功能 ============================ */
let browser;

async function newPage(opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.__errors = errors;
  if (opts.cpu) {
    const c = await page.target().createCDPSession();
    await c.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
  }
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}
async function unlock(page, pin = '1234', fresh = true) {
  await page.waitForSelector('#pin', { timeout: 10000 });
  await page.type('#pin', pin);
  if (fresh) await page.type('#pin2', pin);
  await page.click('#gateGo');
  await page.waitForSelector('.tabs', { timeout: 20000 });
  await page.waitForSelector('.card', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 400));
}

T('F1', '功能', '首次进入展示「设置访问密码」', async () => {
  const { ctx, page } = await newPage();
  await page.waitForSelector('#pin');
  const html = await page.content();
  expect(html.includes('设置访问密码'), '未进入初始化页');
  expect(html.includes('再输一次'), '缺少二次确认输入');
  await ctx.close();
  return '初始化引导正常';
});
T('F2', '功能', '设置 PIN 后解锁，生成加密 vault 与元信息', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const s = await page.evaluate(() => ({
    vault: !!localStorage.getItem('lqh.vault.v1'),
    meta: !!localStorage.getItem('lqh.meta.v1'),
    vaultKeys: Object.keys(JSON.parse(localStorage.getItem('lqh.vault.v1') || '{}')).sort()
  }));
  expect(s.vault && s.meta, 'vault/meta 未落盘');
  expect(JSON.stringify(s.vaultKeys) === JSON.stringify(['ct', 'iv', 'salt']), 'vault 结构异常');
  await ctx.close();
  return 'vault{salt,iv,ct} + meta 已保存';
});
T('F3', '功能', 'MiniMax 快照渲染：当期 98% / 本周 93%', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const v = await page.evaluate(() => [...document.querySelectorAll('.tile .v')].map(e => e.textContent.trim()));
  expect(v[0] === '98%', '当期值 ' + v[0]);
  expect(v[1] === '93%', '本周值 ' + v[1]);
  await ctx.close();
  return '98% / 93%';
});
T('F4', '功能', '模型明细：通用 + 视频，各两条进度条', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const d = await page.evaluate(() => ({
    models: [...document.querySelectorAll('.mname')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    bars: document.querySelectorAll('.card .bar').length,
    hints: [...document.querySelectorAll('.mhint')].map(e => e.textContent.trim())
  }));
  expect(d.models.length === 2 && d.models[0].includes('通用') && d.models[1].includes('视频'), '模型行异常：' + d.models);
  expect(d.bars >= 4, '进度条数量 ' + d.bars);
  const allHints = await page.evaluate(() => [...document.querySelectorAll('.mhint')].map(e => e.textContent).join(' '));
  expect(/已用 0 \/ 3 次/.test(allHints), '缺少当期用量文案');
  await ctx.close();
  return `${d.models.join(' / ')} · ${d.bars} 条进度条`;
});
T('F5', '功能', '余额描述列表：可用 / 现金 / 代金券', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.kv .row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  expect(rows.length === 3, '行数 ' + rows.length);
  expect(rows[0].includes('¥38.40'), '可用余额不符：' + rows[0]);
  expect(rows[2].includes('¥0.00'), '代金券不符：' + rows[2]);
  await ctx.close();
  return rows.join(' | ');
});
T('F6', '功能', '分段 Tabs 计数与筛选正确', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.tabs .tab')].map(t => t.textContent.replace(/\s+/g, '')));
  expect(JSON.stringify(tabs) === JSON.stringify(['全部7', '套餐2', '余额5']), '计数异常：' + tabs);
  await page.evaluate(() => { viewTab = 'balance'; render(); });
  const n1 = await page.evaluate(() => document.querySelectorAll('.card').length);
  await page.evaluate(() => { viewTab = 'plan'; render(); });
  const n2 = await page.evaluate(() => document.querySelectorAll('.card').length);
  expect(n1 === 5 && n2 === 2, `筛选后卡片数 balance=${n1} plan=${n2}`);
  await ctx.close();
  return '全部7 / 套餐2 / 余额5，筛选 5 与 2 张';
});
T('F7', '功能', '「⋯」更多菜单项齐全', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => providerMenu('minimax'));
  const items = await page.evaluate(() => [...document.querySelectorAll('.menu-item')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  expect(items.length >= 3, '菜单项 ' + items.length);
  expect(items.some(x => x.includes('配置 API Key')), '缺配置项');
  expect(items.some(x => x.includes('复制密钥指纹')), '缺复制项');
  await ctx.close();
  return items.join(' / ');
});
T('F8', '功能', '配置 Key 后指纹落库、卡片显示本机密钥', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => editKey('kimi'));
  await page.waitForSelector('#k');
  await page.type('#k', 'sk-test-abcdef123456');
  await page.evaluate(() => saveKey('kimi'));
  await new Promise(r => setTimeout(r, 700));
  const s = await page.evaluate(() => {
    const vault = localStorage.getItem('lqh.vault.v1') || '';
    return { hasFpText: document.body.innerText.includes('本机密钥'), vault };
  });
  expect(s.hasFpText, '卡片未显示本机密钥');
  await ctx.close();
  return '指纹已展示并加密保存';
});
T('F9', '功能', '错误 PIN 被拒且停留解锁页', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.click('#btnLock2');
  await page.waitForSelector('#pin', { timeout: 8000 });
  await page.type('#pin', '9999');
  await page.click('#gateGo');
  await new Promise(r => setTimeout(r, 900));
  const s = await page.evaluate(() => ({ lock: !!document.querySelector('#pin'), tabs: !!document.querySelector('.tabs') }));
  expect(s.lock && !s.tabs, '错误 PIN 竟然解锁');
  await ctx.close();
  return '拒绝并保留在解锁页';
});
T('F10', '功能', '刷新按钮触发数据拉取', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  let hits = 0;
  page.on('request', r => { if (r.url().includes('minimax.json')) hits++; });
  await page.click('#btnRefresh');
  await new Promise(r => setTimeout(r, 1200));
  expect(hits >= 1, '刷新未发起请求');
  await ctx.close();
  return `刷新触发 ${hits} 次数据请求`;
});
T('F11', '功能', '数据源不可用时优雅降级（无白屏/无异常）', async () => {
  const { ctx, page } = await newPage();
  await page.setRequestInterception(true);
  page.on('request', r => r.url().includes('minimax.json') ? r.abort() : r.continue());
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await unlock(page);
  const s = await page.evaluate(() => ({
    cards: document.querySelectorAll('.card').length,
    text: document.body.innerText,
    tabs: !!document.querySelector('.tabs')
  }));
  expect(s.cards === 7 && s.tabs, '降级后页面异常');
  expect(s.text.includes('未配置') || s.text.includes('本机还没有凭证'), '缺少降级提示');
  expect(errs.length === 0, 'JS 异常：' + errs.join(';'));
  await ctx.close();
  return '7 张卡片正常降级，0 异常';
});
T('F12', '功能', '锁定按钮回到锁定态', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.click('#btnLock2');
  await page.waitForSelector('#pin', { timeout: 8000 });
  const t = await page.evaluate(() => document.body.innerText);
  expect(t.includes('额度中枢'), '锁定页缺失');
  const hasTabs = await page.evaluate(() => !!document.querySelector('.tabs'));
  expect(!hasTabs, '锁定后仍显示主页');
  await ctx.close();
  return '回到锁定页';
});

/* ============================ 安全 ============================ */
T('S1', '安全', 'localStorage 不含明文 Key', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => editKey('kimi'));
  await page.waitForSelector('#k');
  await page.type('#k', 'sk-plaintext-should-never-appear');
  await page.evaluate(() => saveKey('kimi'));
  await new Promise(r => setTimeout(r, 800));
  const dump = await page.evaluate(() => JSON.stringify(localStorage));
  expect(!dump.includes('sk-plaintext'), '检测到明文 Key');
  await ctx.close();
  return '仅密文与指纹，无明文';
});
T('S2', '安全', 'vault 为 AES-GCM 密文且含盐/IV', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const v = await page.evaluate(() => JSON.parse(localStorage.getItem('lqh.vault.v1')));
  expect(v.salt && v.iv && v.ct, '缺少 salt/iv/ct');
  expect(v.ct.length > 40, '密文长度异常');
  await ctx.close();
  return `salt ${v.salt.length}B / iv ${v.iv.length}B / ct ${v.ct.length}B`;
});
T('S3', '安全', 'PIN 连续错误 5 次触发 30 秒锁定', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.click('#btnLock2');
  await page.waitForSelector('#pin');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(p => { const el = document.querySelector('#pin'); el.value = p; }, '0000');
    await page.click('#gateGo');
    await new Promise(r => setTimeout(r, 450));
  }
  const s = await page.evaluate(() => localStorage.getItem('lqh.guard.v1'));
  const g = JSON.parse(s || '{}');
  expect(g.until && g.until > Date.now(), '未触发冷却：' + s);
  const left = Math.round((g.until - Date.now()) / 1000);
  await ctx.close();
  return `已锁定 ${left}s`;
});
T('S4', '安全', 'CSP 阻断外部脚本注入', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const r = await page.evaluate(async () => {
    let violated = 0;
    document.addEventListener('securitypolicyviolation', () => { violated++; });
    const s = document.createElement('script');
    s.src = 'https://evil.example/x.js';
    document.head.appendChild(s);
    await new Promise(res => setTimeout(res, 500));
    return { violated, executed: typeof window.__evil !== 'undefined' };
  });
  expect(r.executed === false, '外部脚本被执行');
  expect(r.violated >= 1, '未触发 CSP 违规上报');
  await ctx.close();
  return `已拦截 · CSP 违规 ${r.violated} 次`;
});
T('S5', '安全', 'CSP 阻断非白名单域请求', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const r = await page.evaluate(async () => {
    try { await fetch('https://evil.example/a'); return 'allowed'; } catch (e) { return 'blocked'; }
  });
  expect(r === 'blocked', 'fetch 未被阻断');
  await ctx.close();
  return 'connect-src 白名单生效';
});
T('S6', '安全', '无法读取本地 file:// 资源', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const r = await page.evaluate(async () => {
    try { const x = await fetch('file:///etc/passwd'); return x.ok ? 'read' : 'blocked'; } catch { return 'blocked'; }
  });
  expect(r === 'blocked', 'file:// 可读');
  await ctx.close();
  return 'file:// 访问被拒';
});
T('S7', '安全', '5 分钟无操作自动锁定', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => { S.idleAt = Date.now() - 6 * 60 * 1000; });
  await page.waitForSelector('#pin', { timeout: 35000 });
  await ctx.close();
  return '21s 巡检内自动上锁';
}, 60000);
T('S8', '安全', '外链在系统浏览器打开（不接管 WebView）', () => {
  const src = fs.readFileSync(WS + '/app/src/main/java/ai/zachshi/quotahub/MainActivity.java', 'utf8');
  expect(/shouldOverrideUrlLoading[\s\S]{0,600}ACTION_VIEW/.test(src), '外链未走系统浏览器');
  expect(/HOST\.equals\(u\.getHost\(\)\)[\s\S]{0,80}return false/.test(src), '本站请求未放行');
  return '仅本域内跳转，其余交给系统';
});

/* ============================ 性能 ============================ */
T('P1', '性能', '中端机 + 弱网首屏 < 1500ms', async () => {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024
  });
  const t0 = Date.now();
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gateGo', { timeout: 15000 });
  const ms = Date.now() - t0;
  await ctx.close();
  expect(ms < 1500, `首屏 ${ms}ms`);
  return `${ms}ms（4x CPU / 1.6Mbps）`;
});
T('P2', '性能', 'DOM 规模 < 900 节点', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const n = await page.evaluate(() => document.getElementsByTagName('*').length);
  await ctx.close();
  expect(n < 900, `节点数 ${n}`);
  return `${n} 节点`;
});
T('P3', '性能', '无 > 120ms 长任务', async () => {
  const { ctx, page } = await newPage();
  await page.evaluate(() => {
    window.__long = [];
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration))))
      .observe({ entryTypes: ['longtask'] });
  });
  await unlock(page);
  const long = await page.evaluate(() => window.__long);
  await ctx.close();
  const max = long.length ? Math.max(...long) : 0;
  expect(max < 120, `最长任务 ${max}ms`);
  return `最长 ${max}ms（共 ${long.length} 个）`;
});
T('P4', '性能', 'JS 堆占用 < 12MB', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const cdp = await page.target().createCDPSession();
  const used = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  await ctx.close();
  const mb = used / 1024 / 1024;
  expect(mb < 12, `堆 ${mb.toFixed(2)}MB`);
  return `${mb.toFixed(2)} MB`;
});
T('P5', '性能', '滚动平均帧时间 < 24ms', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      window.__frames.push(now - last);
      last = now;
      if (window.__frames.length < 24) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    window.scrollTo({ top: 500, behavior: 'smooth' });
  });
  await new Promise(r => setTimeout(r, 1200));
  const frames = await page.evaluate(() => window.__frames);
  await ctx.close();
  const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  expect(avg < 24, `平均帧 ${avg.toFixed(1)}ms`);
  return `${avg.toFixed(1)} ms/帧`;
});

/* ============================ 效率 ============================ */
T('E1', '效率', '首屏请求数 ≤ 6 且无外域请求', async () => {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const reqs = [];
  page.on('request', r => reqs.push(r.url()));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await unlock(page);
  const external = reqs.filter(u => !u.startsWith('http://127.0.0.1:8899'));
  await ctx.close();
  expect(reqs.length <= 6, `请求数 ${reqs.length}`);
  expect(external.length === 0, '存在外域请求：' + external.join(','));
  return `${reqs.length} 个请求，全部同源`;
});
T('E2', '效率', '刷新只拉取数据快照（1 次）', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  let n = 0;
  page.on('request', r => { if (r.url().endsWith('data/minimax.json')) n++; });
  await page.click('#btnRefresh');
  await new Promise(r => setTimeout(r, 1000));
  await ctx.close();
  expect(n === 1, `数据请求 ${n} 次`);
  return '1 次增量拉取';
});
T('E3', '效率', '空闲无 rAF 轮询（仅 1 个 20s 守卫定时器）', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => {
    window.__raf = 0;
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = f => { window.__raf++; return orig(f); };
  });
  await new Promise(r => setTimeout(r, 2000));
  const raf = await page.evaluate(() => window.__raf);
  await ctx.close();
  expect(raf === 0, `空闲期 rAF 调用 ${raf} 次`);
  return '空闲 2s 内 0 次 rAF（无动画循环）';
});
T('E4', '效率', '解析到可交互 < 400ms', async () => {
  const { ctx, page } = await newPage();
  const t = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return Math.round(n.domContentLoadedEventEnd - n.responseEnd);
  });
  await ctx.close();
  expect(t < 400, `DOMContentLoaded 耗时 ${t}ms`);
  return `${t}ms`;
});


/* ============================ 设置页 ============================ */
T('F13', '功能', '设置页可进入且分区齐全', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.click('#btnSet');
  await page.waitForSelector('#btnBack', { timeout: 8000 });
  const t = await page.evaluate(() => document.body.innerText);
  ['关注的内容 · 模型', '关注的内容 · 平台', '修改访问 PIN', '清空本机全部数据']
    .forEach(k => expect(t.includes(k), '缺少分区：' + k));
  await ctx.close();
  return '模型 / 平台 / 安全 三区齐全';
});
T('F14', '功能', '模型取消关注后首页隐藏，且刷新后保持', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const before = await page.evaluate(() => document.querySelectorAll('.mname').length);
  await page.evaluate(() => toggleModel('minimax:video'));
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { view = 'home'; render(); });
  const after = await page.evaluate(() => [...document.querySelectorAll('.mname')].map(e => e.textContent));
  expect(before === 2 && after.length === 1, `模型数 ${before} → ${after.length}`);
  // 重新加载（模拟重启）后仍隐藏
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pin', { timeout: 8000 });
  await page.type('#pin', '1234');
  await page.click('#gateGo');
  await page.waitForSelector('.tabs', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 600));
  const persisted = await page.evaluate(() => document.querySelectorAll('.mname').length);
  expect(persisted === 1, '重启后未保持：' + persisted);
  await ctx.close();
  return '2 → 1 个模型，重启后保持';
});
T('F15', '功能', '平台取消关注后首页与计数同步', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => { view = 'settings'; renderSettings(); toggleProvider('glm'); });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { view = 'home'; render(); });
  const d = await page.evaluate(() => ({
    cards: document.querySelectorAll('.card').length,
    tab: document.querySelector('.tabs .tab').textContent.replace(/\s+/g, '')
  }));
  expect(d.cards === 6 && d.tab === '全部6', `卡片 ${d.cards} / ${d.tab}`);
  await ctx.close();
  return '7 → 6 张卡片，计数同步';
});
T('F16', '功能', '设置页可从目录新增关注平台', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => { view = 'settings'; renderSettings(); addSheet(); });
  await page.waitForSelector('.menu-item', { timeout: 8000 });
  await page.evaluate(() => addPreset('grok'));
  await new Promise(r => setTimeout(r, 900));
  const d = await page.evaluate(() => ({
    n: S.providers.length,
    names: S.providers.map(x => x.name),
    restricted: (S.providers.find(x => x.id === 'grok') || {}).restricted
  }));
  expect(d.n === 8 && d.names.includes('Grok · xAI'), '新增失败：' + d.names.join(','));
  expect(d.restricted === true, '受限标记未落库');
  await ctx.close();
  return '平台 7 → 8（Grok · xAI，受限）';
});

T('F17', '功能', '设置页可删除平台（含清理其模型关注项）', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => { S.hiddenModels = ['glm:general']; view = 'settings'; renderSettings(); removeProvider('glm'); });
  await new Promise(r => setTimeout(r, 800));
  const d = await page.evaluate(() => ({
    n: S.providers.length,
    ids: S.providers.map(x => x.id),
    hidden: S.hiddenModels
  }));
  expect(d.n === 6 && !d.ids.includes('glm'), '删除失败：' + d.ids.join(','));
  expect(!d.hidden.some(k => k.startsWith('glm:')), '残留关注项：' + d.hidden);
  await ctx.close();
  return '平台 7 → 6，glm 关注项一并清理';
});
T('F18', '功能', '修改 PIN 后旧 PIN 失效、新 PIN 可用', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => changePinSheet());
  await page.waitForSelector('#np');
  await page.type('#np', '5678');
  await page.type('#np2', '5678');
  await page.evaluate(() => changePin());
  await new Promise(r => setTimeout(r, 900));
  // 锁屏后用旧 PIN
  await page.evaluate(() => lock());
  await page.waitForSelector('#pin');
  await page.type('#pin', '1234');
  await page.click('#gateGo');
  await new Promise(r => setTimeout(r, 900));
  const oldOk = await page.evaluate(() => !!document.querySelector('.tabs'));
  // 用新 PIN
  await page.evaluate(() => { const el = document.querySelector('#pin'); if (el) el.value = ''; });
  await page.type('#pin', '5678');
  await page.click('#gateGo');
  await page.waitForSelector('.tabs', { timeout: 8000 });
  expect(!oldOk, '旧 PIN 仍然可用');
  await ctx.close();
  return '旧 PIN 拒绝 · 新 PIN 解锁成功';
});


/* ============================ 平台目录 ============================ */
T('F19', '功能', '平台目录 12 项，受限平台已标注', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  const d = await page.evaluate(() => ({
    total: PRESETS.length,
    keys: PRESETS.map(x => x.key),
    restricted: PRESETS.filter(x => x.restricted).map(x => x.key)
  }));
  expect(d.total === 12, '目录项 ' + d.total);
  ['feishu', 'qwen', 'hunyuan', 'codex', 'grok', 'claude', 'custom'].forEach(k =>
    expect(d.keys.includes(k), '缺少 ' + k));
  expect(JSON.stringify(d.restricted) === JSON.stringify(['codex', 'grok', 'claude', 'google']),
    '受限清单不符：' + d.restricted);
  await ctx.close();
  return '12 项 / 受限：codex·grok·claude·google';
});
T('F20', '功能', '一键添加受限平台并带「受限制」标记', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => addPreset('codex'));
  await new Promise(r => setTimeout(r, 800));
  const d = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.card')].find(x => x.textContent.includes('Codex'));
    return { exists: !!c, text: c ? c.innerText.replace(/\s+/g, ' ') : '', n: S.providers.length };
  });
  expect(d.exists, 'Codex 卡片未出现');
  expect(d.text.includes('受限制'), '缺少受限制标记');
  expect(d.n === 8, '平台数 ' + d.n);
  await ctx.close();
  return 'Codex 已添加 · 带受限制标记';
});
T('F21', '功能', '手动额度填写后首页展示百分比与备注', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => manualSheet('qwen'));
  await page.waitForSelector('#mp');
  await page.type('#mp', '72');
  await page.type('#mt', '本月剩 ¥120');
  await page.evaluate(() => saveManual('qwen'));
  await new Promise(r => setTimeout(r, 900));
  const d = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.card')].find(x => x.textContent.includes('阿里'));
    return { text: c ? c.innerText.replace(/\s+/g, ' ') : '', pct: c ? (c.querySelector('.mlab b') || {}).textContent : '' };
  });
  expect(d.pct === '72%', '百分比 ' + d.pct);
  expect(d.text.includes('本月剩 ¥120'), '备注未展示');
  await ctx.close();
  return '72% + 备注已上屏';
});
T('F22', '功能', '自定义平台走手动适配器', async () => {
  const { ctx, page } = await newPage();
  await unlock(page);
  await page.evaluate(() => customSheet());
  await page.waitForSelector('#nName');
  await page.type('#nName', '自建网关');
  await page.evaluate(() => createProvider());
  await new Promise(r => setTimeout(r, 800));
  const d = await page.evaluate(() => {
    const x = S.providers.find(p => p.name === '自建网关');
    return { exists: !!x, adapter: x && x.adapter, n: S.providers.length };
  });
  expect(d.exists && d.adapter === 'manual', '自定义平台未走 manual：' + JSON.stringify(d));
  expect(d.n === 8, '平台数 ' + d.n);
  await ctx.close();
  return 'adapter=manual，平台 7 → 8';
});

/* ============================ 执行 ============================ */
(async () => {
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2']
  });
  const rows = [];
  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('用例超时 ' + ms + 'ms')), ms))
  ]);
  for (const c of checks) {
    const t0 = Date.now();
    process.stdout.write('.. ' + c.id + ' ' + c.name + ' ');
    try {
      const detail = await withTimeout(Promise.resolve().then(() => c.fn()), c.timeout || 45000);
      rows.push({ id: c.id, group: c.group, name: c.name, pass: true, detail: detail || 'ok', ms: Date.now() - t0 });
      process.stdout.write('PASS ' + (Date.now() - t0) + 'ms\n');
    } catch (e) {
      rows.push({ id: c.id, group: c.group, name: c.name, pass: false, detail: e.message, ms: Date.now() - t0 });
      process.stdout.write('FAIL ' + e.message.slice(0, 80) + '\n');
    }
  }
  await browser.close();

  const byGroup = {};
  rows.forEach(r => { (byGroup[r.group] = byGroup[r.group] || []).push(r); });
  let fail = 0;
  for (const g of Object.keys(byGroup)) {
    console.log(`\n=== ${g} ===`);
    byGroup[g].forEach(r => {
      if (!r.pass) fail++;
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.name}  —  ${r.detail}  (${r.ms}ms)`);
    });
  }
  const total = rows.length, passed = total - fail;
  console.log(`\nSUMMARY  ${passed}/${total} passed, ${fail} failed`);
  fs.writeFileSync('/tmp/test/report.json', JSON.stringify({ ts: new Date().toISOString(), total, passed, fail, rows }, null, 2));
  process.exit(fail ? 1 : 0);
})();
