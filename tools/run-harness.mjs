// Runs tools/browser-harness.js against every built page, at each viewport budget, in headless Microsoft Edge (CDP over
// Node's built-in WebSocket; no dependencies).
//
//   node tools/run-harness.mjs [--pages 1,2,3] [--viewports 375,800,1280] [--shots <dir>] [--no-build] [--verbose]
//
// It rebuilds dist/ (unless --no-build), serves the repo with `python3 -m http.server` on a free port, loads each page at
// 375x812, 800x750 and 1280x720, injects the harness, and prints per page and viewport {violations, sensitivity, budget}.
// With --shots it also writes a combined and an exploded PNG of each page at each viewport, and (always) drags a real handle
// with the mouse to prove the pointer path works in the browser.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { figures } from '../test/scene-helpers.js';
import { frameBounds } from '../src/layout.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const pages = String(opt('pages', '1,2,3,4,5,6')).split(',').map(Number);
const widths = String(opt('viewports', '375,800,1280')).split(',').map(Number);
const VIEWPORTS = [{ width: 375, height: 812 }, { width: 800, height: 750 }, { width: 1280, height: 720 }].filter(v => widths.includes(v.width));
const shots = opt('shots', null);
const verbose = opt('verbose', false);
const setup = opt('setup', null); // a JS file that puts the page in some state (after the harness is injected); then one screenshot is taken (--shots <dir>)
const probe = opt('probe', null); // a JS file evaluated in each page after the harness is injected; its result is printed (debugging aid)
const EDGE = process.env.EDGE_PATH || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

if (opt('no-build', false) !== true) { const { main } = await import(new URL('../build.js', import.meta.url)); main(); }

const httpPort = await freePort(), debugPort = await freePort();
const server = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'frames-edge-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { edge.kill(); } catch {} try { server.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {} await sleep(200); }
if (!targets) { cleanup(); throw new Error('Edge did not start'); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async js => { const r = (await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
const harnessSource = readFileSync(join(root, 'tools/browser-harness.js'), 'utf8');

async function open(page, vp) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/dist/frame-${page}.html` });
  for (let i = 0; i < 50; i++) { await sleep(100); if (await ev('!!globalThis.__frameApp && document.readyState==="complete"')) return; }
  throw new Error(`frame-${page} did not start`);
}
async function shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); }
const setFrac = f => ev(`(()=>{const a=globalThis.__frameApp; a.frac=${f}; a.state.explodeTarget=${f}; a.redraw(); return a.frac})()`);

// A real mouse drag of the first load's handle by (dx, dy) px, in the current (combined or exploded) state.
async function drag(dx, dy) {
  const before = JSON.parse(await ev('JSON.stringify(globalThis.__frameApp.state.loads)'));
  const c = JSON.parse(await ev(`(()=>{const r=document.querySelector('.handle').getBoundingClientRect(); return JSON.stringify([r.x+r.width/2, r.y+r.height/2])})()`));
  await mouse('mouseMoved', c[0], c[1]); await mouse('mousePressed', c[0], c[1]);
  for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', c[0] + dx * k / 8, c[1] + dy * k / 8); await sleep(12); }
  await mouse('mouseReleased', c[0] + dx, c[1] + dy);
  const after = JSON.parse(await ev('JSON.stringify(globalThis.__frameApp.state.loads)'));
  return JSON.stringify(before) !== JSON.stringify(after);
}

const rows = []; const details = []; const fit = [];
if (shots) mkdirSync(shots, { recursive: true });
try {
  for (const page of pages) for (const vp of VIEWPORTS) {
    await open(page, vp);
    await ev(harnessSource);
    if (setup) { await ev(readFileSync(setup, 'utf8')); await sleep(60); await shot(join(shots || '.', `fig${page}-setup-${vp.width}x${vp.height}.png`)); continue; }
    if (probe) { console.log(`probe frame-${page} @${vp.width}:`, JSON.stringify(await ev(readFileSync(probe, 'utf8')))); continue; }
    const t0 = Date.now();
    {
      // How much of the svg the frame itself (members and supports, no arrows) fills, in each explode state, and how long the
      // load arrow is at the textbook load (all from the page's own scale and size).
      const g = JSON.parse(await ev(`(()=>{const s=document.querySelector('#scene'); return JSON.stringify({scale:+s.getAttribute('data-scale'),w:s.clientWidth,h:s.clientHeight})})()`));
      const fig = figures.find(f => f.id === page), nom = Math.hypot(fig.loads[0].nominal.x, fig.loads[0].nominal.y);
      const span = frac => { const F = frameBounds(fig, frac); return Math.max((F.x1 - F.x0) * g.scale / g.w, (F.y1 - F.y0) * g.scale / g.h); };
      fit.push({ page, vp: `${vp.width}x${vp.height}`, combined: span(0), exploded: span(1), arrowPx: nom * fig.view.arrowPerForce * g.scale });
    }
    const r = await ev(`H.all({width:${vp.width},height:${vp.height}})`);
    let dragOk = null;
    if (shots) {
      await setFrac(0); await sleep(50);
      await shot(join(shots, `fig${page}-combined-${vp.width}x${vp.height}.png`));
      await setFrac(1); await sleep(50);
      await shot(join(shots, `fig${page}-exploded-${vp.width}x${vp.height}.png`));
      // Keyboard focus on the first handle (Tab, Tab: the button, then the handle) to see the focus halo.
      await setFrac(0);
      for (let k = 0; k < 2; k++) { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); }
      await sleep(80);
      await shot(join(shots, `fig${page}-focus-${vp.width}x${vp.height}.png`));
    }
    // Real pointer drag, combined and exploded.
    await setFrac(0); const d0 = await drag(-40, 30); await setFrac(1); const d1 = await drag(30, -40);
    dragOk = d0 && d1;
    rows.push({ page, vp: `${vp.width}x${vp.height}`, violations: r.violationCount, flagged: r.sensitivity.flagged, budget: r.budget.ok, states: r.counts.states, labels: r.counts.labels, arrows: r.counts.arrows, liftOff: r.counts.liftOffStates, nonVac: r.nonVacuity.ok, drag: dragOk, secs: ((Date.now() - t0) / 1000).toFixed(0) });
    details.push({ page, vp, r });
  }
} finally { cleanup(); }

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('page', 5)}${pad('viewport', 10)}${pad('violations', 11)}${pad('flagged', 8)}${pad('budget', 7)}${pad('states', 8)}${pad('labels', 8)}${pad('arrows', 8)}${pad('liftOff', 8)}${pad('nonVac', 7)}${pad('drag', 6)}secs`);
for (const x of rows) console.log(`${pad(x.page, 5)}${pad(x.vp, 10)}${pad(x.violations, 11)}${pad(x.flagged, 8)}${pad(x.budget, 7)}${pad(x.states, 8)}${pad(x.labels, 8)}${pad(x.arrows, 8)}${pad(x.liftOff, 8)}${pad(x.nonVac, 7)}${pad(x.drag, 6)}${x.secs}`);
if (fit.length) {
  console.log(`\n${pad('page', 5)}${pad('viewport', 10)}${pad('frame % combined', 18)}${pad('frame % exploded', 18)}load arrow px at textbook load`);
  for (const f of fit) console.log(`${pad(f.page, 5)}${pad(f.vp, 10)}${pad((100 * f.combined).toFixed(1), 18)}${pad((100 * f.exploded).toFixed(1), 18)}${f.arrowPx.toFixed(1)}`);
}
for (const { page, vp, r } of details) {
  if (!r.violationCount && r.sensitivity.flagged && r.budget.ok && r.nonVacuity.ok && !verbose) continue;
  console.log(`\n--- frame ${page} @ ${vp.width}x${vp.height}: ${r.violationCount} violations`);
  const byRule = {};
  for (const v of r.violations) { const rule = v.split(': ').slice(1).join(': ').split(':')[0]; (byRule[rule] ||= []).push(v); }
  for (const [rule, list] of Object.entries(byRule)) { console.log(`  [${list.length}] ${rule}`); for (const v of list.slice(0, verbose ? 12 : 3)) console.log(`      ${v}`); }
  if (!r.sensitivity.flagged) console.log('  sensitivity NOT flagged:', JSON.stringify(r.sensitivity.failedPlants));
  if (!r.nonVacuity.ok) console.log('  NON-VACUITY failed:', JSON.stringify(r.nonVacuity.failed));
  if (!r.budget.ok) console.log('  budget:', JSON.stringify(r.budget));
}
if (verbose) for (const { page, vp, r } of details) console.log(JSON.stringify({ page, vp, plants: Object.fromEntries(Object.entries(r.sensitivity.plants || {}).map(([k, p]) => [k, p.flagged])), counts: r.counts, budget: r.budget }));
process.exit(rows.every(x => x.violations === 0 && x.flagged && x.budget && x.nonVac) ? 0 : 1);
