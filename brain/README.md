# Neuroatlas — an interactive brain

A single-page, dependency-free web app for studying the human brain: click any
structure to read what it does and what happens when it is damaged, then run an
action and watch a packet of activity travel the route the signal really takes,
pausing at each relay to explain what that structure contributes.

## What's in it

**24 structures**, grouped as cerebral lobes, deep and limbic structures,
brainstem and cerebellum, and functional areas laid over the cortex (motor
strip, somatosensory strip, prefrontal, Broca's, Wernicke's, A1, V1). Each one
carries a summary, what it does, a clinical note on damage, and one fact worth
keeping.

**9 signal pathways**, each stepping through the structures involved in order:

| Action | What it traces |
| --- | --- |
| Catch a ball | retina → LGN → V1 → dorsal stream → PFC → M1 → cerebellum → cord |
| Hear your name | cochlea → cochlear nuclei → MGN → A1 → Wernicke's → limbic |
| Say a sentence | intention → Wernicke's → arcuate fasciculus → Broca's → M1 |
| Fear: a snake | the thalamic "low road" to amygdala vs. the cortical "high road" |
| Form a memory | cortical fragments → hippocampal binding → sleep replay → cortex |
| Smell coffee | the one sensory route that bypasses the thalamus |
| Touch something hot | the spinal reflex arc, and why pain arrives afterwards |
| Fall asleep | SCN → brainstem arousal nuclei → thalamic gating → slow waves → REM |
| Learn to ride a bike | prefrontal effort → cerebellar error correction → basal-ganglia chunking |

**A neuron field.** Around 130 neurons are seeded at random points that fall
inside the brain geometry (hit-tested with `SVGGeometryElement.isPointInFill`),
wired to their nearest neighbours. They fire spontaneously, and the travelling
signal excites whatever it passes.

**Quiz mode** reads out a function and asks you to click the structure;
**guided tour** walks the atlas in a sensible order; search filters the list and
dims non-matching structures on the diagram.

## Running it

It is static — no build step, no dependencies. Open `index.html`, or serve the
folder:

```sh
npx serve brain
```

To publish it, enable GitHub Pages for this repository (Settings → Pages →
deploy from `main`); the app will be served at `/brain/`.

## How it is put together

| File | Contains |
| --- | --- |
| `index.html` | Page shell and panel structure |
| `styles.css` | All styling, including the responsive and reduced-motion rules |
| `data.js` | Anatomy (SVG geometry), region content and the pathway definitions |
| `app.js` | Diagram construction, the canvas engine, and all interaction |

Geometry lives in a single 1000 × 730 user-space grid. The SVG and the canvas
overlay share that coordinate system exactly, so a point written in `data.js`
can be handed to either layer unchanged — the SVG draws the regions and handles
hit-testing and focus, the canvas draws neurons, trails and pulses.

Signal routes are built by fitting a Catmull-Rom spline through the `node`
points of the structures in a pathway, sampling it into a polyline with
cumulative arc lengths, and advancing a head along it by distance. Each original
node's position along the smoothed curve is recorded so the run can pause there
and fire the narration.

## Accuracy

The anatomy is schematic — a teaching diagram, not a scan. It is drawn as a
mid-sagittal cut (so deep structures are visible) with functional cortical
areas laid over the surface, which is a conventional simplification: in a real
mid-sagittal section you would not see the lateral surface areas at all.
Pathways are simplified to their principal relays. The clinical notes describe
real, well-documented cases and syndromes.
