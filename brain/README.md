# Neuroatlas — an interactive 3D brain

A rotatable model of the human brain for studying it: turn it through 360°,
click any structure to read what it does and what happens when it is damaged,
switch on the cutaway to see the deep structures sitting inside the cortex, and
run an action to watch a packet of activity travel the route the signal really
takes, pausing at each relay to explain what that structure contributes.

No build step, no network access, no mesh files.

## The brain is generated, not loaded

There is no model file in this repository. The cortex is built at load, in
about 200 ms:

1. An **icosphere** is subdivided to 40,962 vertices (81,920 triangles), on flat
   typed arrays.
2. Each vertex is pushed into the **silhouette of a cerebrum** — tapered at the
   frontal and occipital poles, widened low and in the middle where the temporal
   lobes hang, and floored with a soft minimum so the inferior surface is flat
   and rises at both ends.
3. The **named fissures** are cut as explicit grooves: the longitudinal fissure
   between the hemispheres, the Sylvian fissure above the temporal lobe, the
   central sulcus, the parieto-occipital sulcus and the preoccipital notch.
   These are the landmarks that make a folded object read as *a brain* rather
   than as a walnut.
4. The rest of the folding is **three octaves of ridged noise** — `1 - |simplex|`,
   squared — which produces rounded crests separated by sharp valleys. That is
   the shape of gyri and sulci; ordinary fractal noise gives bumps instead.
5. Displacement depth is baked into **vertex colour as ambient occlusion**, so
   sulci read as shadowed creases at any angle. This does more for realism than
   any material setting.

The cerebellum is generated the same way with far finer, parallel **folia** and
a raised midline **vermis**. The brainstem is a swept tube whose radius varies
along a curve, with the **pons swelling anteriorly** and carrying transverse
fibre bands. Deep structures are wobbled ellipsoids and swept tubes placed
anatomically — the hippocampus curls back from the amygdala, the corpus callosum
arches over the thalamus as a broad thin plate.

Lobes and functional areas are not separate meshes. Every cortical vertex is
classified **analytically from its position** against the same fissure
equations used to cut the grooves, and painted accordingly — which is also how
picking works: a ray hits a coarse invisible stand-in, and the lobe is computed
from the hit point rather than looked up per triangle. The full-detail cortex is
never ray-tested.

## Axes

`+y` superior, `+z` anterior, and therefore **`+x` is the anatomical left** —
in a right-handed frame, Left × Superior = Anterior. Getting this backwards puts
Broca's and Wernicke's areas in the wrong hemisphere, so it is worth stating.
Every paired structure's routing node sits at `+x`, so a pathway stays on one
side of the brain the way a real signal does, and viewing from `+x` gives the
left lateral view with anterior to the left — the orientation neuroanatomy
figures are drawn in.

## What's in it

**24 structures** — the four lobes, deep and limbic structures, brainstem and
cerebellum, and functional areas painted onto the cortex (motor and
somatosensory strips, prefrontal, Broca's, Wernicke's, A1, V1). Each carries a
summary, what it does, a clinical note on damage, and one fact worth keeping.

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
| Fall asleep | SCN → brainstem arousal → thalamic gating → slow waves → REM |
| Learn to ride a bike | prefrontal effort → cerebellar error correction → basal-ganglia chunking |

A pulse follows a Catmull-Rom curve through the structures' nodes, pausing at
each relay; around 500 neurons seeded inside the cortical volume fire
spontaneously and are excited by whatever passes them.

**Quiz mode** reads out a function and asks you to find and click the structure.
**Guided tour** walks the atlas, swinging the camera to whichever side each
structure faces. Search filters the list.

## Controls

| | |
| --- | --- |
| Drag | rotate through 360° |
| Scroll / pinch | zoom |
| Arrow keys | rotate without a mouse |
| Click | select a structure |
| Left / Front / Top / Midline | standard anatomical views |
| Cutaway | make the cortex translucent to reveal the deep structures |
| Auto-spin | slow rotation whenever you are not touching it |
| Esc | stop a running pathway, leave the quiz, close the help |

## Running it

Static, with Three.js vendored. Open `index.html`, or serve the folder:

```sh
npx serve brain
```

To publish it, enable GitHub Pages for this repository (Settings → Pages →
deploy from `main`); the app is served at `/brain/`.

| File | Contains |
| --- | --- |
| `index.html` | Page shell and panel structure |
| `styles.css` | All styling, including responsive and reduced-motion rules |
| `brain3d.js` | Noise, icosphere, silhouette, fissures, and every mesh builder |
| `data.js` | Region content, 3D placement and the pathway definitions |
| `app.js` | Scene, orbit rig, picking, labels, pulses and all interaction |
| `vendor/three.min.js` | Three.js r160, MIT, vendored so nothing is fetched |

## Accuracy

Proportions, positions and relationships are anatomical, and the pathways step
through the principal relays in the right order. The folds are not: they are
generated from noise, so they are plausible rather than anyone's in particular —
real gyral patterns differ between people and even between one person's two
hemispheres. This is a teaching model, not a scan. The clinical notes describe
real, well-documented cases and syndromes.
