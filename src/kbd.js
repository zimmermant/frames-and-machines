import { loadVector, LOAD_CAP } from './state.js';

export function stepLoad(vec, nominal, key, lastAngle) {
  let magnitude=Math.hypot(vec.x,vec.y);
  let angle=magnitude ? Math.atan2(vec.y,vec.x) : lastAngle;
  if (key==='ArrowLeft') angle+=Math.PI/36;
  else if (key==='ArrowRight') angle-=Math.PI/36;
  else if (key==='ArrowUp') magnitude+=0.05*nominal;
  else if (key==='ArrowDown') magnitude-=0.05*nominal;
  else return {vec:{...vec},lastAngle};
  magnitude=Math.max(0,Math.min(LOAD_CAP*nominal,magnitude));
  if (magnitude<1e-12*nominal) magnitude=0;
  // Keyboard increments intentionally bypass the pointer's 8% zero snap:
  // otherwise Up from zero could never reach its first 5% step.
  return {vec:magnitude ? loadVector(magnitude,angle) : {x:0,y:0},lastAngle:angle};
}

export function wireKeys(app) {
  app.svg.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    const handle=event.target?.closest?.('[data-load]');
    if (!handle || !app.svg.contains(handle) || app.svg.ownerDocument.activeElement!==handle) return;
    event.preventDefault();
    if (app.drag || handle.getAttribute('aria-disabled')==='true') return;
    const name=handle.getAttribute('data-load'), load=app.fig.loads.find(l=>l.name===name);
    app.setLoad(name,stepLoad(app.state.loads[name],Math.hypot(load.nominal.x,load.nominal.y),
      event.key,app.state.lastAngle[name]));
    app.redraw();
  });
}
