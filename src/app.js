import { render, liftOffText } from './scene.js';
import { solve } from './solve.js';
import { presetFromQuery, ease } from './state.js';
import { wireDrag, updateDrag } from './drag.js';
import { wireKeys } from './kbd.js';

// The optional platform hooks keep timing deterministic in the Node tests.
export function createApp(root, fig, options = {}) {
  const svg=root.querySelector('#scene'), button=root.querySelector('#explode'), status=root.querySelector('#status');
  let spoken=null;
  const requestFrame=options.requestAnimationFrame || (callback=>globalThis.requestAnimationFrame(callback));
  const cancelFrame=options.cancelAnimationFrame || (id=>globalThis.cancelAnimationFrame(id));
  const now=options.now || (()=>globalThis.performance.now());
  const reducedMotion=options.reducedMotion || (()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true);
  const solveLoads=options.solve || solve;
  const state=presetFromQuery(fig,options.search ?? globalThis.location?.search ?? '');
  const app={fig,svg,button,state,frac:state.explodeTarget,drag:null,solution:null};
  let frame=null;

  app.setLoad=(name,result)=>{
    const before=app.state.loads[name];
    app.state.lastAngle[name]=result.lastAngle;
    if (before.x===result.vec.x && before.y===result.vec.y) return;
    app.state.loads[name]=result.vec;
    app.solution=solveLoads(fig,app.state.loads);
  };
  app.redraw=()=>{
    const focused=svg.ownerDocument.activeElement;
    const keep=svg.contains(focused) ? focused?.getAttribute('data-load') : null;
    render(svg,fig,{loads:app.state.loads,held:app.drag?.name || null},app.solution,app.frac);
    if (keep) svg.querySelector(`[data-load="${keep}"]`)?.focus({preventScroll:true});
    // The live region lives outside the SVG (which every redraw recreates) and is written only when its text changes.
    const lift=liftOffText(fig,app.solution);
    if (status && lift!==spoken) { spoken=lift; status.textContent=lift; }
    button.textContent=app.state.explodeTarget ? 'Combine' : 'Explode';
    button.setAttribute('aria-pressed',String(app.state.explodeTarget===1));
  };
  app.toggleExplode=()=>{
    if (frame!==null) { cancelFrame(frame); frame=null; }
    const start=app.frac, target=1-app.state.explodeTarget;
    app.state.explodeTarget=target;
    const began=now(), duration=500*Math.abs(target-start);
    if (reducedMotion() || duration===0) {
      app.frac=target; updateDrag(app); app.redraw(); return;
    }
    const animate=timestamp=>{
      frame=null;
      const elapsed=timestamp-began;
      app.frac=reducedMotion() ? target : start+(target-start)*ease(elapsed/duration);
      // A moved pointer holds its tail in screen space while the member moves.
      // setLoad solves only if this actually changes the snapped vector.
      updateDrag(app);
      app.redraw();
      if (app.frac!==target) frame=requestFrame(animate);
    };
    app.redraw();
    frame=requestFrame(animate);
  };
  // The layout depends on the window: redraw (at the same state) when it is resized or rotated.
  if (typeof window!=='undefined' && window.addEventListener) window.addEventListener('resize',()=>app.redraw());
  button.disabled=false;
  button.addEventListener('click',()=>{ if (!button.disabled) app.toggleExplode(); });
  wireDrag(app);
  wireKeys(app);
  app.solution=solveLoads(fig,app.state.loads);
  app.redraw();
  return app;
}

// The inliner supplies FIGURE before this module; importing it in Node is inert.
// globalThis.__frameApp is the test hook the browser harness drives (setLoad, frac, redraw).
if (typeof document!=='undefined' && typeof FIGURE!=='undefined') globalThis.__frameApp=createApp(document,FIGURE);
