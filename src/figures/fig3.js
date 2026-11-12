export const FIG3 = {
  id: 3, title: 'Frame 3',
  points: {
    A:{x:1.4*Math.cos(Math.PI/6),y:1.4*Math.sin(Math.PI/6)},
    B:{x:1.4,y:0}, C:{x:0,y:-1.4}, D:{x:1.96,y:-1.92}
  },
  members: [
    { id:'ABC', path:[{seg:'arc',center:{x:0,y:0},r:1.4,from:'C',to:'A',ccw:true}], width:0.2 },
    { id:'BD', path:[{seg:'line',from:'B',to:'D'}], width:0.16 }
  ],
  supports: [
    { name:'C', at:'C', member:'ABC', kind:'pin', surface:'floor' },
    { name:'D', at:'D', member:'BD', kind:'pin', surface:'floor' }
  ],
  joints: [{ name:'B', at:'B', members:['ABC','BD'], kind:'pin' }],
  loads: [{ name:'P', at:'A', member:'ABC', nominal:{x:310,y:0} }],
  balls: [],
  // arrowPerForce: as for figure 1. Exploded: the arc slides left and the link right, clear of each other's pin arrows.
  // The viewBox and the px-per-unit scale are not stored: computeLayout() (layout.js) derives them from the figure's
  // bounds plus the worst-case arrow envelope and the window's size.
  view: { arrowPerForce:0.00153,
    explode:{ ABC:{dx:-1.5,dy:0}, BD:{dx:1.5,dy:0} } }
};
