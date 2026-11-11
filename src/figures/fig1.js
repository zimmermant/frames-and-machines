export const FIG1 = {
  id: 1, title: 'Frame 1',
  points: { A: {x:0,y:0}, B: {x:12.4,y:0}, C: {x:9.65,y:7.8} },
  members: [
    { id:'AC', path:[{seg:'line',from:'A',to:'C'}], width:0.8 },
    { id:'CB', path:[{seg:'line',from:'C',to:'B'}], width:0.8 }
  ],
  supports: [
    { name:'A', at:'A', member:'AC', kind:'pin', surface:'floor' },
    { name:'B', at:'B', member:'CB', kind:'pin', surface:'floor' }
  ],
  joints: [{ name:'C', at:'C', members:['AC','CB'], kind:'pin' }],
  loads: [
    { name:'P', at:{x:0.466*9.65,y:0.466*7.8}, member:'AC', nominal:{x:0,y:-1} },
    { name:'Q', at:{x:9.65+0.62*(12.4-9.65),y:7.8*(1-0.62)}, member:'CB', nominal:{x:0,y:-1} }
  ],
  balls: [],
  // arrowPerForce: force-to-length scale (units per unit force), set so the worst case (each load up to 1.5x nominal in any
  // direction, alone or together) fits and typical arrows are clearly visible. Exploded: the members slide apart.
  // The viewBox and the px-per-unit scale are not stored: computeLayout() (layout.js) derives them from the figure's
  // bounds plus the worst-case arrow envelope and the window's size.
  // arrowMargin 0.33: the shared 0.2 leaves labels crowded at the pins (label~owner) at 1280x720; set by the harness sweep.
  view: { arrowMargin:0.33, arrowPerForce:1.52,
    explode:{ AC:{dx:-3,dy:0}, CB:{dx:3,dy:0} } }
};
