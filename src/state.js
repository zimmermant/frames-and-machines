// The largest load a student can set, in units of the textbook load (Todd, 2026-11-12: 1x, down from 1.5x; the same box then holds ~1.5x longer arrows).
export const LOAD_CAP=1;
// Angles are radians in figure coordinates (y up). Only user inputs live here;
// the application owns transient gestures, animation progress and its solve cache.
export function initialState(fig) {
  return {
    // A load opens at `start` when the figure gives one (frame 1 P: zero, Todd 2026-11-12), else at its textbook value.
    loads:Object.fromEntries(fig.loads.map(load=>[load.name,{...(load.start ?? load.nominal)}])),
    lastAngle:Object.fromEntries(fig.loads.map(load=>[load.name,Math.atan2(load.nominal.y,load.nominal.x)])),
    explodeTarget:0
  };
}

export function presetFromQuery(fig, search) {
  const state=initialState(fig);
  if (!search) return state;
  const params=new URLSearchParams(search);
  for (const load of fig.loads) {
    const fields=params.get(load.name)?.split(',');
    if (!fields || fields.length!==2 || fields.some(field=>field.trim()==='')) continue;
    const [fraction,degrees]=fields.map(Number);
    if (!Number.isFinite(fraction) || !Number.isFinite(degrees)) continue;
    const nominal=Math.hypot(load.nominal.x,load.nominal.y);
    const angle=degrees*(Math.PI/180);
    // The URL fraction is capped independently of the interactive load cap.
    const vector=loadVector(Math.max(0,Math.min(1,fraction))*nominal,angle);
    const result=snapLoad(vector,nominal,angle);
    state.loads[load.name]=result.vec;
    state.lastAngle[load.name]=result.lastAngle;
  }
  state.explodeTarget=params.get('view')==='exploded' ? 1 : 0;
  return state;
}

export function loadVector(magnitude, angle) {
  // Remove trigonometric roundoff on the cardinal axes, including negative zero.
  const component=v=>Math.abs(v)<1e-14 ? 0 : magnitude*v;
  return {x:component(Math.cos(angle)),y:component(Math.sin(angle))};
}

export function snapLoad(vec, nominal, lastAngle) {
  const magnitude=Math.min(LOAD_CAP*nominal,Math.hypot(vec.x,vec.y));
  if (magnitude<0.08*nominal || magnitude===0) return {vec:{x:0,y:0},lastAngle};
  const step=Math.PI/36;
  const angle=Math.round(Math.atan2(vec.y,vec.x)/step)*step;
  return {vec:loadVector(magnitude,angle),lastAngle:angle};
}

export function ease(t) {
  const clamped=Math.max(0,Math.min(1,t));
  return clamped*clamped*(3-2*clamped);
}
