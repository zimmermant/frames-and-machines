# Frames and machines

**Live:** <https://zimmermant.github.io/frames-and-machines/>

Six interactive statics simulations show how applied loads change support reactions and forces between connected members. Each page runs offline in a browser, with no installation or network connection required. The diagrams show force directions and relative magnitudes without numeric values or units.

Open [the index](dist/index.html) to choose a frame:

- [Frame 1](dist/frame-1.html): two pinned members with independently adjustable loads P and Q.
- [Frame 2](dist/frame-2.html): a three-member frame with a wall roller.
- [Frame 3](dist/frame-3.html): a curved member and a straight link.
- [Frame 4](dist/frame-4.html): two arms with ball contacts C and D.
- [Frame 5](dist/frame-5.html): a three-member frame with a floor roller.
- [Frame 6](dist/frame-6.html): a three-member frame with a pin at C and a floor roller at F.

Each frame is a self-contained HTML file and can also be opened or shared on its own.

## Using a simulation

Drag the circle at a load's **tail** to change its size and direction. The arrowhead stays at the point where the force acts. Loads are red (P) and support reactions blue. All arrows on a page use the same length scale.

### Notation

Every force is **F with a subscript**, never a bare joint letter. x is right and y is up, and every arrow points in its true direction.

- Pin and support components: **F<sub>Ax</sub>**, **F<sub>Ay</sub>**.
- A **two-force member** (Frame 2 link BE, Frame 3 link BD, Frame 5 link BE; found from the figure data as a member with exactly two connections, no load and no contact) has **one arrow at each end, along the member**, named for the joint: **F<sub>B</sub>** at B, **F<sub>E</sub>** at E. The matching force on the other member at that pin is one arrow along the same line. A support on a two-force member (Frame 3, D) is one arrow along the member too, even in the combined view.
- Normal forces from rollers and balls are **N with the point**: N<sub>E</sub> (Frame 2), N<sub>F</sub> (Frames 5 and 6), N<sub>C</sub> and N<sub>D</sub> (Frame 4).
- The load stays **P** (and **Q** in Frame 1).

Spoken text uses the same names ("F sub A x", "N sub F"), with no digits or underscores.

### Third-law pairs

In the exploded view the two halves of each pin pair, and the two halves of a contact between two members (ball C in Frame 4), share one colour, and each pair has its own: magenta, green, amber or cyan. They differ from the load red and the ground-reaction blue and have at least 3:1 contrast on white. Lift-off grey overrides them.

Select **Explode** to separate the members into individual free-body diagrams and reveal the equal and opposite internal forces. Select **Combine** to bring the frame together again. You can drag loads in either view and reverse the animation while it is moving. Reduced-motion preferences are respected.

Use **Tab** to focus a load handle, then:

- **Left / Right:** rotate the load counterclockwise / clockwise by 5°.
- **Up / Down:** increase / decrease its magnitude by 5% of the starting load.
- With the **Explode / Combine** button focused, press **Enter** or **Space** to activate it.

Loads are capped at 1.5 times their starting magnitude. Drag directions snap to 5° increments, and dragging below 8% of the starting magnitude snaps the load to zero. The keyboard can reach small loads that a drag snaps to zero: **Up** from zero produces a 5% load. Left and Right at zero change the direction that Up will resume. A zero load retains its handle, so it remains draggable and keyboard accessible.

## Lift-off

The wall roller in Frame 2, balls C and D in Frame 4, and the floor rollers in Frames 5 and 6 can push but cannot pull. When equilibrium would require a pulling force at one of these contacts, the simulation opens a visible gap, replaces that contact's arrow with a dashed zero marker, greys the other reaction and pin-force arrows, and names the force in a message such as **“N<sub>D</sub> lifts off: no equilibrium.”** (spoken “N sub D lifts off: no equilibrium.”) Those grey arrows are not an equilibrium solution for the separated structure.

A force of exactly zero still counts as contact. Returning the load to a direction where all contacts can push closes the gap and restores the colours. Pins, including C in Frame 6, can act in either direction and do not lift off.

## Build and checks

Use Node.js 26. No npm dependencies are needed.

```sh
node build.js
node --test --test-reporter=tap test/*.test.js
node tools/mutations.mjs --dry
```

The build writes the six frame pages and index to `dist/`. Rebuilding the same sources produces byte-identical files. The mutation dry run checks that each intentional behavioural change applies uniquely and parses; it does not test whether the suite detects those changes.

The browser harness uses headless Microsoft Edge and Python 3 to serve the files locally. Set `EDGE_PATH` to your Edge executable if it is not at the default macOS installation location.

```sh
node tools/run-harness.mjs
node tools/run-harness.mjs --pages 4 --viewports 375,800,1280
node tools/run-harness.mjs --shots screenshots
```

The harness rebuilds automatically and checks load sweeps in combined and exploded views at phone, tablet and desktop sizes. It reports overlaps, arrow bounds, text and handle sizes, page budgets, and whether deliberately planted faults are detected. Add `--no-build` to check an existing build.

## Embedding

Each page has no frame-busting code, and GitHub Pages sends no frame-blocking headers, so a page can sit in an iframe (some learning-management systems restrict what an iframe may load; that is their setting):

```html
<iframe src="https://zimmermant.github.io/frames-and-machines/dist/frame-1.html"
        width="100%" height="750" style="border:0; max-width:800px"
        title="Frame 1: frames and machines" loading="lazy"></iframe>
```

## License

MIT; see [LICENSE](LICENSE).
