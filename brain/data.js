/* ============================================================================
   Neuroatlas — anatomy, content and signal pathways.

   Geometry is 3D and brain-local, with 1.0 ~ 8cm:  +x right, +y superior,
   +z anterior. Each region carries a `node` (the point labels anchor to and
   signal pulses route through) and a `solid` describing how it is built:
   'cortex' territories are painted onto the cortical mesh, everything else
   gets real geometry. Paired structures set `mirror` and are built twice.
   Nodes sit at +x, the LEFT hemisphere, where language is lateralised, so a
   pathway stays on one side of the brain the way a real signal does.
   ========================================================================== */
(function (global) {
  'use strict';

  var GROUPS = [
    { id: 'lobes',      name: 'Cerebral lobes' },
    { id: 'limbic',     name: 'Deep & limbic structures' },
    { id: 'stem',       name: 'Brainstem & cerebellum' },
    { id: 'functional', name: 'Functional areas', note: 'Toggle "Functional areas" to see these on the diagram.' }
  ];

  var REGIONS = [

    /* ── Cerebral lobes ───────────────────────────────────────────────── */
    {
      id: 'frontal', name: 'Frontal Lobe', group: 'lobes', layer: 'cortex',
      color: '#6ea8ff', node: [0.44, 0.2, 0.66],
      solid: { kind: 'cortex' },
      summary: 'The largest lobe, and the last to finish wiring — it is not fully mature until the mid-twenties. Plans, decisions and movement commands are born here.',
      does: [
        'Planning, judgement and decision-making',
        'Voluntary movement, via the motor strip at its rear edge',
        'Working memory — holding something "in mind"',
        'Impulse control, motivation and personality',
        'Speech production (Broca’s area, usually on the left)'
      ],
      damage: 'In 1848 an iron rod blew through Phineas Gage’s frontal lobe. He survived, stayed mobile, articulate and intelligent — and became, in his friends’ words, "no longer Gage." Frontal damage rarely removes what you know. It removes what you would choose to do with it.',
      fact: 'The prefrontal cortex burns glucose faster than almost any other tissue in the body. Hard thinking is genuinely expensive.',
      quiz: 'plans ahead, holds back impulses, and issues voluntary movement commands'
    },
    {
      id: 'parietal', name: 'Parietal Lobe', group: 'lobes', layer: 'cortex',
      color: '#4fd6c2', node: [0.38, 0.56, -0.24],
      solid: { kind: 'cortex' },
      summary: 'Builds a map of your body and of the space around it, fusing touch, limb position and vision into a single coherent sense of "here".',
      does: [
        'Touch, temperature, pressure and pain (somatosensory cortex)',
        'Proprioception — knowing where your limbs are with your eyes shut',
        'Spatial attention and navigation',
        'The dorsal "where / how" visual stream that guides reaching',
        'Number sense and mental rotation'
      ],
      damage: 'Right parietal damage can cause hemispatial neglect: patients eat from one half of the plate and shave one side of the face. Not because they cannot see the other half — because that half of space has stopped existing for them.',
      fact: 'The body map here is wildly distorted. Lips and hands claim more cortex than the entire back and both legs combined. Drawn to scale, that map is the famous homunculus.',
      quiz: 'maps your body in space and receives touch and limb position'
    },
    {
      id: 'temporal', name: 'Temporal Lobe', group: 'lobes', layer: 'cortex',
      color: '#ffb454', node: [0.7, -0.38, 0.1],
      solid: { kind: 'cortex' },
      summary: 'Hearing, language comprehension and object recognition — and, folded inside it, the machinery that turns experience into memory.',
      does: [
        'Processing sound, rhythm and speech (auditory cortex)',
        'Understanding language (Wernicke’s area)',
        'Recognising objects and faces — the ventral "what" stream',
        'Houses the hippocampus and the amygdala'
      ],
      damage: 'Removing both medial temporal lobes left patient H.M. unable to form a single new conscious memory for 55 years, while his childhood, his IQ and his personality stayed intact. One operation proved that memory is a specific brain function, not a general property of mind.',
      fact: 'A patch here — the fusiform face area — answers to faces specifically. Damage it and vision stays perfect while your own family becomes unrecognisable: prosopagnosia.',
      quiz: 'processes sound and language, and contains the hippocampus'
    },
    {
      id: 'occipital', name: 'Occipital Lobe', group: 'lobes', layer: 'cortex',
      color: '#c78cff', node: [0.26, 0.06, -0.88],
      solid: { kind: 'cortex' },
      summary: 'Almost entirely devoted to vision. Signals arrive as edges, contrast and motion, and are assembled from there into a world.',
      does: [
        'Primary visual cortex (V1): orientation, edges, contrast',
        'Motion detection (V5/MT)',
        'Colour (V4)',
        'Depth and binocular fusion',
        'Feeds the "what" stream forward to the temporal lobe and the "where" stream up to the parietal'
      ],
      damage: 'Damage produces cortical blindness — healthy eyes, intact optic nerve, no sight. Some patients show blindsight: they report seeing nothing, yet reach for objects and avoid obstacles far better than chance.',
      fact: 'Roughly 30% of the cortex serves vision. Touch gets about 8%, hearing about 3%.',
      quiz: 'decodes vision first — edges, motion, colour and depth'
    },

    /* ── Deep & limbic ────────────────────────────────────────────────── */
    {
      id: 'corpuscallosum', name: 'Corpus Callosum', group: 'limbic', layer: 'deep',
      color: '#c3d2ea', node: [0.05, 0.31, -0.02],
      solid: { kind: 'callosum' },
      summary: 'Around 200 million fibres arching between the hemispheres — the largest bundle of white matter in the brain.',
      does: [
        'Carrying information between the left and right hemispheres',
        'Coordinating two-handed movement',
        'Sharing language, spatial and emotional processing across sides'
      ],
      damage: 'When it is cut to control severe epilepsy the result is a split brain: the left hand may unbutton a shirt the right hand has just buttoned, and the patient can name an object shown to the right visual field but not the same object shown to the left.',
      fact: 'It carries on the order of four billion signals a second.',
      quiz: 'connects the left and right hemispheres'
    },
    {
      id: 'basalganglia', name: 'Basal Ganglia', group: 'limbic', layer: 'deep',
      color: '#8be0a4', node: [0.245, 0.015, 0.055],
      solid: { kind: 'ellipsoid', r: [0.070, 0.145, 0.225], c: [0.245, 0.015, 0.055], wobble: 0.10, mirror: true },
      summary: 'Deep nuclei that select which action runs — and quietly compress actions you repeat into automatic habits.',
      does: [
        'Choosing and initiating movement; suppressing the alternatives',
        'Chunking sequences into skills and habits',
        'Reward learning, driven by dopamine',
        'Procedural memory — the "how", not the "what"'
      ],
      damage: 'Parkinson’s disease (too little dopamine reaching here) makes movement hard to start. Huntington’s disease (cell loss in the striatum) makes unwanted movement impossible to stop. Both are failures of selection, not of strength.',
      fact: 'Once a habit is chunked here the entire sequence fires as one unit — which is how you can drive a familiar route home and remember none of it.',
      quiz: 'turns repeated action sequences into automatic habits'
    },
    {
      id: 'thalamus', name: 'Thalamus', group: 'limbic', layer: 'deep',
      color: '#ffd166', node: [0.115, 0.02, -0.05],
      solid: { kind: 'ellipsoid', r: [0.085, 0.105, 0.190], c: [0.115, 0.020, -0.050], wobble: 0.07, mirror: true },
      summary: 'The switchboard. Every sense except smell stops here before it is allowed to reach the cortex.',
      does: [
        'Relaying vision, hearing, touch and taste to the cortex',
        'Gating what reaches awareness — it closes during deep sleep',
        'Regulating arousal and consciousness',
        'Running two-way loops with cortex that shape attention and expectation'
      ],
      damage: 'Fatal familial insomnia destroys thalamic nuclei. Patients progressively lose the ability to sleep at all and die, typically within about 18 months. There is no treatment.',
      fact: 'More fibres run from cortex down to thalamus than up from thalamus to cortex. The brain spends most of its bandwidth telling itself what to expect.',
      quiz: 'relays nearly every sense up to the cortex — every sense but smell'
    },
    {
      id: 'hypothalamus', name: 'Hypothalamus', group: 'limbic', layer: 'deep',
      color: '#ff9f6b', node: [0.062, -0.155, 0.045],
      solid: { kind: 'ellipsoid', r: [0.055, 0.048, 0.075], c: [0.062, -0.155, 0.045], wobble: 0.08, mirror: true },
      summary: 'Almond-sized, and it runs the body. Temperature, hunger, thirst, sleep, stress, hormones and drive all route through here.',
      does: [
        'Body temperature, hunger and thirst',
        'The circadian clock (suprachiasmatic nucleus)',
        'The stress axis, via the pituitary',
        'Sex drive, bonding and attachment hormones',
        'Autonomic fight-or-flight control'
      ],
      damage: 'Lesion one nucleus in an animal and it eats until it doubles its weight; lesion the neighbouring one and it stops eating entirely. The set point for an entire body lives in a structure the size of an almond.',
      fact: 'It is about 4 grams — roughly 0.3% of the brain — and it commands nearly every hormone you produce.',
      quiz: 'keeps the body in balance: temperature, hunger, thirst, sleep and stress'
    },
    {
      id: 'pituitary', name: 'Pituitary Gland', group: 'limbic', layer: 'deep',
      color: '#ff8fb1', node: [0, -0.3, 0.095],
      solid: [{ kind: 'ellipsoid', r: [0.052, 0.046, 0.052], c: [0, -0.300, 0.095], wobble: 0.05 }, { kind: 'tube', pts: [[0, -0.185, 0.055], [0, -0.245, 0.078], [0, -0.285, 0.092]], rN: 0.020, rB: 0.020 }],
      summary: 'The master gland, hanging from the hypothalamus on a stalk. It translates neural orders into hormones and releases them into the bloodstream.',
      does: [
        'Growth hormone',
        'The stress cascade: ACTH out, cortisol back',
        'Thyroid and reproductive hormones',
        'Oxytocin and vasopressin release'
      ],
      damage: 'A tumour here presses upward on the crossing optic fibres, so the first symptom is often a strange one: loss of peripheral vision on both sides.',
      fact: 'It is pea-sized, weighs about half a gram, and sits in its own bony pocket in the skull floor.',
      quiz: 'converts brain signals into hormones released to the bloodstream'
    },
    {
      id: 'hippocampus', name: 'Hippocampus', group: 'limbic', layer: 'deep',
      color: '#7cf3ff', node: [0.32, -0.36, -0.03],
      solid: { kind: 'tube', pts: [[-0.285, -0.375, 0.135], [-0.335, -0.400, -0.015], [-0.320, -0.330, -0.175], [-0.235, -0.230, -0.275]], rN: 0.052, rB: 0.046, mirror: true },
      summary: 'Named for its seahorse shape. It does not store your past — it binds experience into episodes and hands them to the cortex to keep.',
      does: [
        'Forming new episodic memories — events, with a time and a place',
        'Spatial navigation; it holds "place cells" that map where you are',
        'Replaying and consolidating memory during sleep',
        'Comparing what happens against what you predicted'
      ],
      damage: 'Lose both and childhood memories and skills survive, but no new conscious memory can be laid down: every conversation is the first one. Alzheimer’s disease begins here, which is exactly why recent memories go first and distant ones last.',
      fact: 'London taxi drivers who memorise 25,000 streets have measurably enlarged posterior hippocampi. The structure grows with use.',
      quiz: 'binds new experiences into lasting memories and maps where you are'
    },
    {
      id: 'amygdala', name: 'Amygdala', group: 'limbic', layer: 'deep',
      color: '#ff6b6b', node: [0.305, -0.335, 0.185],
      solid: { kind: 'ellipsoid', r: [0.075, 0.062, 0.085], c: [0.305, -0.335, 0.185], wobble: 0.11, mirror: true },
      summary: 'The threat detector. It stamps experience with emotional weight — and it gets the news before you consciously do.',
      does: [
        'Detecting threat and generating fear',
        'Emotional memory — why frightening moments are unforgettable',
        'Reading emotion in faces, especially the eyes',
        'Triggering the body’s stress response'
      ],
      damage: 'People with amygdala damage can lose fear almost entirely. One extensively studied patient handled snakes, toured haunted houses with curiosity rather than dread, and repeatedly failed to notice that a person was dangerous.',
      fact: 'It receives a rough copy of sensory input around 12 milliseconds before the cortex finishes identifying it. You jump at the stick before you know it is not a snake.',
      quiz: 'detects threat and flags experiences as emotionally important'
    },
    {
      id: 'olfactory', name: 'Olfactory Bulb', group: 'limbic', layer: 'deep',
      color: '#d8e06b', node: [0.095, -0.455, 0.7],
      solid: { kind: 'ellipsoid', r: [0.042, 0.032, 0.105], c: [0.095, -0.455, 0.700], wobble: 0.06, mirror: true },
      summary: 'The landing pad for smell — and the only sensory route that skips the thalamus entirely.',
      does: [
        'Detecting and sorting odour molecules',
        'Feeding smell straight into the amygdala and hippocampus',
        'Supplying most of what you experience as flavour'
      ],
      damage: 'A blow to the head can shear the delicate fibres passing through the skull floor. Smell goes, and with it most of taste — food becomes texture and temperature.',
      fact: 'Because it wires directly into emotion and memory, smell triggers recollection more suddenly and more vividly than any other sense.',
      quiz: 'takes in smell and bypasses the thalamus entirely'
    },

    /* ── Brainstem & cerebellum ───────────────────────────────────────── */
    {
      id: 'midbrain', name: 'Midbrain', group: 'stem', layer: 'stem',
      color: '#9be07a', node: [0, -0.27, -0.11],
      solid: { kind: 'stem', part: 'midbrain' },
      summary: 'The top of the brainstem: reflexive orienting to sights and sounds, and the dopamine cells that power movement and motivation.',
      does: [
        'Eye movement and pupil reflexes',
        'Reflexive turning toward sudden sights and sounds',
        'Substantia nigra — dopamine for movement',
        'Ventral tegmental area — dopamine for reward and motivation'
      ],
      damage: 'When the substantia nigra has lost 60–80% of its dopamine neurons, Parkinson’s disease becomes visible: tremor, rigidity, and movements that will not start.',
      fact: 'The flinch when something flies at your face is generated here — before visual cortex has finished working out what it was.',
      quiz: 'produces dopamine for movement and reflexively orients you to sudden events'
    },
    {
      id: 'pons', name: 'Pons', group: 'stem', layer: 'stem',
      color: '#7fd6a0', node: [0, -0.46, -0.125],
      solid: { kind: 'stem', part: 'pons' },
      summary: 'A bridge of fibres joining the cerebellum to the rest of the brain — and the switch that runs REM sleep.',
      does: [
        'Relaying signals between cortex and cerebellum',
        'Setting breathing rhythm alongside the medulla',
        'Generating REM sleep and dream paralysis',
        'Cranial nerves for the face, chewing, hearing and balance'
      ],
      damage: 'A stroke here can produce locked-in syndrome: consciousness entirely intact, every voluntary muscle silent except the eyes. Nothing has happened to the mind; every output channel but one has been cut.',
      fact: 'During REM the pons actively paralyses your muscles so you do not act out the dream. When that switch fails, people do.',
      quiz: 'bridges cortex and cerebellum, and switches on REM sleep'
    },
    {
      id: 'medulla', name: 'Medulla Oblongata', group: 'stem', layer: 'stem',
      color: '#63c98c', node: [0, -0.7, -0.21],
      solid: { kind: 'stem', part: 'medulla' },
      summary: 'The oldest and least negotiable part of the brain. It runs the things you would die without within minutes.',
      does: [
        'Heart rate and blood pressure',
        'Breathing',
        'Swallowing, coughing, sneezing, vomiting',
        'The point where most motor fibres cross to the opposite side of the body'
      ],
      damage: 'Serious damage is usually fatal. There is no cortical backup for breathing.',
      fact: 'That crossing point — the decussation of the pyramids — is the reason your left hemisphere moves your right hand.',
      quiz: 'controls heartbeat and breathing without any conscious input'
    },
    {
      id: 'spinal', name: 'Spinal Cord', group: 'stem', layer: 'stem',
      color: '#4fb98c', node: [0, -0.93, -0.23],
      solid: { kind: 'stem', part: 'spinal' },
      summary: 'The cable — and a processor in its own right. Reflexes are decided here, without consulting the brain.',
      does: [
        'Carrying motor commands down and sensory signals up',
        'Reflex arcs — pulling your hand off a hot pan',
        'Central pattern generators that produce the rhythm of walking'
      ],
      damage: 'Because signals are carried rather than generated here, the level of an injury predicts the loss: the higher the break, the more of the body is cut off from its own brain.',
      fact: 'The reflex that yanks your hand back from heat completes in about 30 ms. The pain arrives several hundred milliseconds later — you move first, and find out why afterwards.',
      quiz: 'runs reflex arcs and carries signals between brain and body'
    },
    {
      id: 'cerebellum', name: 'Cerebellum', group: 'stem', layer: 'stem',
      color: '#ff7a9c', node: [0.22, -0.46, -0.72],
      solid: { kind: 'cerebellum' },
      summary: 'The "little brain". Ten percent of brain volume, and more than half of all your neurons — roughly 69 billion of them.',
      does: [
        'Coordination, balance and posture',
        'Timing, and the smoothing of movement',
        'Motor learning — building a skill through repetition',
        'Predicting the sensory consequences of your own actions',
        'A growing recognised role in attention, timing and language'
      ],
      damage: 'Cerebellar damage causes ataxia: movements overshoot, undershoot and wobble. The strength is intact and the plan is intact — only the correction is missing. Speech turns slurred and oddly metered.',
      fact: 'A single Purkinje cell here can receive input from up to 200,000 other neurons — the most heavily connected cell in the body.',
      quiz: 'fine-tunes timing, balance and coordination, and learns motor skills'
    },

    /* ── Functional areas (overlay) ───────────────────────────────────── */
    {
      id: 'prefrontal', name: 'Prefrontal Cortex', group: 'functional', layer: 'area', parent: 'frontal',
      color: '#8fc0ff', node: [0.28, 0.18, 0.84],
      solid: { kind: 'cortex' },
      summary: 'The executive. Goals, self-control, and the ability to simulate a future you have not lived yet.',
      does: [
        'Setting goals and sequencing steps toward them',
        'Holding information in working memory',
        'Inhibiting the obvious, impulsive response',
        'Weighing consequences that have not happened yet',
        'Regulating the amygdala — talking yourself down'
      ],
      damage: 'Intelligence tests can stay perfectly normal while life falls apart: the patient can explain what they should do, and cannot make themselves do it.',
      fact: 'It is the last cortex to finish myelinating, around age 25 — which is a fair amount of the neuroscience behind teenage decision-making.',
      quiz: 'sets goals, holds back impulses, and imagines consequences'
    },
    {
      id: 'motor', name: 'Primary Motor Cortex', group: 'functional', layer: 'area', parent: 'frontal',
      color: '#ff9f43', node: [0.5, 0.5, -0.03],
      solid: { kind: 'cortex' },
      summary: 'The strip along the front edge of the central sulcus that issues movement commands, laid out body part by body part.',
      does: [
        'Sending the command for voluntary movement',
        'Mapping the body across the cortex — the motor homunculus',
        'Grading how much force a movement uses'
      ],
      damage: 'Damage here causes weakness or paralysis on the opposite side of the body, in exactly the body part whose patch was lost.',
      fact: 'Stimulate a point on this strip during awake brain surgery and a specific body part twitches. That is literally how the map was drawn.',
      quiz: 'sends the final command for voluntary movement'
    },
    {
      id: 'somatosensory', name: 'Somatosensory Cortex', group: 'functional', layer: 'area', parent: 'parietal',
      color: '#5ee0c8', node: [0.5, 0.5, -0.2],
      solid: { kind: 'cortex' },
      summary: 'The strip just behind the central sulcus, where touch arrives and is placed on the body map.',
      does: [
        'Locating touch, pressure, vibration and temperature on the body',
        'Registering limb position',
        'Distinguishing textures and shapes by feel'
      ],
      damage: 'Sensation on the opposite side of the body is lost or scrambled. Patients can still move a hand, but lose the feedback that makes fine movement possible.',
      fact: 'Phantom limb sensations arise partly here: neighbouring body parts on the map creep into the territory the missing limb used to occupy, so a touch on the cheek can be felt in an amputated hand.',
      quiz: 'receives touch and places it on the body map'
    },
    {
      id: 'broca', name: "Broca’s Area", group: 'functional', layer: 'area', parent: 'frontal',
      color: '#ffd166', node: [0.7, -0.16, 0.4],
      solid: { kind: 'cortex' },
      summary: 'Speech production: grammar, and the motor plan that turns an intention into moving lips.',
      does: [
        'Assembling grammar and word order',
        'Planning the mouth movements of speech',
        'Contributing to understanding complex sentence structure'
      ],
      damage: 'Broca’s aphasia makes speech effortful and telegraphic — "walk… dog" for "I am going to take the dog for a walk" — while comprehension stays largely intact. Patients know exactly what they mean to say, which is what makes it so distressing.',
      fact: 'In about 95% of right-handers this sits in the left hemisphere only. Language is the brain’s most lopsided function.',
      quiz: 'builds grammar and the motor plan for producing speech'
    },
    {
      id: 'wernicke', name: "Wernicke’s Area", group: 'functional', layer: 'area', parent: 'temporal',
      color: '#c78cff', node: [0.75, -0.06, -0.25],
      solid: { kind: 'cortex' },
      summary: 'Language comprehension — where sound becomes meaning.',
      does: [
        'Extracting meaning from heard and read words',
        'Choosing the right word when speaking',
        'Feeding meaning forward to Broca’s area along the arcuate fasciculus'
      ],
      damage: 'Wernicke’s aphasia produces speech that is fluent, well-formed, effortless — and empty. Comprehension is gone, including comprehension of the patient’s own sentences, so they often do not realise anything is wrong.',
      fact: 'Cut the arcuate fasciculus between Wernicke’s and Broca’s and both areas work fine on their own — but the patient can no longer repeat a sentence they have just clearly understood.',
      quiz: 'turns heard words into meaning'
    },
    {
      id: 'auditory', name: 'Primary Auditory Cortex', group: 'functional', layer: 'area', parent: 'temporal',
      color: '#ffb454', node: [0.73, -0.15, 0.06],
      solid: { kind: 'cortex' },
      summary: 'Where sound first reaches the cortex: frequency, timing and location.',
      does: [
        'Analysing pitch and loudness',
        'Timing differences between the two ears, which is how you locate a sound',
        'Separating speech from background noise'
      ],
      damage: 'Damage to both sides causes cortical deafness: the ears work, the brainstem responds, and nothing is heard.',
      fact: 'It is laid out tonotopically — low frequencies at one end, high at the other, like a piano keyboard stretched across the cortex.',
      quiz: 'first receives sound in the cortex, mapped by pitch'
    },
    {
      id: 'visual', name: 'Primary Visual Cortex (V1)', group: 'functional', layer: 'area', parent: 'occipital',
      color: '#b18cff', node: [0.19, 0, -0.94],
      solid: { kind: 'cortex' },
      summary: 'The first cortical stop for vision. Cells here fire for an edge at a particular angle, in a particular spot.',
      does: [
        'Detecting oriented edges and contrast',
        'Registering direction of motion',
        'Combining the two eyes into one image with depth',
        'Passing the result forward to the "what" and "where" streams'
      ],
      damage: 'A small lesion creates a scotoma — a hole in the visual field the patient usually does not notice, because the brain fills it in.',
      fact: 'Hubel and Wiesel won a Nobel Prize for recording single cells here and discovering that the brain does not receive pictures — it decomposes the world into oriented lines.',
      quiz: 'detects oriented edges and motion as the first cortical stop for vision'
    }
  ];

  /* External input/output nodes — the body, drawn outside the brain. */
  var EXTERNAL = [
    { id: 'eyes',    name: 'Eyes',           node: [0.30, -0.30,  1.26], icon: 'eye' },
    { id: 'nose',    name: 'Nose',           node: [0.12, -0.58,  1.18], icon: 'nose' },
    { id: 'ears',    name: 'Ear',            node: [0.96, -0.26,  0.02], icon: 'ear' },
    { id: 'skin',    name: 'Skin',           node: [1.34, -1.02,  0.40], icon: 'skin' },
    { id: 'muscles', name: 'Muscles',        node: [1.16, -1.28,  0.14], icon: 'muscle' },
    { id: 'blood',   name: 'Adrenal glands', node: [0.55, -1.30, -0.10], icon: 'drop' }
  ];

  global.BRAIN = { GROUPS: GROUPS, REGIONS: REGIONS, EXTERNAL: EXTERNAL };
})(window);

/* ============================================================================
   Signal pathways — what actually travels where, when the brain does a thing.
   Each step names the structure the packet arrives at and what it contributes.
   ========================================================================== */
(function (global) {
  'use strict';

  global.BRAIN.PATHWAYS = [
    {
      id: 'catch', name: 'Catch a ball', icon: '⚾', tag: 'sensorimotor',
      tagline: 'Photons in, muscle out, in about a fifth of a second.',
      steps: [
        { to: 'eyes',          text: 'Light lands on the retina. Photoreceptors turn photons into electrical spikes — the last purely optical step in the whole chain.' },
        { to: 'thalamus',      text: 'Fibres cross at the optic chiasm and arrive at the lateral geniculate nucleus of the thalamus, the relay that decides what gets forwarded.' },
        { to: 'visual',        text: 'V1 breaks the scene into oriented edges and directions of motion. Only now is there anything you could call an image.' },
        { to: 'occipital',     text: 'Surrounding visual areas add colour, depth and trajectory: a round object, approaching, fast.' },
        { to: 'parietal',      text: 'The dorsal "where / how" stream computes where the ball will be — not where it is. Catching a ball means aiming at the future.' },
        { to: 'prefrontal',    text: 'Prefrontal cortex commits: catch it. One decision, and the alternatives are suppressed.' },
        { to: 'motor',         text: 'The motor strip fires the command for shoulder, elbow, wrist and fingers — in that order, from its body map.' },
        { to: 'cerebellum',    text: 'The cerebellum compares the plan against incoming feedback and corrects mid-flight, so the hand closes exactly when the ball arrives.' },
        { to: 'medulla',       text: 'The command descends the brainstem and crosses to the opposite side of the body.' },
        { to: 'spinal',        text: 'Down the spinal cord to the motor neurons of the arm.' },
        { to: 'muscles',       text: 'Muscles contract. Caught — roughly 200 ms after the first photon landed.' }
      ]
    },
    {
      id: 'hear', name: 'Hear your name', icon: '👂', tag: 'language',
      tagline: 'Air pressure becomes a word, and the word becomes you.',
      steps: [
        { to: 'ears',          text: 'Air pressure waves bend hair cells in the cochlea. Each cell is tuned to its own frequency, so sound is split into bands before it ever reaches the brain.' },
        { to: 'medulla',       text: 'Cochlear nuclei in the brainstem compare the two ears — microsecond timing differences are how you know which direction it came from.' },
        { to: 'midbrain',      text: 'The inferior colliculus reflexively orients your head toward the sound, before you have identified it.' },
        { to: 'thalamus',      text: 'The medial geniculate nucleus relays the sound upward, filtering hard: most background noise stops here.' },
        { to: 'auditory',      text: 'Primary auditory cortex resolves pitch, rhythm and timbre. It is sound now, not yet language.' },
        { to: 'wernicke',      text: 'Wernicke’s area matches the pattern to a stored word — and this one is a name. Your name.' },
        { to: 'amygdala',      text: 'The amygdala flags it as personally relevant, which is why your own name cuts through a noisy room.' },
        { to: 'hippocampus',   text: 'The hippocampus ties it to context: who calls you that, and where you are.' },
        { to: 'prefrontal',    text: 'Prefrontal cortex reallocates attention. You turn around.' }
      ]
    },
    {
      id: 'speak', name: 'Say a sentence', icon: '🗣️', tag: 'language',
      tagline: 'Meaning to grammar to muscle, three words a second.',
      steps: [
        { to: 'prefrontal',    text: 'Prefrontal cortex forms the intention — the thing you mean, still wordless.' },
        { to: 'wernicke',      text: 'Wernicke’s area selects the words that carry it.' },
        { to: 'parietal',      text: 'The arcuate fasciculus carries the word forms forward beneath the parietal cortex. Cut this bundle and you understand perfectly but cannot repeat a sentence.' },
        { to: 'broca',         text: 'Broca’s area builds the grammar and the motor program: which sounds, in which order, at which speed.' },
        { to: 'motor',         text: 'The motor strip drives more than 100 muscles of lips, tongue, jaw, larynx and breath, coordinated to the millisecond.' },
        { to: 'cerebellum',    text: 'The cerebellum meters the timing. Damage it and speech becomes slurred and oddly scanned — every syllable the same length.' },
        { to: 'pons',          text: 'Cranial nerves leave the pons and medulla for the face and throat.' },
        { to: 'muscles',       text: 'Vocal folds vibrate, the mouth shapes the stream. About three words per second, and you never thought about a single muscle.' }
      ]
    },
    {
      id: 'fear', name: 'Fear: a snake on the path', icon: '🐍', tag: 'emotion',
      tagline: 'The low road and the high road — you jump before you know why.',
      steps: [
        { to: 'eyes',          text: 'A curved shape on the ground. The retina sends it on before anything has been identified.' },
        { to: 'thalamus',      text: 'The thalamus splits the signal in two and sends it down two different routes at two different speeds.' },
        { to: 'amygdala',      text: 'LOW ROAD — a crude, fast copy reaches the amygdala in about 12 ms. You freeze. You have not yet seen anything.' },
        { to: 'hypothalamus',  text: 'The hypothalamus fires the autonomic response: heart rate up, pupils wide, blood to the legs.' },
        { to: 'pituitary',     text: 'The pituitary releases ACTH into the bloodstream.' },
        { to: 'blood',         text: 'Adrenal glands flood the blood with adrenaline and cortisol. Your body is committed, milliseconds before your mind is.' },
        { to: 'visual',        text: 'HIGH ROAD — meanwhile the visual cortex has been doing the slow, careful work of actually looking.' },
        { to: 'temporal',      text: 'The ventral stream identifies the object: coiled, green, ribbed. A garden hose.' },
        { to: 'prefrontal',    text: 'Prefrontal cortex overrules the amygdala and shuts the alarm off. Your heart keeps pounding for another thirty seconds anyway — the hormones are already in the blood.' }
      ]
    },
    {
      id: 'memory', name: 'Form a memory', icon: '💾', tag: 'memory',
      tagline: 'Scattered fragments, bound once, then rewritten into cortex over years.',
      steps: [
        { to: 'visual',        text: 'The scene arrives as fragments, and they are stored apart: colour in one patch of cortex, motion in another, faces in a third.' },
        { to: 'temporal',      text: 'The ventral stream identifies what you are looking at and hands the pieces on.' },
        { to: 'hippocampus',   text: 'The hippocampus binds the fragments into one episode and stamps it with a time and a place. This is the step that makes it a memory rather than a perception.' },
        { to: 'amygdala',      text: 'The amygdala adds emotional weight. Emotionally charged events are recalled more vividly and more durably — not always more accurately.' },
        { to: 'prefrontal',    text: 'Prefrontal cortex holds it in working memory while you are still living it.' },
        { to: 'thalamus',      text: 'The circuit loops back through thalamic nuclei, strengthening the trace each time round.' },
        { to: 'hippocampus',   text: 'That night, during slow-wave sleep, the hippocampus replays the episode at high speed — sometimes twenty times faster than it happened.' },
        { to: 'parietal',      text: 'Each replay copies a little more of it into cortex. After years the memory is cortical and the hippocampus is no longer needed — which is why the distant past survives when it is destroyed.' }
      ]
    },
    {
      id: 'smell', name: 'Smell coffee', icon: '☕', tag: 'sensory',
      tagline: 'The one sense that skips the switchboard and lands in emotion first.',
      steps: [
        { to: 'nose',          text: 'Volatile molecules dissolve in the nasal mucus and bind receptors. You have roughly 400 types, and they combine to distinguish something on the order of a trillion odours.' },
        { to: 'olfactory',     text: 'The olfactory bulb sorts the pattern — and then does something no other sense does: it skips the thalamus completely.' },
        { to: 'amygdala',      text: 'The signal lands in the amygdala directly. That single wiring shortcut is why a smell hits emotion before you have identified it.' },
        { to: 'hippocampus',   text: 'And in the hippocampus — which is why one smell can drop you into a specific afternoon from twenty years ago, with no effort at all.' },
        { to: 'prefrontal',    text: 'Only now does orbitofrontal cortex put a name on it: coffee. The feeling arrived several steps before the word.' }
      ]
    },
    {
      id: 'pain', name: 'Touch something hot', icon: '🔥', tag: 'sensorimotor',
      tagline: 'Your hand is already moving before your brain has been told.',
      steps: [
        { to: 'skin',          text: 'Free nerve endings in the skin fire. Damage signalling starts immediately.' },
        { to: 'spinal',        text: 'REFLEX ARC — the spinal cord makes the decision itself: sensory neuron, interneuron, motor neuron, out. No brain involved.' },
        { to: 'muscles',       text: 'The arm withdraws in about 30 milliseconds. You have not yet felt anything.' },
        { to: 'medulla',       text: 'Meanwhile the signal climbs the spinal cord and crosses in the brainstem.' },
        { to: 'thalamus',      text: 'The thalamus relays it upward and, in parallel, to the emotional structures — which is why pain is unpleasant as well as informative.' },
        { to: 'somatosensory', text: 'Somatosensory cortex places it on the body map: back of the left hand, this exact patch.' },
        { to: 'prefrontal',    text: 'And only here does it hurt. Pain is constructed by the brain, several hundred milliseconds after the hand has already moved.' }
      ]
    },
    {
      id: 'sleep', name: 'Fall asleep', icon: '🌙', tag: 'state',
      tagline: 'The switchboard closes, and the cortex starts talking to itself.',
      steps: [
        { to: 'hypothalamus',  text: 'The suprachiasmatic nucleus reads the light — or the lack of it — and calls time. Melatonin rises.' },
        { to: 'midbrain',      text: 'Arousal nuclei in the upper brainstem, which have been holding the cortex awake all day, begin to fall silent.' },
        { to: 'thalamus',      text: 'The thalamus closes the gate. Sensory traffic keeps arriving and stops being forwarded — this is the moment the world goes away.' },
        { to: 'parietal',      text: 'Cortex, no longer driven from outside, slips into slow synchronised waves. Millions of neurons firing in unison instead of independently.' },
        { to: 'hippocampus',   text: 'During those slow waves the hippocampus replays the day to the cortex. Sleep is when memory is written, not paused.' },
        { to: 'pons',          text: 'Then the pons flips the REM switch: it wakes the cortex to near-waking activity and paralyses the body at the same time. You dream.' }
      ]
    },
    {
      id: 'habit', name: 'Learn to ride a bike', icon: '🚲', tag: 'learning',
      tagline: 'Effortful, then automatic — and the change is a change of address.',
      steps: [
        { to: 'prefrontal',    text: 'At first prefrontal cortex micromanages every wobble. It is exhausting because you are consciously running a process that has no business being conscious.' },
        { to: 'motor',         text: 'The motor cortex issues each correction separately, one at a time.' },
        { to: 'cerebellum',    text: 'The cerebellum measures the error between what you intended and what happened, and quietly adjusts the model. Thousands of times.' },
        { to: 'basalganglia',  text: 'With repetition the basal ganglia chunk the whole sequence — balance, pedal, steer, correct — into a single unit that can be called as one.' },
        { to: 'motor',         text: 'Now the motor cortex just triggers the chunk. Prefrontal cortex is free, so you can hold a conversation while riding.' },
        { to: 'medulla',       text: 'The command descends the brainstem as it always did.' },
        { to: 'muscles',       text: 'You never forget how to ride a bike — because it is not filed where facts are. Amnesic patients who cannot recall learning a skill still perform it perfectly.' }
      ]
    }
  ];

  /* Guided tour: a fixed order through the atlas for a first read-through. */
  global.BRAIN.TOUR = [
    'frontal', 'parietal', 'temporal', 'occipital',
    'thalamus', 'hippocampus', 'amygdala', 'hypothalamus',
    'basalganglia', 'corpuscallosum',
    'midbrain', 'pons', 'medulla', 'cerebellum'
  ];
})(window);
