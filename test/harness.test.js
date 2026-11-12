// Drift test for tools/browser-harness.js: the harness copies a few constants from src (nominal loads, snap steps,
// the viewport budgets, the DOM classes it measures). If src changes and the harness does not, these fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { figures, draw, nominal } from './scene-helpers.js';
import { snapLoad, LOAD_CAP } from '../src/state.js';
import { LABEL_PX, HANDLE_PX } from '../src/scene.js';
import { PALETTE } from '../src/svg.js';
import { pointCarriers } from '../src/scene.js';

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

test('SIM snap constants match state.js behaviour: 5 degree steps, 8 % zero snap, 1 x cap', () => {
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
  assert.equal(LOAD_CAP, 1);
  assert.deepEqual(SIM.magnitudes, [0, SIM.cap]);
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

test('letter~point and letter~overlap: a letter must stand by its point and cover nothing', () => {
  const H = sandbox.window.H;
  const base = () => ({ scale: 1, view: { x: 0, y: 0, w: 400, h: 400 }, labels: [], arrows: [], members: [{ id: 'm', r: 3, pts: [{ x: 50, y: 200 }, { x: 350, y: 200 }] }],
    handles: [], supports: [], grounds: [], pins: [], balls: [], texts: [], letters: [] });
  const letter = (rect, extra = {}) => ({ id: 'B@m', point: 'B', member: 'm', anchor: { x: 200, y: 200 }, fill: SIM.letterFill, rect, ...extra });
  const rules = ms => H.check(ms, { frac: 0 }).filter(s => s.startsWith('letter~'));
  // beside the point, clear of the bar (r 3 -> edge at 197): fine
  let ms = base(); ms.letters = [letter({ x: 196, y: 170, w: 10, h: 16 })];
  assert.equal(rules(ms).length, 0);
  // far from its point (measured from the bar's edge)
  ms = base(); ms.letters = [letter({ x: 196, y: 120, w: 10, h: 16 })];
  assert.ok(rules(ms).some(s => s.startsWith('letter~point')));
  // on the bar
  ms = base(); ms.letters = [letter({ x: 196, y: 196, w: 10, h: 10 })];
  assert.ok(rules(ms).some(s => s.startsWith('letter~overlap') && s.includes('member')));
  // on an arrow, on a force label, on another letter, on a ball, on a handle halo, off the view, the wrong colour
  const arrow = { id: 'F', kind: 'reaction', member: 'm', zero: false, tail: { x: 190, y: 150 }, base: { x: 190, y: 185 }, tip: { x: 190, y: 197 }, tri: [{ x: 190, y: 197 }, { x: 184, y: 185 }, { x: 196, y: 185 }], w: 3 };
  ms = base(); ms.arrows = [arrow]; ms.letters = [letter({ x: 186, y: 160, w: 10, h: 16 })];
  assert.ok(rules(ms).some(s => s.includes('touches arrow')));
  ms = base(); ms.labels = [{ id: 'Q@m', rect: { x: 196, y: 170, w: 14, h: 18 } }]; ms.letters = [letter({ x: 198, y: 172, w: 10, h: 16 })];
  assert.ok(rules(ms).some(s => s.includes('touches label')));
  ms = base(); ms.letters = [letter({ x: 196, y: 170, w: 10, h: 16 }), letter({ x: 200, y: 172, w: 10, h: 16 }, { id: 'C@m', point: 'C' })];
  assert.equal(rules(ms).filter(s => s.includes('touches letter')).length, 1);
  ms = base(); ms.balls = [{ id: 'D', c: { x: 200, y: 160 }, r: 20 }]; ms.letters = [letter({ x: 196, y: 150, w: 10, h: 16 })];
  assert.ok(rules(ms).some(s => s.includes('touches ball')));
  ms = base(); ms.handles = [{ id: 'P', hit: { w: 46, h: 46 }, ring: { x: 0, y: 0, w: 1, h: 1 }, ringR: 10, haloR: 17, centre: { x: 200, y: 170 } }]; ms.letters = [letter({ x: 196, y: 165, w: 10, h: 16 })];
  assert.ok(rules(ms).some(s => s.includes('touches handle')));
  ms = base(); ms.letters = [letter({ x: -5, y: 170, w: 10, h: 16 }, { anchor: { x: 0, y: 200 } })];
  assert.ok(rules(ms).some(s => s.includes('outside viewBox')));
  ms = base(); ms.letters = [letter({ x: 196, y: 170, w: 10, h: 16 }, { fill: '#ff0000' })];
  assert.ok(rules(ms).some(s => s.includes('is not')));
  // a load handle sitting on the point: measured from the halo's edge, so a letter just outside the halo is near
  ms = base(); ms.handles = [{ id: 'P', hit: { w: 46, h: 46 }, ring: { x: 0, y: 0, w: 1, h: 1 }, ringR: 10, haloR: 17, centre: { x: 200, y: 200 } }];
  ms.letters = [letter({ x: 196, y: 165, w: 10, h: 16 }, { anchor: { x: 200, y: 200 } })];
  assert.equal(rules(ms).length, 0);
});

test('SIM letter constants match svg.js: the letter fill, and a near limit above the 14 px of the plan', () => {
  assert.equal(SIM.letterFill, PALETTE.letter);
  assert.equal(SIM.letterFill, '#374151');
  assert.ok(SIM.letterNear >= 14 && SIM.letterNear <= 20);
});

test('every figure draws its point letters with the class and attributes the harness reads', () => {
  for (const fig of figures) for (const frac of [0, 1]) {
    const svg = draw(fig, nominal(fig), frac);
    const walk = (n, out = []) => { if ((n.attrs.class || '').split(/\s+/).includes('point-label')) out.push(n); n.children.forEach(c => walk(c, out)); return out; };
    const groups = walk(svg).map(g => `${g.attrs['data-point']}@${g.attrs['data-member']}`).sort();
    const expected = [];
    for (const p of Object.keys(fig.points).filter(k => /^[A-Z]$/.test(k))) {
      const carriers = pointCarriers(fig, p);
      for (const m of (frac === 0 ? carriers.slice(0, 1) : carriers)) expected.push(`${p}@${m}`);
    }
    assert.deepEqual([...groups], expected.sort(), `fig ${fig.id} frac ${frac}`);
  }
  assert.ok(source.includes('.point-label') && source.includes('data-point') && source.includes('data-member'));
});
