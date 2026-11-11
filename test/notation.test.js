// Ported from joint_explode: inspect lowered spans and spoken names, then inject
// digits through the same label writer to prove the text scan can still fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { label } from '../src/svg.js';
import { figures, nominal, draw, nodes, byClass, byTag, attr, forceLabel } from './scene-helpers.js';

function* everyScene() {
  for (const fig of figures) for (const frac of [0,0.5,1]) for (const factor of [0,1,-1,2]) {
    const loads=Object.fromEntries(Object.entries(nominal(fig)).map(([k,v])=>[k,{x:v.x*factor,y:v.y*factor}]));
    yield draw(fig,loads,frac);
  }
}
function spokenStrings(root) {
  return nodes(root,()=>true).flatMap(n=>['aria-label','aria-valuetext','title','alt'].map(k=>attr(n,k)).filter(s=>s!==null));
}

test('no digits or ASCII underscores reach rendered or spoken text, including subscripts', () => {
  let scenes=0;
  for (const svg of everyScene()) {
    assert.ok(svg.textContent.includes('P'));
    for (const text of [svg.textContent,...spokenStrings(svg)]) assert.doesNotMatch(text,/[\d_]/);
    assert.ok(byTag(svg,'text').every(n=>n.classList.contains('t')));
    scenes++;
  }
  assert.equal(scenes,72);
});

// The expected text of every force label, from its role: F + subscript for pin and support components (F_Ax) and for the
// force of a two-force member (F_B, named for the joint), N + point for a roller or ball normal force, and P / Q for loads.
const expectedLabel = (role,name,sub) => role==='load' ? {base:name,low:null,say:name}
  : role==='normal' ? {base:'N',low:name,say:`N sub ${name}`}
  : role==='link' ? {base:'F',low:name,say:`F sub ${name}`}
  : {base:'F',low:name+sub,say:`F sub ${name} ${sub}`};

test('force labels are F or N plus one genuinely lowered subscript tspan (loads stay P and Q)', () => {
  let lowered=0, plain=0;
  const roles=new Set();
  for (const svg of everyScene()) for (const force of byClass(svg,'force')) {
    const text=forceLabel(svg,force), role=attr(force,'data-role'), name=attr(force,'data-name'), sub=attr(force,'data-sub');
    const want=expectedLabel(role,name,sub);
    roles.add(role);
    assert.equal(attr(text,'font-style'),'italic');
    assert.equal(text.textContent,want.base+(want.low||''));
    const low=byTag(text,'tspan').filter(n=>+attr(n,'dy')>0);
    if (want.low) {
      assert.equal(low.length,1);
      assert.equal(low[0].textContent,want.low);
      const ratio=+attr(low[0],'font-size')/+attr(text,'font-size');
      assert.ok(ratio>=0.75 && ratio<1);
      assert.equal(attr(text,'aria-label'),want.say);
      assert.equal(attr(text,'role'),'text');
      lowered++;
    } else {
      assert.equal(byTag(text,'tspan').length,0);
      assert.equal(attr(text,'aria-label'),null);
      plain++;
    }
  }
  assert.deepEqual([...roles].sort(),['component','link','load','normal']);
  assert.ok(lowered>0 && plain>0);
});

test('no rendered or spoken force label is a bare joint letter or a bare component', () => {
  // Bare means A, Ax, A_x, A sub x: a single capital optionally followed by x or y. Only the loads P and Q may stand alone.
  const bare=/^[A-Z][xy]?$|^[A-Z]_[xy]?$|^[A-Z] sub [xy]$|^[A-Z] sub$/;
  const loads=new Set(['P','Q']);
  let seen=0;
  for (const svg of everyScene()) {
    for (const force of byClass(svg,'force')) {
      const text=forceLabel(svg,force), spoken=attr(text,'aria-label')||text.textContent;
      for (const s of [text.textContent,spoken]) if (!loads.has(s)) assert.doesNotMatch(s,bare,`bare label "${s}"`);
      assert.match(spoken,attr(force,'data-role')==='load' ? /^[PQ]$/ : /^[FN] sub [A-Z]( [xy])?$/);
      seen++;
    }
    // every other spoken string that names a joint does so with F or N first (the lift-off sentence, the status text)
    for (const s of spokenStrings(svg)) assert.doesNotMatch(s,/(^|\s)(Roller|Ball|roller|ball) [A-Z]\b/);
  }
  assert.ok(seen>500,`seen ${seen}`);
  // the scanner can fail: a bare joint letter is caught
  assert.match('Ax',bare); assert.match('A_x',bare); assert.match('B',bare);
  assert.doesNotMatch('F sub A x',bare);
});

test('the no-value scanner catches digits injected through the split label writer', () => {
  const svg=draw(figures[0]);
  assert.doesNotMatch(svg.textContent,/\d/);
  label(svg,0,0,[{t:'A'},{t:'x 6',sub:true}],{size:1});
  assert.match(svg.textContent,/6/);
  assert.ok(spokenStrings(svg).some(s=>/6/.test(s)));
});
