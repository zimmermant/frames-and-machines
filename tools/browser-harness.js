// Browser harness for the frames-and-machines pages. Adapted in shape from truss_sections/tools/browser-harness.js:
// H.all() is SYNCHRONOUS and returns { violations, sensitivity, budget, counts }. PASS = violations empty, sensitivity.flagged
// true, budget.ok true. Inject it into a loaded dist/frame-N.html (tools/run-harness.mjs does, at each viewport budget).
//
// It drives the page through the app's own hooks (globalThis.__frameApp: setLoad, frac, redraw), then measures the REAL
// rendered DOM in screen px (getScreenCTM, getBoundingClientRect): nothing here fakes the DOM or re-derives the layout.
//
// Sweep: every load at 72 directions x {0, 1, 1.5} x nominal, at explode frac 0 and 1. Figure 1 (two loads) also varies P and Q
// together and independently on a 24-direction grid, and over a 12 x 12 direction cross product at 1.5 x nominal.
// Checks, in every state: label~label, label~arrow, label~member, label~handle, label~support/pin, label~owner (near its own arrow), arrow~arrow, arrow~other member, member~member
// (exploded), everything inside the viewBox, rendered text >= 12 px, handle hit >= 44 px, and the budget (scroll).
// sensitivity() plants faults in the real page, one at a time, and requires the checks to NAME each one.
//
// SIM holds the numbers copied from src; test/harness.test.js fails if they drift.
(function () {
  const SIM = {
    minText: 12,            // px, every rendered text and tspan
    minHit: 44,             // px, a handle's hit circle
    directions: 72,         // 5 degree steps
    angleStepDeg: 5,        // = state.js snap step (Math.PI / 36)
    zeroSnap: 0.08,         // = state.js: below 0.08 x nominal snaps to 0
    cap: 1.5,               // = state.js LOAD_CAP: at most 1.5 x nominal
    magnitudes: [0, 1, 1.5],  // x nominal
    fineDirections: 24,     // figure 1's P/Q grid
    crossDirections: 12,    // figure 1's P x Q direction cross product (at 1.5 x nominal)
    viewports: [{ width: 375, height: 812 }, { width: 800, height: 750 }, { width: 1280, height: 720 }],
    noScrollAt: { width: 1280, height: 720 },
    tolerance: 0.75,        // px of contact allowed before an overlap counts (anti-aliasing, touching heads)
    // Nominal load vectors per page, as in src/figures/figN.js (loads[].nominal, in the figure's own force units).
    nominals: {
      1: { P: [0, -1], Q: [0, -1] },
      2: { P: [0, -20] },
      3: { P: [310, 0] },
      4: { P: [120, 0] },
      5: { P: [18, 0] },
      6: { P: [0, -12] }
    }
  };

  const $ = s => document.querySelector(s);
  const $$ = (s, root) => [...(root || document).querySelectorAll(s)];
  const app = () => { if (!globalThis.__frameApp) throw new Error('no globalThis.__frameApp: load a dist/frame-N.html page'); return globalThis.__frameApp; };

  // ---- 2-D geometry (screen px) --------------------------------------------------------------------------------------
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  function ptSeg(p, a, b) {
    const d = sub(b, a), l2 = d.x * d.x + d.y * d.y;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2));
    return Math.hypot(p.x - (a.x + t * d.x), p.y - (a.y + t * d.y));
  }
  function segsCross(p, q, r, s) {
    const d1 = cross(sub(q, p), sub(r, p)), d2 = cross(sub(q, p), sub(s, p));
    const d3 = cross(sub(s, r), sub(p, r)), d4 = cross(sub(s, r), sub(q, r));
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  function segSeg(p, q, r, s) {
    if (segsCross(p, q, r, s)) return 0;
    return Math.min(ptSeg(p, r, s), ptSeg(q, r, s), ptSeg(r, p, q), ptSeg(s, p, q));
  }
  const inRect = (p, R) => p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h;
  const corners = R => [{ x: R.x, y: R.y }, { x: R.x + R.w, y: R.y }, { x: R.x + R.w, y: R.y + R.h }, { x: R.x, y: R.y + R.h }];
  function segRect(a, b, R) {
    if (inRect(a, R) || inRect(b, R)) return 0;
    const c = corners(R);
    return Math.min(...c.map((p, i) => segSeg(a, b, p, c[(i + 1) % 4])));
  }
  const chainRect = (pts, R) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segRect(pts[i - 1], pts[i], R)); return pts.length === 1 ? (inRect(pts[0], R) ? 0 : Infinity) : d; };
  function chainChain(A, B) {
    let d = Infinity;
    for (let i = 1; i < A.length; i++) for (let j = 1; j < B.length; j++) d = Math.min(d, segSeg(A[i - 1], A[i], B[j - 1], B[j]));
    return d;
  }
  function pointInTri(p, t) {
    const d1 = cross(sub(t[1], t[0]), sub(p, t[0])), d2 = cross(sub(t[2], t[1]), sub(p, t[1])), d3 = cross(sub(t[0], t[2]), sub(p, t[2]));
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }
  function triRect(t, R) {
    if (t.some(p => inRect(p, R)) || corners(R).some(p => pointInTri(p, t))) return 0;
    return Math.min(segRect(t[0], t[1], R), segRect(t[1], t[2], R), segRect(t[2], t[0], R));
  }
  function triChain(t, pts) {
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) {
      if (pointInTri(pts[i - 1], t) || pointInTri(pts[i], t)) return 0;
      for (let k = 0; k < 3; k++) d = Math.min(d, segSeg(pts[i - 1], pts[i], t[k], t[(k + 1) % 3]));
    }
    return d;
  }
  const rectOverlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > SIM.tolerance &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > SIM.tolerance;

  // ---- measuring the rendered page -----------------------------------------------------------------------------------
  const rectOf = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  function toScreen(e, x, y) { const m = e.getScreenCTM(); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }
  const num = (e, k) => parseFloat(e.getAttribute(k));

  // A force's id: name, component, then ~ for the one arrow of a two-force member (it shares its letter with a roller or a
  // component on the same member, e.g. roller N_E and link force F_E on EDC), then @member.
  const forceId = g => `${g.getAttribute('data-name')}${g.getAttribute('data-sub') || ''}${g.getAttribute('data-role') === 'link' ? '~' : ''}@${g.getAttribute('data-member')}`;

  function measure() {
    const svg = $('#scene'), m = svg.getScreenCTM(), scale = m.a, vb = svg.viewBox.baseVal;
    const view = { x: m.e + m.a * vb.x, y: m.f + m.d * vb.y, w: m.a * vb.width, h: m.d * vb.height };
    const out = { scale, view, labels: [], arrows: [], members: [], handles: [], supports: [], grounds: [], pins: [], balls: [], texts: [] };
    for (const g of $$('.force-label', svg)) {
      const t = g.querySelector('text'); if (!t) continue;
      out.labels.push({ id: forceId(g), rect: rectOf(t) });
    }
    const lift = $('#liftoff', svg);
    if (lift && lift.textContent) out.labels.push({ id: 'liftoff line', rect: rectOf(lift) });
    for (const g of $$('.force', svg)) {
      const id = forceId(g);
      const kind = (g.getAttribute('class').match(/(load|reaction|pin)-force/) || [])[1];
      const line = g.querySelector('line'), poly = g.querySelector('polygon'), zero = g.querySelector('circle.zero');
      if (zero) {
        const c = toScreen(zero, num(zero, 'cx'), num(zero, 'cy')), r = num(zero, 'r') * scale;
        out.arrows.push({ id, kind, member: g.getAttribute('data-member'), zero: true, c, r, rect: { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r } });
      } else if (line && poly) {
        const a = toScreen(line, num(line, 'x1'), num(line, 'y1')), b = toScreen(line, num(line, 'x2'), num(line, 'y2'));
        const tri = poly.getAttribute('points').trim().split(/\s+/).map(p => { const [x, y] = p.split(',').map(Number); return toScreen(poly, x, y); });
        out.arrows.push({ id, kind, member: g.getAttribute('data-member'), zero: false, tail: a, base: b, tip: tri[0], tri, w: num(line, 'stroke-width') * scale });
      }
    }
    for (const g of $$('.g.member', svg)) {
      const p = g.querySelector('path'), L = p.getTotalLength(), n = Math.max(2, Math.ceil(L * scale / 5));
      const pts = []; for (let i = 0; i <= n; i++) { const q = p.getPointAtLength(L * i / n); pts.push(toScreen(p, q.x, q.y)); }
      out.members.push({ id: g.getAttribute('data-member'), pts, r: num(p, 'stroke-width') * scale / 2 });
    }
    for (const h of $$('.handle', svg)) {
      const ring = h.nextElementSibling;
      if (!ring || !ring.classList.contains('handle-ring')) throw new Error('a .handle must be followed by its .handle-ring');
      out.handles.push({ id: h.getAttribute('data-load'), hit: rectOf(h), ring: rectOf(ring), ringR: num(ring, 'r') * scale, haloR: num(ring.nextElementSibling, 'r') * scale,
        centre: { x: rectOf(ring).x + rectOf(ring).w / 2, y: rectOf(ring).y + rectOf(ring).h / 2 } });
    }
    for (const s of $$('.support', svg)) out.supports.push({ id: s.getAttribute('data-name'), rect: rectOf(s) });
    for (const g of $$('.ground', svg)) out.grounds.push({ id: g.getAttribute('data-surface'), rect: rectOf(g) });
    for (const c of $$('circle.pin', svg)) out.pins.push({ id: 'pin', rect: rectOf(c) });
    for (const c of $$('circle.ball', svg)) out.balls.push({ id: c.getAttribute('data-name'),
      c: toScreen(c, num(c, 'cx'), num(c, 'cy')), r: (num(c, 'r') + num(c, 'stroke-width') / 2) * scale });
    for (const t of $$('text', svg)) {
      if (t.id === 'liftoff' && !t.textContent) continue;
      const own = parseFloat(t.getAttribute('font-size')) * scale;
      out.texts.push({ id: t.textContent.slice(0, 24), px: own });
      for (const s of $$('tspan', t)) out.texts.push({ id: `${t.textContent.slice(0, 12)} / ${s.textContent}`, px: parseFloat(s.getAttribute('font-size')) * scale });
    }
    const btn = $('#explode'); out.button = btn ? { rect: rectOf(btn), px: parseFloat(getComputedStyle(btn).fontSize) } : null;
    return out;
  }

  // ---- the checks: each returns strings that start with the rule name -----------------------------------------------
  function arrowHitsRect(a, R, tol) {
    if (a.zero) return Math.hypot(Math.max(R.x, Math.min(a.c.x, R.x + R.w)) - a.c.x, Math.max(R.y, Math.min(a.c.y, R.y + R.h)) - a.c.y) < a.r - tol;
    return segRect(a.tail, a.base, R) < a.w / 2 - tol || triRect(a.tri, R) === 0;
  }
  function arrowHitsChain(a, pts, r, tol) {
    if (a.zero) return ptChain(a.c, pts) < r + a.r - tol;
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segSeg(a.tail, a.base, pts[i - 1], pts[i]));
    return d < r + a.w / 2 - tol || triChain(a.tri, pts) < r - tol;
  }
  function ptChain(p, pts) { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, ptSeg(p, pts[i - 1], pts[i])); return pts.length === 1 ? Math.hypot(p.x - pts[0].x, p.y - pts[0].y) : d; }
  const outside = (R, V, t) => R.x < V.x - t || R.y < V.y - t || R.x + R.w > V.x + V.w + t || R.y + R.h > V.y + V.h + t;

  function check(ms, ctx) {
    const v = [], tol = SIM.tolerance, V = ms.view, exploded = ctx.frac > 0.99;
    const L = ms.labels, A = ms.arrows, M = ms.members, Hs = ms.handles;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++)
      if (rectOverlap(L[i].rect, L[j].rect)) v.push(`label~label: ${L[i].id} overlaps ${L[j].id}`);
    // A label names one arrow, so it must sit by it: within one label height of that arrow's tail or shaft (or of its
    // dashed ring, for a zero force). Otherwise a student cannot tell which arrow it names.
    for (const l of L) {
      const own = A.find(a => a.id === l.id);
      if (!own) continue;
      let d = own.zero ? Math.max(0, Math.hypot(Math.max(l.rect.x, Math.min(own.c.x, l.rect.x + l.rect.w)) - own.c.x, Math.max(l.rect.y, Math.min(own.c.y, l.rect.y + l.rect.h)) - own.c.y) - own.r) : segRect(own.tail, own.tip, l.rect);
      // A contact force drawn inside its own ball is owned by the arrow and the ball's outline together: the ball carries the
      // label's meaning there, so a label hugging the ball counts as by its arrow.
      const ownBall = own.zero ? null : ms.balls.find(b => l.id.startsWith(b.id + '@') && Math.hypot(own.tail.x - b.c.x, own.tail.y - b.c.y) < b.r);
      if (ownBall) d = Math.min(d, Math.max(0, Math.hypot(Math.max(l.rect.x, Math.min(ownBall.c.x, l.rect.x + l.rect.w)) - ownBall.c.x, Math.max(l.rect.y, Math.min(ownBall.c.y, l.rect.y + l.rect.h)) - ownBall.c.y) - ownBall.r));
      // A load's arrow ends in its handle ring (drawn at the tail, centre on the tail), so that ring counts as part of its tail.
      const ring = own.kind === 'load' ? (Hs.find(h => l.id.startsWith(h.id + '@')) || { ringR: 0 }).ringR : 0;
      if (d - ring > l.rect.h) v.push(`label~owner: ${l.id} is ${(d - ring).toFixed(0)} px from its arrow (limit ${l.rect.h.toFixed(0)})`);
    }
    for (const l of L) {
      for (const a of A) if (arrowHitsRect(a, l.rect, tol)) v.push(`label~arrow: ${l.id} touches arrow ${a.id}`);
      for (const m of M) if (chainRect(m.pts, l.rect) < m.r - tol) v.push(`label~member: ${l.id} touches member ${m.id}`);
      for (const h of Hs) if (Math.hypot(Math.max(l.rect.x, Math.min(h.centre.x, l.rect.x + l.rect.w)) - h.centre.x, Math.max(l.rect.y, Math.min(h.centre.y, l.rect.y + l.rect.h)) - h.centre.y) < h.haloR - tol)
        v.push(`label~handle: ${l.id} touches handle ${h.id}`);
      for (const sp of ms.supports) if (rectOverlap(l.rect, sp.rect)) v.push(`label~support: ${l.id} touches support ${sp.id}`);
      for (const pn of ms.pins) if (rectOverlap(l.rect, pn.rect)) v.push(`label~pin: ${l.id} touches a pin`);
      for (const ball of ms.balls) if (Math.hypot(Math.max(l.rect.x, Math.min(ball.c.x, l.rect.x + l.rect.w)) - ball.c.x,
        Math.max(l.rect.y, Math.min(ball.c.y, l.rect.y + l.rect.h)) - ball.c.y) < ball.r - tol)
        v.push(`label~ball: ${l.id} touches ball ${ball.id}`);
      if (outside(l.rect, V, tol)) v.push(`label outside viewBox: ${l.id}`);
    }
    // Arrows. Shafts are trimmed by the head length at the tip: two arrows that MEET at a point (A_x, A_y) do not count;
    // two that lie on top of each other (roller E and E_x) do.
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const p = A[i], q = A[j];
      if (p.zero || q.zero) {
        const z = p.zero ? p : q, o = p.zero ? q : p;
        if (!o.zero && ptSeg(z.c, o.tail, o.base) < z.r + o.w / 2 - tol && ptSeg(z.c, o.tail, o.tip) > 2 * z.r) v.push(`arrow~arrow: ${p.id} overlaps ${q.id}`);
        continue;
      }
      // Two arrows that CROSS at an angle are fine (a dragged load may point through a support). Two that run the same
      // way, side by side or on top of one another (roller E and E_x), hide each other: flag parallel arrows (within
      // 10 degrees) whose heads would overlap sideways (< 9 px apart; a head is 11.4 px wide) and which share more
      // than 4 px of length. Arrows that only meet tip to tip, or at one point at a right angle, do not count.
      // Only arrows applied at the same neighbourhood (tips within 20 px) can hide one another; arrows far apart that happen
      // to lie on one line (loads dragged through a support, forces along a bar's axis) are coincidences, not clutter.
      if (p.kind === 'load' || q.kind === 'load' || Math.hypot(p.tip.x - q.tip.x, p.tip.y - q.tip.y) > 20) continue;
      const da = sub(p.tip, p.tail), db = sub(q.tip, q.tail), la = Math.hypot(da.x, da.y), lb = Math.hypot(db.x, db.y);
      if (!(la > 1 && lb > 1) || Math.abs(cross(da, db)) / (la * lb) >= Math.sin(10 * Math.PI / 180)) continue;
      const u = { x: da.x / la, y: da.y / la }, n = { x: -u.y, y: u.x };
      const along = pt => (pt.x - p.tail.x) * u.x + (pt.y - p.tail.y) * u.y, side = pt => (pt.x - p.tail.x) * n.x + (pt.y - p.tail.y) * n.y;
      const [q0, q1] = [along(q.tail), along(q.tip)].sort((x, y) => x - y);
      const overlap = Math.min(la, q1) - Math.max(0, q0), lateral = Math.min(Math.abs(side(q.tail)), Math.abs(side(q.tip)), Math.abs((side(q.tail) + side(q.tip)) / 2));
      if (overlap > 4 && lateral < 9) v.push(`arrow~arrow: ${p.id} overlaps ${q.id}`);
    }
    for (const a of A) {
      // Exploded, no reaction or pin arrow may run over a neighbouring member. (A load the student drags may point anywhere.)
      if (exploded && a.kind !== 'load') for (const m of M) if (m.id !== a.member && arrowHitsChain(a, m.pts, m.r, tol)) v.push(`arrow~member: ${a.id} crosses member ${m.id}`);
      const pts = a.zero ? [{ x: a.rect.x, y: a.rect.y }, { x: a.rect.x + a.rect.w, y: a.rect.y + a.rect.h }] : [a.tail, a.base, ...a.tri];
      for (const p of pts) if (p.x < V.x - tol || p.y < V.y - tol || p.x > V.x + V.w + tol || p.y > V.y + V.h + tol) { v.push(`arrow outside viewBox: ${a.id}`); break; }
    }
    if (exploded) for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++)
      if (chainChain(M[i].pts, M[j].pts) < M[i].r + M[j].r - tol) v.push(`member~member: ${M[i].id} overlaps ${M[j].id}`);
    for (const m of M) for (const p of m.pts) if (p.x - m.r < V.x - tol || p.y - m.r < V.y - tol || p.x + m.r > V.x + V.w + tol || p.y + m.r > V.y + V.h + tol) { v.push(`member outside viewBox: ${m.id}`); break; }
    for (const h of Hs) if (outside(h.ring, V, tol)) v.push(`handle outside viewBox: ${h.id}`);
    for (const s of ms.supports) if (outside(s.rect, V, 8 * ms.scale)) v.push(`support outside viewBox: ${s.id}`);
    for (const t of ms.texts) if (!(t.px >= SIM.minText)) v.push(`text <${SIM.minText}px: "${t.id}" is ${t.px.toFixed(1)} px`);
    for (const h of Hs) if (!(h.hit.w >= SIM.minHit - 0.01 && h.hit.h >= SIM.minHit - 0.01)) v.push(`handle <${SIM.minHit}px: ${h.id} is ${h.hit.w.toFixed(1)} px`);
    if (ms.button) {
      if (!(ms.button.rect.h >= SIM.minHit - 0.01 && ms.button.rect.w >= SIM.minHit - 0.01)) v.push(`handle <${SIM.minHit}px: button is ${ms.button.rect.w.toFixed(0)}x${ms.button.rect.h.toFixed(0)}`);
      if (!(ms.button.px >= SIM.minText)) v.push(`text <${SIM.minText}px: button is ${ms.button.px} px`);
    }
    return v;
  }

  // ---- the states ---------------------------------------------------------------------------------------------------
  const comp = (m, c) => Math.abs(c) < 1e-14 ? 0 : m * c;
  function* states(fig) {
    const names = fig.loads.map(l => l.name), nom = SIM.nominals[fig.id];
    if (!nom) throw new Error(`SIM.nominals has no page ${fig.id}`);
    const ang = k => k * SIM.angleStepDeg * Math.PI / 180;
    const set = (list, label) => ({ label, loads: list });   // list: [name, magnitude (x nominal), angle]
    const dirs = SIM.directions, fine = SIM.fineDirections, cross = SIM.crossDirections;
    // all loads together, 72 x {0,1,1.5}
    yield set(names.map(n => [n, 0, 0]), 'all zero');
    for (const m of SIM.magnitudes.filter(x => x > 0)) for (let k = 0; k < dirs; k++) yield set(names.map(n => [n, m, ang(k)]), `all ${m}x @${k * 5}`);
    if (names.length > 1) {
      const nomAngle = n => Math.atan2(nom[n][1], nom[n][0]);
      const stride = dirs / fine;
      for (const who of names) for (const other of [0, 1]) for (const m of SIM.magnitudes) for (let k = 0; k < fine; k++)
        yield set(names.map(n => n === who ? [n, m, ang(k * stride)] : [n, other, nomAngle(n)]), `${who} ${m}x @${k * stride * 5}, others ${other}x`);
      for (const m of SIM.magnitudes.filter(x => x > 0)) for (let k = 0; k < fine; k++)
        yield set(names.map(n => [n, m, ang(k * dirs / fine)]), `together ${m}x @${k * dirs / fine * 5}`);
      const cs = dirs / cross;
      for (let i = 0; i < cross; i++) for (let j = 0; j < cross; j++) yield { label: `cross P@${i * cs * 5} Q@${j * cs * 5}`, loads: [[names[0], SIM.cap, ang(i * cs)], [names[1], SIM.cap, ang(j * cs)]] };
    }
  }
  function apply(a, st, frac) {
    for (const [name, m, angle] of st.loads) {
      const load = a.fig.loads.find(l => l.name === name), n = Math.hypot(load.nominal.x, load.nominal.y) * m;
      a.setLoad(name, { vec: m === 0 ? { x: 0, y: 0 } : { x: comp(n, Math.cos(angle)), y: comp(n, Math.sin(angle)) }, lastAngle: angle });
    }
    a.frac = frac; a.redraw();
  }

  // ---- sensitivity: a checker that cannot see a planted fault proves nothing -----------------------------------------
  function sensitivity() {
    const a = app(), plants = {}, notes = [];
    const plantState = () => apply(a, { loads: a.fig.loads.map(l => [l.name, SIM.cap, Math.atan2(l.nominal.y, l.nominal.x)]) }, 1);
    plantState();
    const ctx = { frac: 1 };
    const base = new Set(check(measure(), ctx).map(s => s.split(':')[0]));
    const svg = $('#scene'), scale = svg.getScreenCTM().a;
    const run = (name, rule, mutate) => {
      plantState();
      let ok = false, detail = '';
      try { mutate(); const got = check(measure(), ctx).map(s => s.split(':')[0]); ok = got.includes(rule); detail = ok ? '' : `rule "${rule}" not raised (got ${[...new Set(got)].join(', ') || 'nothing'})`; }
      catch (e) { detail = `plant failed: ${e.message}`; }
      plants[name] = { flagged: ok && !base.has(rule), detail };
      a.redraw();
    };
    const groups = () => $$('.force', svg).filter(g => g.querySelector('line'));
    const texts = () => $$('.force-label text', svg);
    const setXY = (t, x, y) => { t.setAttribute('x', x); t.setAttribute('y', y); };
    const user = (e, p) => { const m = e.getScreenCTM().inverse(); return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }; };
    run('arrow outside the viewBox', 'arrow outside viewBox', () => { const l = groups()[0].querySelector('line'); l.setAttribute('x1', -999); l.setAttribute('y1', -999); });
    run('label overlapping a label', 'label~label', () => { const t = texts(); setXY(t[1], t[0].getAttribute('x'), t[0].getAttribute('y')); });
    run('text below 12 px', `text <${SIM.minText}px`, () => { const t = texts()[0]; t.setAttribute('font-size', 11 / scale); for (const s of $$('tspan', t)) s.setAttribute('font-size', 9 / scale); });
    run('handle below 44 px', `handle <${SIM.minHit}px`, () => { $('.handle').setAttribute('r', 20 / scale); });
    run('label on an arrow', 'label~arrow', () => {
      const l = groups()[0].querySelector('line'), m = { x: (num(l, 'x1') + num(l, 'x2')) / 2, y: (num(l, 'y1') + num(l, 'y2')) / 2 };
      setXY(texts()[0], m.x, m.y);
    });
    run('label on a member', 'label~member', () => {
      const m = measure().members[0], p = m.pts[Math.floor(m.pts.length / 2)], u = user($('.force-label text'), p);
      setXY(texts()[0], u.x, u.y);
    });
    run('label far from its arrow', 'label~owner', () => {
      const vb = svg.viewBox.baseVal, t = texts()[0], own = t.parentNode.getAttribute('data-name');
      // the corner of the view farthest from this label's arrow
      const ms = measure(), a = ms.arrows.find(x => x.id.startsWith(own)), tl = user(t, { x: ms.view.x + 4, y: ms.view.y + 24 }), br = user(t, { x: ms.view.x + ms.view.w - 40, y: ms.view.y + ms.view.h - 8 });
      const far = Math.hypot((a.tip || a.c).x - ms.view.x, (a.tip || a.c).y - ms.view.y) > Math.hypot((a.tip || a.c).x - ms.view.x - ms.view.w, (a.tip || a.c).y - ms.view.y - ms.view.h) ? tl : br;
      setXY(t, far.x, far.y);
    });
    // A label of a force drawn inside its ball may hug the ball, but one far from both ball and arrow is still flagged.
    if (measure().balls.length) run('ball label far from its ball', 'label~owner', () => {
      const ms = measure(), b = ms.balls.find(q => ms.arrows.some(a => !a.zero && a.id.startsWith(q.id + '@') && Math.hypot(a.tail.x - q.c.x, a.tail.y - q.c.y) < q.r));
      if (!b) throw new Error('no force is drawn inside its ball in the plant state');
      const t = $$('.force-label', svg).find(g => g.getAttribute('data-name') === b.id).querySelector('text');
      const far = { x: ms.view.x + (b.c.x < ms.view.x + ms.view.w / 2 ? ms.view.w - 40 : 4), y: ms.view.y + 24 };
      const u = user(t, far); setXY(t, u.x, u.y);
    });
    run('label on a support', 'label~support', () => {
      const g = measure().supports[0].rect, u = user($('.force-label text'), { x: g.x + g.w / 2, y: g.y + g.h / 2 });
      setXY(texts()[0], u.x, u.y);
    });
    if (measure().balls.length) run('label on a ball', 'label~ball', () => {
      const t = texts()[0], u = user(t, measure().balls[0].c);
      setXY(t, u.x, u.y);
    });
    run('arrow on an arrow', 'arrow~arrow', () => {
      // Make the second arrow an exact copy of the first: collinear and overlapping, like roller E on E_x.
      // The two LONGEST non-load arrows (a very short one, at a phone's scale, is under the checker's length floor).
      const len = x => { const l = x.querySelector('line'); return Math.hypot(num(l, 'x2') - num(l, 'x1'), num(l, 'y2') - num(l, 'y1')); };
      const g = groups().filter(x => !/load-force/.test(x.getAttribute('class'))).sort((p, q) => len(q) - len(p)), l1 = g[0].querySelector('line'), l2 = g[1].querySelector('line');
      for (const k of ['x1', 'y1', 'x2', 'y2']) l2.setAttribute(k, l1.getAttribute(k));
      g[1].querySelector('polygon').setAttribute('points', g[0].querySelector('polygon').getAttribute('points'));
    });
    const failed = Object.entries(plants).filter(([, p]) => !p.flagged).map(([k, p]) => `${k}: ${p.detail || 'also raised on the unplanted state'}`);
    return { flagged: failed.length === 0 && Object.keys(plants).length >= 4, plants, failedPlants: failed, notes };
  }

  // ---- budget (per window) --------------------------------------------------------------------------------------------
  function budgetNow() {
    const de = document.documentElement, here = { width: innerWidth, height: innerHeight }, f = [];
    if (de.scrollWidth > innerWidth + 0.5) f.push(`horizontal scroll (${de.scrollWidth} > ${innerWidth})`);
    const strict = here.width === SIM.noScrollAt.width && here.height === SIM.noScrollAt.height;
    const pageH = Math.max(de.scrollHeight, document.body.scrollHeight);
    if (strict && pageH > innerHeight + 0.5) f.push(`page scrolls at ${here.width}x${here.height} (${pageH} > ${innerHeight})`);
    return { fail: f, pageH, strict };
  }

  // ---- everything ---------------------------------------------------------------------------------------------------
  function all(want) {
    const a = app(), here = { width: innerWidth, height: innerHeight };
    if (want && (want.width !== here.width || want.height !== here.height)) {
      const msg = `the window is ${here.width}x${here.height}, not ${want.width}x${want.height}`;
      return { nonVacuity: { ok: false, failed: [msg] }, violations: [`window: ${msg}`], sensitivity: { flagged: false }, budget: { ok: false, error: msg, failed: [msg] }, counts: {} };
    }
    const counts = { states: 0, labels: 0, arrows: 0, members: 0, handles: 0, texts: 0, pairs: 0, liftOffStates: 0 };
    const seen = new Map(), violations = [], budgetFailed = new Set();
    let scrollMax = 0;
    for (const frac of [0, 1]) for (const st of states(a.fig)) {
      apply(a, st, frac);
      const ms = measure(), label = `fig${a.fig.id} frac=${frac} ${st.label}`;
      counts.states++; counts.labels += ms.labels.length; counts.arrows += ms.arrows.length; counts.members += ms.members.length;
      counts.handles += ms.handles.length; counts.texts += ms.texts.length;
      counts.pairs += ms.labels.length * (ms.labels.length - 1) / 2 + ms.labels.length * (ms.arrows.length + ms.members.length);
      if (a.solution && !a.solution.ok) counts.liftOffStates++;
      if (ms.labels.length < ms.arrows.length) violations.push(`${label}: only ${ms.labels.length} labels for ${ms.arrows.length} arrows`);
      for (const s of check(ms, { frac })) {
        const key = s;
        if (!seen.has(key)) { seen.set(key, label); violations.push(`${label}: ${s}`); }
      }
      const b = budgetNow(); scrollMax = Math.max(scrollMax, b.pageH); for (const s of b.fail) budgetFailed.add(s);
    }
    apply(a, { loads: a.fig.loads.map(l => [l.name, 1, Math.atan2(l.nominal.y, l.nominal.x)]) }, 0);
    const sens = sensitivity();
    apply(a, { loads: a.fig.loads.map(l => [l.name, 1, Math.atan2(l.nominal.y, l.nominal.x)]) }, 0);
    const failed = [...budgetFailed];
    // Non-vacuity: the sweep must really have run (state count from the sweep's own definition, independent of states()),
    // every arrow must have a label, and a figure with a one-sided contact must really have visited lift-off states.
    const expected = expectedStates(a.fig.loads.length), oneSided = [...a.fig.supports, ...a.fig.joints].some(c => c.oneSided);
    const nv = [];
    if (counts.states < expected) nv.push(`states ${counts.states} < expected ${expected}`);
    if (counts.labels < counts.arrows) nv.push(`labels ${counts.labels} < arrows ${counts.arrows}`);
    if (counts.arrows === 0 || counts.members === 0) nv.push('no arrows or members measured');
    if (oneSided && !(counts.liftOffStates > 0)) nv.push('figure has a one-sided contact but visited no lift-off state');
    counts.expectedStates = expected;
    return {
      nonVacuity: { ok: nv.length === 0, failed: nv },
      violations, violationCount: violations.length,
      sensitivity: sens,
      budget: { ok: failed.length === 0 && counts.states > 0, viewport: [here.width, here.height], failed, pageHeight: scrollMax },
      counts
    };
  }

  // Sweep size from SIM alone: per load count, over both explode fractions.
  function expectedStates(nLoads) {
    const mags = SIM.magnitudes.filter(m => m > 0).length, all = 1 + mags * SIM.directions;
    if (nLoads === 1) return 2 * all;
    const independent = nLoads * 2 * SIM.magnitudes.length * SIM.fineDirections;   // who varies x others {0,1} x magnitudes x dirs
    const together = mags * SIM.fineDirections, cross = SIM.crossDirections ** 2;
    return 2 * (all + independent + together + cross);
  }

  window.H = { expectedStates, SIM, all, sensitivity, measure, check, states, apply, budgetNow };
})();
