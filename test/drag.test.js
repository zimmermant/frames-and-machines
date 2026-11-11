import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, pointer, key, near } from './interaction-helpers.js';
import { FIG1 } from '../src/figures/fig1.js';
import { FIG2 } from '../src/figures/fig2.js';
import { FIG3 } from '../src/figures/fig3.js';
import { resolvePoint } from '../src/geometry.js';
import { dragLoad } from '../src/drag.js';
import { loadHandlePos } from '../src/scene.js';
import { byClass } from './scene-helpers.js';

test('drag sets vector = point of application − pointer, combined and exploded', () => {
  for(const exploded of [false,true]) {
    const ui=setup({reducedMotion:()=>true});
    if(exploded) ui.button.fire('click');
    const load=FIG1.loads[0], offset=exploded?FIG1.view.explode.AC:{dx:0,dy:0};
    if(exploded) assert.notEqual(offset.dx,0,'a zero offset would make the exploded branch vacuous');
    const point={x:load.at.x+offset.dx-FIG1.view.arrowPerForce,y:load.at.y+offset.dy};
    pointer(ui,'pointerdown',loadHandlePos(FIG1,ui.app.state,'P',ui.app.frac));
    pointer(ui,'pointermove',point); pointer(ui,'pointerup',point);
    near(ui.app.state.loads.P.x,1); near(ui.app.state.loads.P.y,0); // the scale is not a power of two: allow roundoff
    assert.equal(document.activeElement,ui.handle());
  }
});
test('exploded drag uses the real tuned offsets of figures 1-3 (non-zero, including vertical), not the unexploded position', () => {
  const angle=Math.PI/4; // on the 5 degree snap grid
  for(const fig of [FIG1,FIG2,FIG3]) for(const load of fig.loads) {
    const offset=fig.view.explode[load.member];
    assert.ok(offset.dx!==0 || offset.dy!==0,`${fig.id} ${load.member} has a zero explode offset`);
    const nominal=Math.hypot(load.nominal.x,load.nominal.y), vec={x:nominal*Math.cos(angle),y:nominal*Math.sin(angle)};
    const ui=setup({reducedMotion:()=>true},fig);
    ui.button.fire('click'); assert.equal(ui.app.frac,1);
    // The pointer is where the tail must be: point of application, carried by the member, minus the arrow.
    const at=resolvePoint(fig,load.at), s=fig.view.arrowPerForce;
    const point={x:at.x+offset.dx-vec.x*s,y:at.y+offset.dy-vec.y*s};
    pointer(ui,'pointerdown',loadHandlePos(fig,ui.app.state,load.name,1),{target:ui.handle(load.name)});
    pointer(ui,'pointermove',point,{target:ui.handle(load.name)});
    pointer(ui,'pointerup',point,{target:ui.handle(load.name)});
    near(ui.app.state.loads[load.name].x,vec.x,1e-9); near(ui.app.state.loads[load.name].y,vec.y,1e-9);
    // The same pointer position, read as if the member had not moved, gives a different load: the offset matters.
    const naive=dragLoad(fig,load.name,point,0,0).vec;
    assert.ok(Math.hypot(naive.x-vec.x,naive.y-vec.y)>1e-3*nominal,'offset made no difference');
    // And the drawn handle sits on the pointer.
    near(+ui.handle(load.name).getAttribute('cx'),point.x,1e-9); near(-ui.handle(load.name).getAttribute('cy'),point.y,1e-9);
  }
});
test('a press without movement changes nothing, even away from the handle centre', () => {
  const ui=setup(), before=structuredClone(ui.app.state);
  const tail=loadHandlePos(FIG1,ui.app.state,'P',0), point={x:tail.x+0.1,y:tail.y};
  pointer(ui,'pointerdown',point); pointer(ui,'pointermove',point); pointer(ui,'pointerup',point);
  assert.deepEqual(ui.app.state,before);
});
test('capture uses pointerId and held/dragging survive redraw, then clear on every exit', () => {
  for(const exit of ['pointerup','pointercancel','lostpointercapture']) {
    const ui=setup(), tail=loadHandlePos(FIG1,ui.app.state,'P',0);
    pointer(ui,'pointerdown',tail);
    assert.equal(ui.svg.capturedPointer,7); assert.ok(ui.handle().classList.contains('is-held'));
    assert.ok(ui.svg.classList.contains('is-dragging'));
    pointer(ui,'pointerdown',tail,{pointerId:8});
    pointer(ui,'pointermove',{x:0,y:0},{pointerId:8});
    pointer(ui,exit,tail,{pointerId:8});
    assert.deepEqual(ui.app.state.loads.P,{x:0,y:-1}); assert.equal(ui.svg.capturedPointer,7);
    pointer(ui,exit,tail);
    assert.equal(ui.svg.capturedPointer,null); assert.ok(!ui.handle().classList.contains('is-held'));
    assert.ok(!ui.svg.classList.contains('is-dragging'));
  }
});
test('handle at zero is focusable and draggable with both figure 1 loads at zero', () => {
  const ui=setup();
  for(const load of FIG1.loads) {
    pointer(ui,'pointerdown',loadHandlePos(FIG1,ui.app.state,load.name,0),{target:ui.handle(load.name)});
    pointer(ui,'pointermove',load.at); pointer(ui,'pointerup',load.at);
  }
  assert.ok(Object.values(ui.app.solution.values).every(v=>Object.is(v,0)));
  assert.ok(byClass(ui.svg,'force').every(f=>byClass(f,'zero').length===1));
  assert.equal(ui.handle().getAttribute('tabindex'),'0');
  ui.handle().focus(); key(ui,'P','ArrowUp'); near(ui.app.state.loads.P.y,-0.05);
  key(ui,'P','ArrowDown');
  const at=FIG1.loads[0].at;
  pointer(ui,'pointerdown',at);
  pointer(ui,'pointermove',{x:at.x,y:at.y-FIG1.view.arrowPerForce});
  near(ui.app.state.loads.P.x,0); near(ui.app.state.loads.P.y,1);
});
test('client coordinates use the inverse SVG screen transform', () => {
  const ui=setup();
  ui.svg.getScreenCTM=()=>({inverse:()=>({a:0.5,b:0,c:0,d:0.5,e:-10,f:-20})});
  const at=FIG1.loads[0].at, scale=FIG1.view.arrowPerForce;
  pointer(ui,'pointerdown',{x:0,y:0});
  pointer(ui,'pointermove',{x:0,y:0},{clientX:2*(at.x-scale+10),clientY:2*(-at.y+20)});
  near(ui.app.state.loads.P.x,1); near(ui.app.state.loads.P.y,0);
});
