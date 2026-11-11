// The largest load a student can set, in units of the textbook load (Todd, 2026-11-10: 1.5x).
export const LOAD_CAP=1.5;
// Angles are radians in figure coordinates (y up). Only user inputs live here;
// the application owns transient gestures, animation progress and its solve cache.
export function initialState(fig) {
  return {
    loads:Object.fromEntries(fig.loads.map(load=>[load.name,{...load.nominal}])),
    lastAngle:Object.fromEntries(fig.loads.map(load=>[load.name,Math.atan2(load.nominal.y,load.nominal.x)])),
    explodeTarget:0
  };
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
