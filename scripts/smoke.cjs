// Smoke test: serves the built game, opens it at phone size in headless Chromium,
// lets the demo ride for a few seconds, and fails on any page error or a blank screen.
// Run `npm run build` first. Needs Playwright with Chromium available (`npx playwright install chromium`).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dist = path.join(__dirname, '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(dist) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(4179, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:4179/');
  await page.waitForTimeout(6000);
  const shot = path.join(__dirname, '..', 'smoke.png');
  await page.screenshot({ path: shot });
  const score = await page.$eval('#score', e => e.textContent);
  await browser.close();
  server.close();
  if (errors.length) { console.error('FAIL: page errors\n' + errors.join('\n')); process.exit(1); }
  if (score === '0') { console.error('FAIL: the demo did not score, so the game loop may not be running'); process.exit(1); }
  console.log(`PASS: no errors, demo score ${score}. Screenshot: smoke.png`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
