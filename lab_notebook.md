# Lab notebook — frames_and_machines

Newest entry first.

## 2026-11-11 (evening) — first publish to GitHub Pages

**Summary**
- Todd: "publish to github".
- Created the public repo `zimmermant/frames-and-machines` (MIT) and published to Pages from `main` at `/`.
- Live: <https://zimmermant.github.io/frames-and-machines/>. The root `index.html` redirects to `dist/index.html`.
- The public history starts clean at bf9413d, built from an export of source `main` at 309f586 with `docs/` dropped.

**Checks**
- **Export:** 57 files. A grep for local paths, keys, emails and CLAUDE.md found only the `.gitignore` rules and relative paths. No `docs/`, `.superpowers/` or `.claude/` files are tracked.
- **Clone:** 131 tests pass, and a rebuilt `dist/` is byte-identical to source.
- **Live site:** all seven pages are byte-identical to the local build, and the root returns 200.
- **Live smoke test** (headless Edge at 1280×720, frame 6): the title is "Frame 6 — frames and machines", Explode works, and pair colours and labels render.
- **Not tried:** Firefox, Safari, a real phone, a Canvas iframe.

**Decisions (lead)**
- Repo name `frames-and-machines`, following the `zimmermant/<kebab-name>` convention.
- `LICENSE`, the root redirect and the README live address were committed to the source repo first, so later republishes keep them.

**Open / next**
- Todd's look-list (unchanged; see the entry below).
- Republish only by the guarded update method: clone, rsync, deletion guard, add a commit, never rewrite.

## 2026-11-12 — URL loads, 1× cap with longer arrows, less whitespace, point letters

**Summary**
- Todd embeds the pages on lecture slides and asked for four things: loads set from the URL, less whitespace round the frame, more noticeable arrows, and point letters. Spec: "Amendment 2026-11-12" in `docs/superpowers/specs/2026-11-10-frames-and-machines-design.md`; plan: `docs/superpowers/plans/2026-11-12-url-arrows-letters.md` (both local only). Branch `sim/url-arrows-letters` from `main`.
- **URL loads** (Task 1, Codex, 1ac9b73): `?P=<fraction>,<degrees>` per load (frame 1 also `Q`), fraction of the textbook load 0–1, degrees counterclockwise from +x; `view=exploded` opens exploded with no animation. Missing or unreadable → textbook value; values go through the drag's own snapping. README has a table with one example link per frame.
- **1× cap, longer arrows, less whitespace** (Task 2, Sonnet, 2ab7001): `LOAD_CAP` 1.5 → 1 and each figure's arrow scale re-chosen by `chooseArrowScale` (arrows ≈1.5× longer in the same box; fig 2 1.75× after its `arrowMargin` went 0.26 → 0.31). Body padding 4 px, svg outline removed, `MARGIN_PX` 34 → 30, `PAGE_RESERVE_PX` 96 → 62. Fig 6's load arrow on a phone: 9 → 16 px; at 1280: 37 → 59 px.
- **Point letters** (Task 3, Sonnet, fef346b): every single-capital point gets a dark-grey letter; exploded, one per carrying member (copies fade in with the explode fraction). The label placer now builds candidates lazily; with letters off its output equals the old placer over 2160 states. Harness checks `letter~point` (≤ 16 px from the member outline) and `letter~overlap`, each with a plant.
- 155 tests pass; mutation dry run 52 rows clean; harness 18 rows, 0 violations, every plant caught. Pages ≈ 67 KB, builds byte-reproducible (dist 0ac360e).

**Decisions**
- **Todd:** the frame stays static (no viewBox change on drag or explode); it is fine to lower the largest load to make room. Loads in the URL are fractions of the textbook load. A split pin shows its letter beside each half. "Same box": 1.5× arrows, not 2× in a bigger box.
- **Lead:** degrees counterclockwise from +x; names case-sensitive; `view=exploded` added for slides. Task 2's extra label-order retries were dropped: they tripled redraw time in exploded figs 1, 2, 4 and changed no placement. Fig 4 example link uses −45° because 90° lifts both balls (kept as a lift-off example in the README).

**Problems**
- Task 3's first placer rewrite was not output-identical: a capsule bounding-box pre-check grown by exactly r missed exact-tangent boxes through rounding (16 of 2160 states moved a label by a fraction of a px). Fixed by an epsilon pad; the reviewer's differential then gave 0 mismatches. The unit test added for it does not discriminate the epsilon; the differential (a scratch script) is what guards it.
- `letter~point` at 14 px failed by 1–2 px in crowded states; the limit is 16 px measured from the member outline (bars are ≈ 20 px wide at 1280).

**Open / next**
- Merge to `main` and republish need Todd's OK.
- Loads at 0.5× are not in the harness sweep (never were); at 0.5× a label on figs 1 and 2 sits ≈ 1 px past the owner limit.
- Remaining whitespace: at 1280×720 the frame is height-limited (blank sides; an iframe shaped to the frame removes it), and the combined view keeps the room the exploded pieces need.
- Fig 4 combined: letters C and D sit above their bars, opposite their balls.
- Mutation audit: 4 rows uncaught — "slider valuemax no longer matches the load cap" is now equivalent (100·LOAD_CAP with the cap at 1); "horizontal applied load moment sign" and "horizontal loads right-hand side" were already too blunt at HEAD; "lift-off requires equality" not checked at HEAD.
- Still on Todd's earlier look-list: ball C's arrows short; roller F's floor piece drops on lift-off; a finger on the figure cannot scroll the page.

## 2026-11-11 (later) — magenta pair colour; merged to main

**Summary**
- The first third-law pair colour is now magenta `#a21caf`; it was purple `#7c3aed`.
  - The notation review flagged purple as close to the ground-reaction blue `#1d4ed8` for colour-vision-limited viewers.
  - 131 tests pass, and all 18 harness rows show 0 violations.
- Todd approved merging `sim/frames-and-machines` into `main` ("Go ahead"). The merge does not cover publishing to GitHub, which still needs his separate OK.

**Open / next**
- Publishing (needs Todd's OK).
- Todd's look-list:
  - In the combined view, fig 2 fills 35 % and fig 4 49 %.
  - Ball C's arrows are short.
  - Roller F's floor piece drops on lift-off.
  - Fig 6's load arrow is about 9 px on a phone.
  - A finger on the figure cannot scroll the page.

## 2026-11-11 (later) — Notation amendment: two-force arrows, F/N labels, pair colours, figure 6 supports

**Summary**
- Spec: "Amendment 2026-11-11" in `docs/superpowers/specs/2026-11-10-frames-and-machines-design.md` (in the main repo).
- `src/solve.js`: `twoForceMembers(fig)` (a member with exactly two connections, no load, no contact; found from the data) and `displayForces(fig, forces)`. The solver is unchanged; the renderer and the layout both draw `displayForces`, which merges the x/y components at each end of a two-force member into ONE force along the member (projected onto the axis, equal to the solved sum to 1e-9), on both halves of the pin pair, and for a ground support on the member (fig 3 D, also in the combined view).
- Labels: F + subscript everywhere (F_Ax, F_Ay; F_B and F_E named for the joint), N + point for roller and ball normals (N_E, N_F, N_C, N_D), P stays. Subscripts are real lowered tspans; the spoken form is "F sub A x", "N sub F".
- Lift-off line is now drawn with real subscripts ("N_F lifts off: no equilibrium.") and its aria-label and the status region say "N sub F lifts off: no equilibrium."
- Pair colours: `PAIR_COLOURS` (magenta, green, amber, cyan), one per joint in figure order; both halves share it. Ground reactions stay blue, loads red, lift-off grey overrides.
- Figure 6: C is a full pin; F is a one-sided floor roller on ACF. Hand solution (P = 12 kN down at D): Ex=0, Ey=-2, N_F=14, A on ABE=(-1.5,-4), B on ABE=(1.5,6), C on BCD=(1.5,18). Derivation is in `test/solve.test.js`.

**Decisions**
- A data-role attribute (load, component, link, normal) on every force group distinguishes roller N_E from the link force F_E on the same member and joint letter; the harness id adds `~` for a link.
- The roller/pin SPLIT_PX display offset at fig 2 E is gone: the pin force at E is one arrow along BE, never parallel to the horizontal roller force.
- Checks changed because the requirement changed: the notation test (subscript is now the joint letter, not x/y), the lift-off wording tests, `unilateral` list (adds 6:F), the fig 6 slot test (replaced), the admissible-direction count for fig 6 (72 -> 36), the combined/exploded arrow counts, and the D-label envelope (now the real F/N width).

**Open / next**
- See the final report for the harness table and screenshots.

## 2026-11-11 — Task 6, mutation audit, final review

**Summary**
- **Task 6 landed** (579f2d6; dist rebuilt in 5bc87ab):
  - the README and `tools/rows-sim.mjs` with 35 mutation rows;
  - removed the scratch scale tools and the dead linalg helpers;
  - `aria-valuetext` on the load handles (direction in words);
  - tests for one-scale lengths, keyboard Left/Right at zero, and the lift-off ratio at 0.999;
  - balls are now label obstacles in both the placer and the harness.
- Full mutation audit: **all 35 rows caught**. The coverage list shows 39 tests that no row breaks; most are data and geometry sanity checks.
- **Final whole-branch review (Sonnet): ready to merge, no blockers.**
  - 118 tests pass, the committed dist matches the source, and all 18 harness rows show 0 violations.
  - Physics hand-checked: fig 2 E = 25, Ax = −25, Ay = 20; fig 4 C = 30, D = 80; fig 5 F = 20. Pin halves are equal and opposite.

**Decisions**
- **Todd:** fig 4 ball D keeps its textbook size (r 0.6). For a contact force whose arrow is drawn inside its own ball, the label must be within 18 px of the arrow *or the ball's edge*. Every other label is arrow-only. A Sonnet attempt that shrank the ball to r 0.27 to pass the label check was rejected because it no longer looked like the textbook figure.
- **Todd:** fix the final review's should-fix items: slider `aria-valuenow`/min/max, a persistent screen-reader live region for lift-off, "Frame N" page titles, and a test for fig 4 with only one ball lifting.
- **Todd:** this notebook stays in the public repo.
- **Lead:** Task 6 was finished by a Sonnet subagent instead of Codex, because herdr's registry failed ("registry writer stopped") and the Codex pane was lost.

**Problems**
- The Codex worker blocked on a sandbox permission prompt to run the browser harness. herdr then lost the pane, but the Codex process kept running and later edited files in the same worktree (an `alternatives` slot in the placer). The Sonnet agent found and removed that slot. The lead could not stop the process (the auto-mode classifier denied `kill`), so Todd killed it. Lesson: check `ps` for the worker before handing a worktree to a second writer.

**Open / next**
- The review fixes above are done (e99a39c, by Sonnet): 125 tests, 42 mutation rows (dry run clean, new rows each caught), and all 18 harness rows at 0 violations.
  - The fig 4 one-ball case is pinned: P = (−120, −40) lifts only D, and P = (120, 40) lifts only C.
  - The lifted contact keeps its raw signed value, and the scene greys the arrows.
- Next: ask Todd about merging to main and publishing.
- Still on Todd's look-list:
  - in the combined view, fig 2 fills 35 % and fig 4 49 % of the window;
  - ball C's arrows are short;
  - roller F's floor piece drops on lift-off;
  - fig 6's load arrow is 9 px on a phone;
  - a finger on the figure cannot scroll the page (`touch-action:none` on `#scene`).

## 2026-11-10 (later) — Tasks 2–5: renderer, interaction, harness, layout

**Summary**
- **Task 2 (Codex):** the SVG renderer.
  - Members draw as rounded bars, with pin, roller and wall supports, balls, and one-scale component arrows labelled with real subscripts.
  - A zero force is a dashed ring; on lift-off the other arrows grey out and a lift-off line appears.
  - The lead's round 1 added the wall for figure 2 (a wall-mounted pin at A and the roller E) and fixed the z-order, since supports had been hiding arrows.
- **Task 3 (Codex):**
  - Dragging the tail handle sets size and direction.
  - Keyboard: Left/Right turn 5°, Up/Down change the size by 5 %.
  - The 500 ms explode animation can reverse mid-slide, and the solution is cached between frames.
  - The lead verified it with real mouse events in headless Edge over CDP.
- **Task 4 (Sonnet):** the real-browser harness (`tools/run-harness.mjs` + `tools/browser-harness.js`).
  - It sweeps every load direction × {0, 1, 1.5}·nominal, combined and exploded, at 375×812, 800×750 and 1280×720.
  - 9 planted faults, and asserted non-vacuity counts.
  - Text and handles are a constant screen size, so the geometry fills the viewport.
  - Every label must sit within one label-height of its own arrow.
- **Task 5 (Sonnet):** Todd's size decision for all six figures, plus explode offsets, labels and lift-off gaps for figures 4–6. All 18 harness rows are clean.

**Decisions**
- **Todd:** the frames were too small on a laptop because the page reserved room for the worst-case arrows. Todd chose A+B: the load cap is now 1.5× (it was 2×), and each figure's arrow scale is computed so the exploded frame spans ≥ 60 % of the drawing. Spec call 2 is amended.
- **Lead:**
  - Tasks 4–5 ran on Sonnet instead of Codex, because the Codex sandbox has no browser and those tasks are browser-measured.
  - Keyboard steps bypass the 8 % drag snap, because otherwise Up from zero could never leave zero.

**Problems**
- A worker blocked on a permission prompt (a false "dangerous rm" from a long scratchpad path). The lead may not answer another session's prompt, so the prompt timed out and the worker continued.
- Two drag tests were vacuous while the explode offsets were zero placeholders. They were strengthened in Task 4.

**Open / next**
- **For Todd to look at:**
  - In the combined view, figure 2 fills only 35 % and figure 4 only 49 % (the layout is sized for the exploded view).
  - Ball C's arrows are short.
  - Roller F's floor piece drops on lift-off.
  - Figure 6's load arrow is about 9 px on a phone.
- Task 6: README, mutation rows and cleanup. Then the full mutation audit and the final whole-branch review. Merging to main needs Todd's OK.

## 2026-11-10 — Design, plan, Task 1 (figures + solver)

**Summary**
- Started six interactive frame FBD pages, one per textbook figure (two-bar A-frame with P and Q, wall bracket, curved bar, bent lever with balls, A-frame with a roller, A-frame with a slotted pin).
- The student drags each applied load (magnitude and direction; the point of application is fixed). Every support reaction and pin force is redrawn live to one arrow scale. **Explode / Combine** slides the members apart into one FBD per member.
- Task 1 landed: the figure data for all six frames, a general solver (3 equations per member, partial-pivot elimination), lift-off detection for one-sided contacts, and a 7-page build (6 frames + index). 59 tests.

**Decisions (Todd)**
- Drag changes magnitude and direction; the point of application stays fixed. No sliders.
- Arrows only, with symbol labels (Aₓ, C_y …) and no numeric values. No equations panel; the figure is the whole app.
- Reactions and pin forces are drawn as x and y components, pointing their true direction, with one shared length scale.
- Hosts: a laptop browser window or a phone (touch). No Canvas iframe.
- Explode slides apart in a smooth animation.
- Figure 4: point J is left off.
- One-sided contacts (the fig 4 balls C and D, the fig 2 roller E, the fig 5 roller F) cannot pull. When a load would make one pull, the app opens a gap, shows that force as zero, greys the other arrows, and prints "… lifts off: no equilibrium."

**Decisions (mine; listed in the spec as "calls")**
- No units or dimension lines, and the load range is 0–2× the textbook load with snap to zero below 8 % and 5° direction steps.
- Both halves of a pin pair carry the same name.
- Contact and slot forces are a single normal arrow.
- Pin forces appear only when exploded.
- The final review runs on Sonnet (Todd: no high-token models except for brainstorming, planning and delegating).

**Problems**
- agentctl spawn failed because the plan branch was checked out in the main tree. agentctl keeps the plan branch in `.worktrees/lead`, so the main checkout was returned to `main`.
- joint_explode's linalg only solved 2×2 systems; the Codex worker added general elimination.
- Figure 3's rounded A coordinate was off the arc, so A is now computed exactly as 1.4·(cos 30°, sin 30°).

**Checks**
- Hand-checked: fig 2 E = 25 kips, Aₓ = 25 kips left, A_y = 20 kips; fig 4 ball C = 30 lb, ball D = 80 lb; fig 5 F = 20 kN.
- The Sonnet reviewer approved and spot-checked mutations; it caught sign flips and the threshold change.

**Open / next**
- Task 2: the renderer (members, supports, arrows, labels, explode offsets, lift-off grey state). Then Task 3 interaction, Tasks 4–5 browser harness and tuning, Task 6 README and mutation rows.
- Deferred minors: trim linalg.js leftovers; nudge the lift-off ratio test off the floating-point edge.

**Sources**
- Textbook reference images live in `images/` (local only, not committed).
- Sibling apps used as the pattern: `../truss_sections`, `../joint_explode` (see their lab notebooks).
