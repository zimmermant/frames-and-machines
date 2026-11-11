import test from 'node:test';
import assert from 'node:assert/strict';
import { snapLoad, ease } from '../src/state.js';

test('snap to zero below 8 % preserves the last nonzero angle and exact positive zeros', () => {
  assert.deepEqual(snapLoad({x:0.079,y:0}, 1, -Math.PI/2), {vec:{x:0,y:0},lastAngle:-Math.PI/2});
  assert.equal(snapLoad({x:0.08,y:0},1,0).vec.x,0.08);
});
test('cap at 1.5× nominal', () => {
  assert.deepEqual(snapLoad({x:0,y:-99},10,0), {vec:{x:0,y:-15},lastAngle:-Math.PI/2});
});
test('direction snaps to 5° without quantizing magnitude', () => {
  const angle=13*Math.PI/180, result=snapLoad({x:1.2*Math.cos(angle),y:1.2*Math.sin(angle)},1,0);
  assert.ok(Math.abs(result.lastAngle-Math.PI/12)<1e-12);
  assert.ok(Math.abs(Math.hypot(result.vec.x,result.vec.y)-1.2)<1e-12);
});
test('ease is smoothstep, with clamped endpoints', () => {
  assert.deepEqual([-1,0,0.25,0.5,0.75,1,2].map(ease),[0,0,0.15625,0.5,0.84375,1,1]);
});
