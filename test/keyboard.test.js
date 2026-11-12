import test from 'node:test';
import assert from 'node:assert/strict';
import { stepLoad } from '../src/kbd.js';
import { setup, key, near } from './interaction-helpers.js';

test('arrow keys rotate ±5° and change magnitude by 5 % nominal, clamped', () => {
  for (const [k, angle] of [['ArrowLeft',Math.PI/36],['ArrowRight',-Math.PI/36]]) {
    const result=stepLoad({x:10,y:0},10,k,0);
    near(Math.atan2(result.vec.y,result.vec.x),angle); near(Math.hypot(result.vec.x,result.vec.y),10);
  }
  for (const [x,k,want] of [[10,'ArrowUp',10],[9,'ArrowUp',9.5],[10,'ArrowDown',9.5],[9.8,'ArrowUp',10],[0,'ArrowDown',0],[0,'ArrowUp',0.5],[0.5,'ArrowDown',0]]) {
    near(stepLoad({x,y:0},10,k,0).vec.x,want);
  }
});
test('Up from zero resumes lastAngle and repeated Down reaches exact zero', () => {
  assert.deepEqual(stepLoad({x:0,y:0},1,'ArrowUp',-Math.PI/2),{vec:{x:0,y:-0.05},lastAngle:-Math.PI/2});
  let value={vec:{x:1,y:0},lastAngle:0};
  for(let i=0;i<20;i++) value=stepLoad(value.vec,1,'ArrowDown',value.lastAngle);
  assert.deepEqual(value.vec,{x:0,y:0});
});
test('Left and Right at zero update lastAngle without creating a load', () => {
  for (const [direction, delta] of [['ArrowLeft',Math.PI/36],['ArrowRight',-Math.PI/36]]) {
    const ui=setup();
    ui.app.setLoad('P',{vec:{x:0,y:0},lastAngle:Math.PI/4});
    ui.app.redraw(); ui.handle('P').focus();
    key(ui,'P',direction);
    assert.deepEqual(ui.app.state.loads.P,{x:0,y:0});
    near(ui.app.state.lastAngle.P,Math.PI/4+delta);
    key(ui,'P','ArrowUp');
    near(Math.atan2(ui.app.state.loads.P.y,ui.app.state.loads.P.x),Math.PI/4+delta);
    near(Math.hypot(ui.app.state.loads.P.x,ui.app.state.loads.P.y),0.05);
  }
});
test('keys affect only the focused handle, prevent scrolling, and restore rebuilt focus', () => {
  const ui=setup({search:'?P=1,-90'}); ui.handle('Q').focus(); // P opens at 0 in frame 1
  assert.equal(key(ui,'P','ArrowUp').defaultPrevented,undefined);
  assert.equal(key(ui,'Q','ArrowUp').defaultPrevented,true);
  near(ui.app.state.loads.Q.y,-1); assert.deepEqual(ui.app.state.loads.P,{x:0,y:-1});
  assert.equal(document.activeElement,ui.handle('Q'));
  assert.equal(key(ui,'Q','ArrowDown').defaultPrevented,true);
  near(ui.app.state.loads.Q.y,-0.95);
  key(ui,'Q','ArrowUp'); near(ui.app.state.loads.Q.y,-1);
  ui.button.focus();
  assert.equal(key(ui,'Q','ArrowUp',ui.button).defaultPrevented,undefined);
});

test('aria-valuenow follows keyboard steps and the cap', () => {
  const ui=setup({search:'?P=1,-90'}); ui.handle('P').focus(); // P opens at 0 in frame 1
  assert.equal(ui.handle('P').getAttribute('aria-valuenow'),'100');
  key(ui,'P','ArrowUp');
  assert.equal(ui.handle('P').getAttribute('aria-valuenow'),'100');   // already at the cap
  key(ui,'P','ArrowDown'); key(ui,'P','ArrowDown');
  assert.equal(ui.handle('P').getAttribute('aria-valuenow'),'90');
  for (let i=0;i<20;i++) key(ui,'P','ArrowUp');
  assert.equal(ui.handle('P').getAttribute('aria-valuenow'),'100');
});
