import { resolvePoint } from './geometry.js';
import { fromSvg } from './svg.js';
import { memberOffset } from './scene.js';
import { snapLoad } from './state.js';

export function pointerInFigure(svg, event) {
  // The inverse CTM includes responsive scale, page position and SVG letterboxing.
  const matrix=svg.getScreenCTM().inverse();
  return fromSvg({x:matrix.a*event.clientX+matrix.c*event.clientY+matrix.e,
    y:matrix.b*event.clientX+matrix.d*event.clientY+matrix.f});
}

export function dragLoad(fig, name, point, frac, lastAngle) {
  const load=fig.loads.find(l=>l.name===name), at=resolvePoint(fig,load.at);
  const offset=memberOffset(fig,load.member,frac), scale=fig.view.arrowPerForce;
  return snapLoad({x:(at.x+offset.dx-point.x)/scale,y:(at.y+offset.dy-point.y)/scale},
    Math.hypot(load.nominal.x,load.nominal.y),lastAngle);
}

export function updateDrag(app) {
  if (!app.drag?.moved) return;
  const {name,event}=app.drag;
  app.setLoad(name,dragLoad(app.fig,name,pointerInFigure(app.svg,event),app.frac,app.state.lastAngle[name]));
}

export function wireDrag(app) {
  const svg=app.svg;
  svg.addEventListener('pointerdown',event=>{
    const handle=event.target?.closest?.('[data-load]');
    if (app.drag || event.button!==0 || !handle || !svg.contains(handle) ||
        handle.getAttribute('aria-disabled')==='true') return;
    event.preventDefault();
    handle.focus({preventScroll:true});
    app.drag={name:handle.getAttribute('data-load'),pointerId:event.pointerId,
      origin:{x:event.clientX,y:event.clientY},event:{clientX:event.clientX,clientY:event.clientY},moved:false};
    // Capture on the persistent figure, never on a handle render() replaces.
    svg.setPointerCapture(event.pointerId);
    svg.classList.toggle('is-dragging',true);
    app.redraw();
  });
  function move(event) {
    if (!app.drag || event.pointerId!==app.drag.pointerId) return false;
    const drag=app.drag;
    drag.moved ||= event.clientX!==drag.origin.x || event.clientY!==drag.origin.y;
    drag.event={clientX:event.clientX,clientY:event.clientY};
    updateDrag(app);
    return true;
  }
  svg.addEventListener('pointermove',event=>{
    if (move(event)) { event.preventDefault(); app.redraw(); }
  });
  function finish(event, released) {
    if (!app.drag || event.pointerId!==app.drag.pointerId) return;
    if (released) move(event);
    app.drag=null;
    svg.classList.toggle('is-dragging',false);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    app.redraw();
  }
  svg.addEventListener('pointerup',event=>finish(event,true));
  svg.addEventListener('pointercancel',event=>finish(event,false));
  svg.addEventListener('lostpointercapture',event=>finish(event,false));
}
