import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, pointer, key, near } from './interaction-helpers.js';
import { solve } from '../src/solve.js';
import { FIG1 } from '../src/figures/fig1.js';
import { FIG4 } from '../src/figures/fig4.js';
import { FIG2 } from '../src/figures/fig2.js';
import { FIG6 } from '../src/figures/fig6.js';
import { loadHandlePos } from '../src/scene.js';

test('URL zero load opens fully exploded and ArrowUp uses its supplied direction', () => {
  const ui=setup({search:'?P=0,90&view=exploded'},FIG6);
  assert.equal(ui.app.frac,1);
  assert.equal(ui.button.textContent,'Combine');
  assert.equal(ui.button.getAttribute('aria-pressed'),'true');
  assert.equal(ui.frames.size,0);
  assert.deepEqual(ui.app.state.loads.P,{x:0,y:0});
  near(+ui.handle().getAttribute('cx'),2.1);
  near(+ui.handle().getAttribute('cy'),-0.6);
  assert.equal(ui.svg.querySelector('.member').getAttribute('transform'),'translate(-1.1 0)');
  ui.handle().focus();
  assert.equal(key(ui,'P','ArrowUp').defaultPrevented,true);
  assert.equal(ui.app.state.loads.P.x,0);
  near(ui.app.state.loads.P.y,0.6);
  assert.equal(ui.app.frac,1);
  assert.equal(ui.frames.size,0);
});

test('URL exploded preset supports immediate drag in member coordinates with a fixed viewBox', () => {
  const ui=setup({search:'?P=0.5,-90&view=exploded'},FIG1);
  const viewBox=ui.svg.getAttribute('viewBox');
  const load=FIG1.loads[0], offset=FIG1.view.explode.AC;
  const at={x:load.at.x+offset.dx,y:load.at.y+offset.dy};
  const tail={x:at.x,y:at.y+0.5*FIG1.view.arrowPerForce};
  near(+ui.handle().getAttribute('cx'),tail.x);
  near(-ui.handle().getAttribute('cy'),tail.y);
  pointer(ui,'pointerdown',tail);
  assert.equal(ui.app.frac,1);
  assert.equal(ui.button.textContent,'Combine');
  const moved={x:at.x-0.5*FIG1.view.arrowPerForce,y:at.y};
  pointer(ui,'pointermove',moved);
  near(ui.app.state.loads.P.x,0.5);
  assert.equal(ui.app.state.loads.P.y,0);
  near(+ui.handle().getAttribute('cx'),moved.x);
  near(-ui.handle().getAttribute('cy'),moved.y);
  assert.deepEqual(ui.app.solution,solve(FIG1,ui.app.state.loads));
  pointer(ui,'pointerup',moved);
  assert.equal(ui.app.frac,1);
  assert.equal(ui.frames.size,0);
  assert.equal(ui.svg.getAttribute('viewBox'),viewBox);
  ui.button.fire('click');
  ui.tick(500);
  assert.equal(ui.app.frac,0);
  assert.equal(ui.button.textContent,'Explode');
  assert.equal(ui.svg.getAttribute('viewBox'),viewBox);
});

test('app defaults to the browser query and an explicit search overrides it', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{
    configurable:true,value:{search:'?P=0.5,-90&view=exploded'}
  });
  try {
    const fromLocation=setup({},FIG6);
    assert.deepEqual(fromLocation.app.state.loads.P,{x:0,y:-6});
    assert.equal(fromLocation.app.frac,1);
    const overridden=setup({search:'?P=0.5,0'},FIG6);
    assert.deepEqual(overridden.app.state.loads.P,{x:6,y:0});
    assert.equal(overridden.app.frac,0);
    const empty=setup({search:''},FIG6);
    assert.deepEqual(empty.app.state.loads.P,{x:0,y:-12});
    assert.equal(empty.app.frac,0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis,'location',descriptor);
    else delete globalThis.location;
  }
});

test('button label toggles Explode ↔ Combine and has aria-pressed', () => {
  const ui=setup();
  assert.equal(ui.button.disabled,false); assert.equal(ui.button.textContent,'Explode');
  assert.equal(ui.button.getAttribute('aria-pressed'),'false');
  ui.button.fire('click'); assert.equal(ui.button.textContent,'Combine');
  assert.equal(ui.button.getAttribute('aria-pressed'),'true');
  ui.button.fire('click'); assert.equal(ui.button.textContent,'Explode');
  assert.equal(ui.button.getAttribute('aria-pressed'),'false');
});
test('explode reverses from current fraction over 500 ms × remaining distance', () => {
  const ui=setup(); ui.button.fire('click');
  // At 200 ms, smoothstep(0.4) = 0.352; reverse lasts 176 ms.
  ui.tick(200); near(ui.app.frac,0.352);
  ui.button.fire('click'); near(ui.app.frac,0.352); assert.equal(ui.frames.size,1);
  ui.tick(288); near(ui.app.frac,0.176);
  ui.tick(376); assert.equal(ui.app.frac,0); assert.equal(ui.frames.size,0);
  ui.button.fire('click'); ui.tick(501); near(ui.app.frac,0.15625);
  ui.tick(876); assert.equal(ui.app.frac,1);
});
test('reduced motion jumps without scheduling a frame', () => {
  const ui=setup({reducedMotion:()=>true});
  ui.button.fire('click'); assert.equal(ui.app.frac,1);
  ui.button.fire('click'); assert.equal(ui.app.frac,0); assert.equal(ui.frames.size,0);
});
test('animation caches solution, restores focused handle, and follows member offset', () => {
  let calls=0; const ui=setup({solve:(fig,loads)=>{ calls++; return solve(fig,loads); }});
  assert.notEqual(FIG1.view.explode.AC.dx,0,'the offset must be real, or this test proves nothing');
  ui.handle().focus(); const initial=loadHandlePos(FIG1,ui.app.state,'P',0);
  ui.button.fire('click'); ui.tick(250);
  near(+ui.handle().getAttribute('cx'),initial.x+FIG1.view.explode.AC.dx*0.5);
  near(-ui.handle().getAttribute('cy'),initial.y+FIG1.view.explode.AC.dy*0.5);
  assert.equal(document.activeElement,ui.handle()); assert.equal(calls,1);
  ui.tick(500); assert.equal(calls,1);
});
test('handle follows member offset during an active drag with a stationary pointer', () => {
  // Vertical offsets keep this fixture exactly on a snap ray, so its tail
  // must stay exactly under the pointer rather than just within snap error.
  const fig=structuredClone(FIG1); fig.view.explode.AC={dx:0,dy:0.2};
  let calls=0; const ui=setup({search:'?P=1,-90',solve:(f,l)=>{calls++;return solve(f,l);}},fig); // P opens at 0 in frame 1
  const start=loadHandlePos(fig,ui.app.state,'P',0), point={x:start.x,y:start.y-0.1};
  pointer(ui,'pointerdown',start); pointer(ui,'pointermove',point);
  ui.button.fire('click'); ui.tick(250);
  near(+ui.handle().getAttribute('cx'),point.x); near(-ui.handle().getAttribute('cy'),point.y);
  assert.ok(ui.handle().classList.contains('is-held')); assert.equal(calls,3);
  pointer(ui,'pointerup',point); const done=calls; ui.tick(500); assert.equal(calls,done);
});
test('state stores inputs only through drag and animation', () => {
  const ui=setup(); ui.button.fire('click'); ui.tick(250);
  pointer(ui,'pointerdown',loadHandlePos(FIG1,ui.app.state,'P',ui.app.frac));
  assert.deepEqual(Object.keys(ui.app.state).sort(),['explodeTarget','lastAngle','loads']);
});

test('a stationary press during animation does not change loads or steal button focus', () => {
  let calls=0; const ui=setup({solve:(fig,loads)=>{calls++;return solve(fig,loads);}});
  const before=structuredClone(ui.app.state.loads), point=loadHandlePos(FIG1,ui.app.state,'P',0);
  pointer(ui,'pointerdown',point); ui.button.focus(); ui.button.fire('click');
  ui.tick(250); pointer(ui,'pointerup',point); ui.tick(500);
  assert.deepEqual(ui.app.state.loads,before); assert.equal(calls,1);
  assert.equal(document.activeElement,ui.button);
});

test('loads re-solve immediately during animation while unchanged loads reuse the solution', () => {
  let calls=0; const ui=setup({solve:(fig,loads)=>{calls++;return solve(fig,loads);}});
  ui.button.fire('click'); ui.tick(250);
  const tail=loadHandlePos(FIG1,ui.app.state,'P',ui.app.frac);
  pointer(ui,'pointerdown',tail);
  const point={x:tail.x,y:tail.y-0.2};
  pointer(ui,'pointermove',point);
  assert.equal(calls,2);
  assert.deepEqual(ui.app.solution,solve(FIG1,ui.app.state.loads));
  pointer(ui,'pointermove',point); assert.equal(calls,2);
  pointer(ui,'pointercancel',point); ui.tick(500); assert.equal(calls,2);
});

test('handle follows a real vertical member offset while animating (figure 2, EDC drops, ABC rises)', () => {
  const ui=setup({reducedMotion:()=>false},FIG2);
  const ed=FIG2.view.explode.EDC, abc=FIG2.view.explode.ABC;
  assert.ok(ed.dy<0 && abc.dy>0);
  const initial=loadHandlePos(FIG2,ui.app.state,'P',0);
  ui.button.fire('click'); ui.tick(250);
  // smoothstep(0.5) = 0.5: the load's member (EDC) is half way down, and so is its handle.
  near(+ui.handle().getAttribute('cx'),initial.x+ed.dx*0.5); near(-ui.handle().getAttribute('cy'),initial.y+ed.dy*0.5);
  ui.tick(500);
  near(-ui.handle().getAttribute('cy'),initial.y+ed.dy);
});

test('the status live region persists across redraws and mirrors the lift-off text', () => {
  const ui=setup({},FIG4), status=ui.status;
  assert.equal(status.textContent,'');
  ui.app.setLoad('P',{vec:{x:0,y:120},lastAngle:Math.PI/2});
  ui.app.redraw();
  assert.equal(ui.root.querySelector('#status'),status);
  assert.equal(status.textContent,'N sub C and N sub D lift off: no equilibrium.');
  ui.app.redraw(); ui.app.redraw();
  assert.equal(ui.root.querySelector('#status'),status);
  assert.equal(status.textContent,'N sub C and N sub D lift off: no equilibrium.');
  // The on-figure text stays, but the recreated node is no longer the live region.
  const line=ui.svg.querySelector('#liftoff');
  // The line shows real subscripts (NC and ND, lowered); its spoken form is the status text.
  assert.equal(line.textContent,'NC and ND lift off: no equilibrium.');
  assert.equal(line.getAttribute('aria-label'),status.textContent);
  assert.equal(line.getAttribute('aria-live'),null);
  ui.app.setLoad('P',{vec:{x:120,y:0},lastAngle:0});
  ui.app.redraw();
  assert.equal(ui.root.querySelector('#status'),status);
  assert.equal(status.textContent,'');
});

test('the status text is written only when the lift-off text changes', () => {
  const ui=setup({},FIG4);
  let writes=0, text=ui.status.textContent;
  Object.defineProperty(ui.status,'textContent',{get:()=>text,set:v=>{writes++; text=v;},configurable:true});
  ui.app.setLoad('P',{vec:{x:0,y:120},lastAngle:Math.PI/2});
  ui.app.redraw(); ui.app.redraw(); ui.app.redraw();
  assert.equal(writes,1);
});
