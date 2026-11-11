// Drift test for tools/browser-harness.js: the harness copies a few constants from src (nominal loads, snap steps,
// the viewport budgets, the DOM classes it measures). If src changes and the harness does not, these fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { figures, draw } from './scene-helpers.js';
import { snapLoad, LOAD_CAP } from '../src/state.js';
import { LABEL_PX, HANDLE_PX } from '../src/scene.js';

const source = readFileSync(new URL('../tools/browser-harness.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const SIM = JSON.parse(JSON.stringify(sandbox.window.H.SIM)); // plain objects: a vm context has its own Array and Object

test('harness rejects a label on a ball but permits a clear corner of its bounding square', () => {
  const ms={scale:1,view:{x:0,y:0,w:200,h:200},labels:[],arrows:[],members:[],handles:[],supports:[],grounds:[],pins:[],texts:[],
    balls:[{id:'D',c:{x:100,y:100},r:20}]};
  ms.labels=[{id:'D@lower',rect:{x:96,y:96,w:8,h:8}}];
  assert.ok(sandbox.window.H.check(ms,{frac:0}).some(s=>s.startsWith('label~ball:')));
  ms.labels[0].rect={x:117,y:117,w:2,h:2};
  assert.equal(sandbox.window.H.check(ms,{frac:0}).length,0);
});

test('label~owner: a force drawn inside its ball is owned by arrow plus ball outline; any other force only by its arrow', () => {
  const arrow=(tail,tip)=>({id:'D@lower',kind:'reaction',member:'lower',zero:false,tail,base:{x:tip.x,y:tip.y+11},tip,
    tri:[tip,{x:tip.x-4,y:tip.y+11},{x:tip.x+4,y:tip.y+11}],w:3});
  const ms=(tail,rect)=>({scale:1,view:{x:0,y:0,w:400,h:400},labels:[{id:'D@lower',rect}],arrows:[arrow(tail,{x:tail.x,y:tail.y-30})],
    members:[],handles:[],supports:[],grounds:[],pins:[],texts:[],balls:[{id:'D',c:{x:200,y:200},r:30}]});
  const owner=m=>sandbox.window.H.check(m,{frac:0}).filter(s=>s.startsWith('label~owner'));
  // tail inside the ball: a label 10 px under the ball is far (40 px) from the arrow but hugs the ball
  assert.equal(owner(ms({x:200,y:215},{x:190,y:240,w:20,h:18})).length,0);
  // ... but a label far from both is still flagged
  assert.equal(owner(ms({x:200,y:215},{x:330,y:300,w:20,h:18})).length,1);
  // tail outside the ball: only the arrow counts, so a label near the ball but 60 px from the arrow is flagged
  assert.equal(owner(ms({x:200,y:340},{x:190,y:240,w:20,h:18})).length,1);
});

test('harness measures the actual ball centre and outline radius in screen pixels', () => {
  const matrix={a:2,b:0,c:0,d:2,e:10,f:20};
  const ball={getAttribute:k=>({cx:'3',cy:'4',r:'5','stroke-width':'1.5','data-name':'D'}[k]),getScreenCTM:()=>matrix};
  const svg={getScreenCTM:()=>matrix,viewBox:{baseVal:{x:0,y:0,width:100,height:100}},
    querySelectorAll:selector=>selector==='circle.ball' ? [ball] : []};
  const context={window:{},document:{querySelector:selector=>selector==='#scene' ? svg : null}};
  vm.runInNewContext(source,context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.H.measure().balls)),[{id:'D',c:{x:16,y:28},r:11.5}]);
});

test('harness loads without a DOM and exposes its API', () => {
  assert.deepEqual(Object.keys(sandbox.window.H).sort(), ['SIM', 'all', 'apply', 'budgetNow', 'check', 'expectedStates', 'measure', 'sensitivity', 'states']);
});

test('SIM.nominals match every figure\'s nominal loads', () => {
  assert.deepEqual(Object.keys(SIM.nominals).map(Number).sort(), figures.map(f => f.id));
  for (const fig of figures) {
    assert.deepEqual(Object.keys(SIM.nominals[fig.id]), fig.loads.map(l => l.name), `fig ${fig.id} load names`);
    for (const load of fig.loads) assert.deepEqual(SIM.nominals[fig.id][load.name], [load.nominal.x, load.nominal.y], `fig ${fig.id} ${load.name}`);
  }
});

test('SIM snap constants match state.js behaviour: 5 degree steps, 8 % zero snap, 1.5 x cap', () => {
  assert.equal(SIM.directions * SIM.angleStepDeg, 360);
  const at = deg => ({ x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180) });
  // just under and just over half a step
  const half = SIM.angleStepDeg / 2;
  assert.ok(Math.abs(Math.atan2(snapLoad(at(half - 0.01), 1, 0).vec.y, snapLoad(at(half - 0.01), 1, 0).vec.x)) < 1e-9);
  const up = snapLoad(at(half + 0.01), 1, 0).vec;
  assert.ok(Math.abs(Math.atan2(up.y, up.x) * 180 / Math.PI - SIM.angleStepDeg) < 1e-9);
  assert.deepEqual(snapLoad({ x: SIM.zeroSnap * 0.999, y: 0 }, 1, 0).vec, { x: 0, y: 0 });
  assert.ok(snapLoad({ x: SIM.zeroSnap * 1.001, y: 0 }, 1, 0).vec.x > 0);
  assert.equal(snapLoad({ x: 1000, y: 0 }, 1, 0).vec.x, SIM.cap);
  assert.equal(SIM.cap, LOAD_CAP);
  assert.equal(LOAD_CAP, 1.5);
  assert.deepEqual(SIM.magnitudes, [0, 1, SIM.cap]);
});

test('SIM floors and viewports match the spec, and the scene is sized to clear them at design size', () => {
  assert.equal(SIM.minText, 12);
  assert.equal(SIM.minHit, 44);
  assert.deepEqual(SIM.viewports, [{ width: 375, height: 812 }, { width: 800, height: 750 }, { width: 1280, height: 720 }]);
  assert.deepEqual(SIM.noScrollAt, { width: 1280, height: 720 });
  // The smallest text is the 0.8 x subscript; at the narrowest page the figure is drawn at design size or larger.
  assert.ok(0.8 * LABEL_PX >= SIM.minText, 'subscripts');
  assert.ok(2 * HANDLE_PX >= SIM.minHit, 'handle hit circle');
  const runner = readFileSync(new URL('../tools/run-harness.mjs', import.meta.url), 'utf8');
  for (const v of SIM.viewports) assert.ok(runner.includes(`{ width: ${v.width}, height: ${v.height} }`), `runner viewport ${v.width}x${v.height}`);
});

test('every DOM selector the harness measures is really rendered by scene.js', () => {
  // Figure 2 with the load pointing up lifts the roller off, so #liftoff has text and the zero ring exists.
  const svg = draw(figures[1], { P: { x: 0, y: 20 } }, 1);
  const classes = new Set();
  const walk = n => { for (const c of (n.attrs.class || '').split(/\s+/)) if (c) classes.add(c); n.children.forEach(walk); };
  walk(svg);
  for (const name of ['force', 'force-label', 'member', 'support', 'ground', 'pin', 'zero', 'handle', 'handle-ring', 'load-force', 'reaction-force', 'pin-force']) {
    assert.ok(classes.has(name), `class ${name} is rendered`);
    if (!name.endsWith('-force') || name === 'force') assert.ok(source.includes(name), `harness mentions ${name}`);
  }
  // The harness reads the arrow kind from the group's class with this pattern.
  assert.ok(source.includes('(load|reaction|pin)-force'));
  assert.ok(source.includes('#liftoff'));
  const walkId = (n, id) => n.attrs.id === id || n.children.some(c => walkId(c, id));
  assert.ok(walkId(svg, 'liftoff'));
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('globalThis.__frameApp') && source.includes('__frameApp'));
  const template = readFileSync(new URL('../src/frame.template.html', import.meta.url), 'utf8');
  assert.ok(template.includes('id="scene"') && template.includes('id="explode"'));
});
