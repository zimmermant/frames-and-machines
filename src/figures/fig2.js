export const FIG2 = {
  id: 2, title: 'Frame 2',
  points: { E:{x:0,y:0}, A:{x:0,y:4}, B:{x:5,y:2}, D:{x:5,y:0}, C:{x:10,y:0} },
  members: [
    { id:'ABC', path:[{seg:'line',from:'A',to:'C'}], width:0.7 },
    { id:'BE', path:[{seg:'line',from:'B',to:'E'}], width:0.6 },
    { id:'EDC', path:[{seg:'line',from:'E',to:'C'}], width:0.9 }
  ],
  supports: [
    { name:'A', at:'A', member:'ABC', kind:'pin', surface:'wall-left' },
    { name:'E', at:'E', member:'EDC', kind:'contact', surface:'wall-left', normal:{x:1,y:0}, oneSided:true, label:'Roller',
      drawAt:{ EDC:{x:-0.45,y:0} } }
  ],
  joints: [
    { name:'B', at:'B', members:['ABC','BE'], kind:'pin' },
    { name:'C', at:'C', members:['ABC','EDC'], kind:'pin' },
    { name:'E', at:'E', members:['BE','EDC'], kind:'pin' }
  ],
  loads: [{ name:'P', at:{x:5,y:0}, member:'EDC', nominal:{x:0,y:-20} }],
  balls: [],
  // arrowPerForce: as for figure 1. Exploded: ABC rises, EDC drops, BE stays between them.
  // The viewBox and the px-per-unit scale are not stored: computeLayout() (layout.js) derives them from the figure's
  // bounds plus the worst-case arrow envelope and the window's size.
  // arrowMargin 0.31 (was 0.26 at the 1.5x cap): at the 1x cap and MARGIN_PX 30 every smaller value leaves a label 1 px too far from its arrow at 375x812; set by the harness sweep.
  view: { arrowMargin:0.31, arrowPerForce:0.0765,
    explode:{ ABC:{dx:0,dy:3.6}, BE:{dx:0,dy:0}, EDC:{dx:0,dy:-3} } }
};
