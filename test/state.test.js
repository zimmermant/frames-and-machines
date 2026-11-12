import test from 'node:test';
import assert from 'node:assert/strict';
import { snapLoad, ease, initialState, presetFromQuery } from '../src/state.js';
import { stepLoad } from '../src/kbd.js';
import * as state from '../src/state.js';
import { FIG1 } from '../src/figures/fig1.js';
import { FIG3 } from '../src/figures/fig3.js';
import { FIG4 } from '../src/figures/fig4.js';
import { FIG6 } from '../src/figures/fig6.js';

test('snap to zero below 8 % preserves the last nonzero angle and exact positive zeros', () => {
  assert.deepEqual(snapLoad({x:0.079,y:0}, 1, -Math.PI/2), {vec:{x:0,y:0},lastAngle:-Math.PI/2});
  assert.equal(snapLoad({x:0.08,y:0},1,0).vec.x,0.08);
});
test('cap at 1× nominal (the textbook load)', () => {
  assert.deepEqual(snapLoad({x:0,y:-99},10,0), {vec:{x:0,y:-10},lastAngle:-Math.PI/2});
});
test('direction snaps to 5° without quantizing magnitude', () => {
  const angle=13*Math.PI/180, result=snapLoad({x:0.9*Math.cos(angle),y:0.9*Math.sin(angle)},1,0);
  assert.ok(Math.abs(result.lastAngle-Math.PI/12)<1e-12);
  assert.ok(Math.abs(Math.hypot(result.vec.x,result.vec.y)-0.9)<1e-12);
});
test('ease is smoothstep, with clamped endpoints', () => {
  assert.deepEqual([-1,0,0.25,0.5,0.75,1,2].map(ease),[0,0,0.15625,0.5,0.84375,1,1]);
});

test('URL without presets keeps the initial state', () => {
  assert.deepEqual(state.presetFromQuery(FIG6,''),state.initialState(FIG6));
  assert.deepEqual(state.presetFromQuery(FIG6,'?other=1&Q=0,0'),state.initialState(FIG6));
});
test('URL fraction scales the textbook load with degrees counterclockwise from +x', () => {
  const preset=state.presetFromQuery(FIG6,'?P=0.5,-90');
  assert.deepEqual(preset.loads.P,{x:0,y:-6});
  assert.equal(preset.lastAngle.P,-Math.PI/2);
});
test('URL fraction clamps to [0, 1] independently of the drag cap', () => {
  for (const [query,vec] of [
    ['?P=1,0',{x:120,y:0}],
    ['?P=2,0',{x:120,y:0}],
    ['?P=-1,0',{x:0,y:0}]
  ]) assert.deepEqual(state.presetFromQuery(FIG4,query).loads.P,vec,query);
  const preset=state.presetFromQuery(FIG4,'?P=2,45');
  assert.ok(Math.abs(preset.loads.P.x-120/Math.sqrt(2))<1e-10);
  assert.ok(Math.abs(preset.loads.P.y-120/Math.sqrt(2))<1e-10);
});
test('URL direction snaps to 5 degrees without quantizing magnitude', () => {
  const preset=state.presetFromQuery(FIG3,'?P=0.5,47');
  assert.equal(preset.lastAngle.P,Math.PI/4);
  assert.ok(Math.abs(preset.loads.P.x-155/Math.sqrt(2))<1e-10);
  assert.ok(Math.abs(preset.loads.P.y-155/Math.sqrt(2))<1e-10);
});
test('URL zero snap preserves the supplied angle', () => {
  for (const fraction of [0,0.05]) {
    const preset=state.presetFromQuery(FIG6,`?P=${fraction},90`);
    assert.deepEqual(preset.loads.P,{x:0,y:0});
    assert.equal(preset.lastAngle.P,Math.PI/2);
  }
  assert.deepEqual(state.presetFromQuery(FIG6,'?P=0.08,90').loads.P,{x:0,y:0.96});
});
test('URL unreadable loads and lowercase names keep textbook values', () => {
  for (const query of [
    '?P=abc','?P=0.5','?P=,90','?p=0.5,0','?P=0.5,NaN',
    '?P=','?P=0.5,','?P=%20,90','?P=0.5,%20','?P=0.5,90,0',
    '?P=0.5junk,90','?P=0.5,90junk','?P=Infinity,90','?P=0.5,Infinity'
  ]) assert.deepEqual(state.presetFromQuery(FIG6,query),state.initialState(FIG6),query);
});
test('URL sets frame 1 loads independently', () => {
  const preset=state.presetFromQuery(FIG1,'?Q=0.5,180');
  assert.deepEqual(preset.loads,{P:{x:0,y:0},Q:{x:-0.5,y:0}}); // frame 1 P opens at 0 (Todd 2026-11-12)
  assert.equal(preset.lastAngle.P,-Math.PI/2);
  assert.equal(preset.lastAngle.Q,Math.PI);
  assert.deepEqual(state.presetFromQuery(FIG1,'?P=0.5,0&Q=0.5,180').loads,
    {P:{x:0.5,y:0},Q:{x:-0.5,y:0}});
  assert.deepEqual(state.presetFromQuery(FIG1,'?P=abc&Q=0.5,180'),preset);
});
test('URL opens exploded only for the exact view value', () => {
  assert.equal(state.presetFromQuery(FIG6,'?view=exploded').explodeTarget,1);
  for (const query of ['?view=yes','?view=Exploded','?View=exploded','?view=']) {
    assert.equal(state.presetFromQuery(FIG6,query).explodeTarget,0,query);
  }
});
test('URL presets do not mutate figure data or share mutable state', () => {
  const before=structuredClone(FIG1);
  const preset=state.presetFromQuery(FIG1,'?Q=0.5,180');
  preset.loads.P.x=99;
  preset.loads.Q.y=99;
  preset.lastAngle.P=99;
  assert.deepEqual(FIG1,before);
  assert.deepEqual(state.presetFromQuery(FIG1,'?Q=0.5,180').loads,
    {P:{x:0,y:0},Q:{x:-0.5,y:0}});
});

// Todd 2026-11-12: frame 1 opens with P = 0 (Q stays at its textbook value). P's nominal still sets the cap, the URL
// fraction scale and the keyboard step, and its remembered direction stays the textbook one (down), so Up resumes downward.
test('frame 1 opens with P at zero unless the URL sets it', () => {
  const s=initialState(FIG1);
  assert.deepEqual(s.loads.P,{x:0,y:0});
  assert.deepEqual(s.loads.Q,{x:0,y:-1});
  assert.equal(s.lastAngle.P,-Math.PI/2);
  assert.deepEqual(presetFromQuery(FIG1,'').loads.P,{x:0,y:0});
  assert.deepEqual(presetFromQuery(FIG1,'?Q=0.5,180').loads.P,{x:0,y:0});
  assert.deepEqual(presetFromQuery(FIG1,'?P=abc').loads.P,{x:0,y:0});
  assert.deepEqual(presetFromQuery(FIG1,'?P=1,-90').loads.P,{x:0,y:-1});
  assert.deepEqual(stepLoad(s.loads.P,1,'ArrowUp',s.lastAngle.P).vec,{x:0,y:-0.05});
});
