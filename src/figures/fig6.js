export const FIG6 = {
  id: 6, title: 'Frame 6',
  points: { E:{x:0,y:0}, F:{x:1.8,y:0}, A:{x:0.9,y:1.8}, B:{x:0.3,y:0.6}, C:{x:1.5,y:0.6}, D:{x:2.1,y:0.6} },
  members: [
    { id:'ABE', path:[{seg:'line',from:'A',to:'E'}], width:0.1 },
    { id:'ACF', path:[{seg:'line',from:'A',to:'F'}], width:0.1 },
    { id:'BCD', path:[{seg:'line',from:'B',to:'D'}], width:0.08 }
  ],
  supports: [
    { name:'E', at:'E', member:'ABE', kind:'pin', surface:'floor' },
    // F is a one-sided floor roller on ACF (normal up); drawAt puts the arrow on the bar's lower surface, as in figure 5.
    { name:'F', at:'F', member:'ACF', kind:'contact', surface:'floor', normal:{x:0,y:1}, oneSided:true, label:'Roller',
      drawAt:{ ACF:{x:1.8,y:-0.05} } }
  ],
  joints: [
    { name:'A', at:'A', members:['ABE','ACF'], kind:'pin' },
    { name:'B', at:'B', members:['ABE','BCD'], kind:'pin' },
    { name:'C', at:'C', members:['BCD','ACF'], kind:'pin' }
  ],
  loads: [{ name:'P', at:{x:2.1,y:0.6}, member:'BCD', nominal:{x:0,y:-12} }],
  balls: [],
  // arrowMargin 0.15: at the shared 0.2 the long B arrows cross the neighbouring member (arrow~member). Exploded: ABE slides
  // left 1.1 and ACF right 1.4, so the pin pairs at B and C separate.
  view: { arrowMargin:0.15, arrowPerForce:0.013,
    explode:{ ABE:{dx:-1.1,dy:0}, ACF:{dx:1.4,dy:0}, BCD:{dx:0,dy:0} } }
};
