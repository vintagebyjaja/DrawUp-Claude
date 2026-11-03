// Shared test harness: serves public/ and opens the real drawup-preview.html in Chromium with a stand-in
// Supabase (mock-supabase.js, in-memory rows) and stand-in API answers. No real database or AI is used.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs'), http = require('http');
const PUB = path.join(__dirname, '../../public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf' };
let server;
function serve(port) {
  if (server) return;
  server = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(PUB, p); if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(port);
}
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
/** opts: { width, height, mock (window.__DU_MOCK), api: async (pathname, req) => {status, json} | null, init: string } */
async function open(hash, opts = {}) {
  const port = opts.port || 8766; serve(port);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: opts.width || 1440, height: opts.height || 900 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => d.accept());
  await page.addInitScript(`window.__DU_MOCK = ${JSON.stringify(opts.mock || {})}; try { localStorage.setItem('du-studio-prefs-v26', JSON.stringify({ transitions: 'off', speed: 'quick' })); } catch (e) {} ${opts.init || ''}`);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1).*/, r => { const u = r.request().url(); if (u.includes('@supabase')) return r.fulfill({ path: path.join(__dirname, 'mock-supabase.js'), contentType: 'application/javascript' }); return r.fulfill({ status: 404, body: '' }); });
  await page.route(/\/api\//, async r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/supabase-config') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: 'https://mock.supabase.co', key: 'mock' }) });
    const res = opts.api ? await opts.api(u.pathname, r.request()) : null;
    if (res) return r.fulfill({ status: res.status || 200, contentType: 'application/json', body: JSON.stringify(res.json) });
    return r.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.goto(`http://127.0.0.1:${port}/drawup-preview.html${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(opts.wait || 6500);
  return { b, page, errors, shot: async (name) => page.screenshot({ path: path.join(OUT, name + '.png') }) };
}
function checker() { const res = []; return { ok(c, m, extra) { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || !extra ? '' : '  [' + extra + ']')); }, res, failed: () => res.filter(x => x.startsWith('FAIL')).length }; }
module.exports = { open, checker, OUT, close: () => server && server.close() };
